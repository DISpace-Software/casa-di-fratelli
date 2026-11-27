using Microsoft.EntityFrameworkCore;
using SeatMap.Api.Data;
using SeatMap.Api.Models;
using SeatMap.Api.Platform.Data;
using SeatMap.Api.Services;
using SeatMap.Api.Services.FloorPlans;
using SeatMap.Api.Services.Reservations;
using SeatMap.Api.Services.Waitlist;
using System.Text.Json;

namespace SeatMap.Api.Application.Waitlist;

/// <summary>Staff waitlist workflows; settings and cancellation share a transaction with their audit records.</summary>
/// <remarks>HttpContext is retained solely for the existing audit actor adapter; it is not used for authorization.</remarks>
public sealed class AdministerWaitlist(
    AppDbContext db,
    WaitlistService waitlist,
    AuditService audit,
    FloorPlanService plans,
    PlatformDbContext? platform = null)
{
    public async Task<object> ListAsync(DateOnly? date)
    {
        var query = db.WaitlistEntries.AsNoTracking();
        if (date != null) query = query.Where(x => x.Date == date);
        var rows = await query.OrderByDescending(x => x.CreatedAtUtc).Take(300).ToListAsync();
        var bookingIds = rows.Where(x => x.ReservationId != null).Select(x => x.ReservationId!.Value).ToArray();
        var arrived = await db.Reservations.CountAsync(x => bookingIds.Contains(x.Id) && (x.IsArrived || x.HasCompletedVisit));
        return new
        {
            settings = await waitlist.SettingsAsync(),
            serverTimeUtc = DateTime.UtcNow,
            entries = rows.Select(entry => new { entry = WaitlistService.Describe(entry), entry.GuestName, entry.Phone, entry.Email, entry.NotificationAttempts }),
            zones = (await plans.GetAsync()).Zones,
            metrics = new { arrived, requests = rows.Count, booked = rows.Count(x => x.Status == "booked"), waiting = rows.Count(x => x.Status == "waiting"), offered = rows.Count(x => x.Status == "offered") }
        };
    }
    public sealed record StaffJoinRequest(string Email, WaitlistRequest Request, bool GuestRequested);
    public async Task<ReservationBookingResult> JoinAsync(StaffJoinRequest request, HttpContext auditContext)
    {
        if (!request.GuestRequested || string.IsNullOrWhiteSpace(request.Email)) return ReservationBookingResult.Invalid(null);
        // A disabled platform is distinct from an unknown or unverified guest.
        if (platform == null) return ReservationBookingResult.Unavailable();
        var email = request.Email.Trim().ToLowerInvariant();
        var guest = await platform.GuestProfiles.AsNoTracking().SingleOrDefaultAsync(x => x.Email == email && x.EmailVerifiedAtUtc != null);
        if (guest == null) return ReservationBookingResult.Invalid(new { code = "VERIFIED_PROFILE_REQUIRED" });
        var result = await waitlist.JoinAsync(guest, request.Request);
        // Enrollment commits in JoinAsync; this existing follow-up audit is not atomic with it.
        if (result.Kind == ReservationBookingResultKind.Success)
            await audit.RecordAsync(auditContext, "waitlist.staff-join", "Waitlist", guest.Id.ToString(), after: new { request.GuestRequested, request.Request });
        return result;
    }
    public async Task<ReservationBookingResult> UpdateSettingsAsync(WaitlistSettings settings, HttpContext auditContext)
    {
        if (settings.OfferMinutes is < 3 or > 10) return ReservationBookingResult.Invalid(new { code = "OFFER_MINUTES_INVALID" });
        await using var tx = await RestaurantWriteTransaction.BeginAsync(db);
        var before = await waitlist.SettingsAsync();
        var item = await db.AppSettings.SingleOrDefaultAsync(x => x.Key == WaitlistService.SettingsKey);
        if (item == null)
        {
            item = new AppSetting { Key = WaitlistService.SettingsKey };
            db.AppSettings.Add(item);
        }
        item.Value = JsonSerializer.Serialize(settings, WaitlistService.Json);
        item.UpdatedAtUtc = DateTime.UtcNow;
        await audit.RecordAsync(auditContext, "waitlist.settings", "Waitlist", "settings", before, settings);
        await tx.CommitAsync();
        return ReservationBookingResult.Success(settings);
    }
    public sealed record CloseRequest(string Reason);
    public async Task<ReservationBookingResult> CancelAsync(Guid id, CloseRequest request, HttpContext auditContext)
    {
        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Length > 300) return ReservationBookingResult.Invalid(null);
        await using var tx = await RestaurantWriteTransaction.BeginAsync(db);
        var entry = await db.WaitlistEntries.SingleOrDefaultAsync(x => x.Id == id);
        if (entry == null) return ReservationBookingResult.NotFound(null);
        if (entry.Status == "booked") return ReservationBookingResult.Conflict(new { code = "ALREADY_BOOKED" });
        var before = WaitlistService.Describe(entry);
        entry.Status = "cancelled";
        entry.ExpiresAtUtc = null;
        entry.UpdatedAtUtc = DateTime.UtcNow;
        await audit.RecordAsync(auditContext, "waitlist.cancel", "Waitlist", id.ToString(), before, new { request.Reason, entry = WaitlistService.Describe(entry) });
        await tx.CommitAsync();
        return ReservationBookingResult.Success(WaitlistService.Describe(entry));
    }
}
