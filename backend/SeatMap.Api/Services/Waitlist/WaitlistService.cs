using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SeatMap.Api.Data;
using SeatMap.Api.Models;
using SeatMap.Api.Platform.Models;
using SeatMap.Api.Services.FloorPlans;
using SeatMap.Api.Services.Reservations;
using SeatMap.Api.Services.Tenancy;

namespace SeatMap.Api.Services.Waitlist;

public sealed class WaitlistService(AppDbContext db, FloorPlanService plans, SeasonalZoneService zones,
    RestaurantClosureService closures, ReservationConflictService conflicts, TenantBrandingService branding, TimeProvider clock)
{
    public const string SettingsKey = "waitlist:v1";
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public async Task<WaitlistSettings> SettingsAsync() => JsonSerializer.Deserialize<WaitlistSettings>(
        await db.AppSettings.Where(x => x.Key == SettingsKey).Select(x => x.Value).SingleOrDefaultAsync() ?? "{}", Json) ?? new();
    public static List<string> Times(WaitlistEntry entry) => JsonSerializer.Deserialize<List<string>>(entry.TimesJson) ?? [];
    public static object Describe(WaitlistEntry e) => new { e.Id, e.Date, e.Guests, e.Area, Times = Times(e), e.Status,
        e.OfferId, e.OfferTime, TableIds = JsonSerializer.Deserialize<List<string>>(e.TableIdsJson), e.ExpiresAtUtc, e.ReservationId, e.CreatedAtUtc, e.EmailSentAtUtc, e.PushSentAtUtc };
    private DateTime UtcNow => clock.GetUtcNow().UtcDateTime;

    public async Task<string?> ValidateAsync(WaitlistRequest request)
    {
        var brand = await branding.GetAsync();
        var now = ReservationTimeRules.GetRestaurantNow(brand, clock);
        var plan = await plans.GetAsync();
        if (request.Guests < 1 || request.Guests > plan.PublicMaxGuests) return "PARTY_SIZE";
        if (request.Date < DateOnly.FromDateTime(now) || request.Date > DateOnly.FromDateTime(now).AddDays(brand.PublicMaxReservationDaysAhead)) return "DATE_INVALID";
        if (request.Area == null || !plan.Zones.Any(x => x.Id == request.Area && x.IsActive) || (await zones.GetClosedAreasAsync()).Contains(request.Area)) return "ZONE_CLOSED";
        if (RestaurantClosureService.Contains(await closures.GetAsync(), request.Date)) return "RESTAURANT_CLOSED";
        if (request.Times == null || request.Times.Count is < 1 or > 5 || request.Times.Distinct().Count() != request.Times.Count) return "TIMES_INVALID";
        foreach (var value in request.Times)
            if (!TimeOnly.TryParseExact(value, "HH:mm", out var parsed) || parsed.Minute % 15 != 0 ||
                parsed < TimeOnly.Parse(brand.WalkInOpeningTime) || !ReservationTimeRules.IsAllowed(value, false, brand) ||
                ReservationTimeRules.IsPast(request.Date, value, now) || ReservationTimeRules.IsTooSoon(request.Date, value, now, brand.PublicLeadMinutes + 5)) return "TIMES_INVALID";
        var selections = plan.Tables.Select(t => new List<string> { t.Id }).Concat(plan.Combinations);
        foreach (var selection in selections)
            if ((await plans.SelectAsync(selection, request.Area, request.Guests, publicBooking: true)).Error == null) return null;
        return "NO_SUITABLE_TABLE";
    }

    public async Task<ReservationBookingResult> JoinAsync(GuestProfile guest, WaitlistRequest request)
    {
        await using var tx = await RestaurantWriteTransaction.BeginAsync(db);
        if (guest.EmailVerifiedAtUtc == null || string.IsNullOrWhiteSpace(guest.Email) || string.IsNullOrWhiteSpace(guest.Phone)) return ReservationBookingResult.Invalid(new { code = "VERIFIED_PROFILE_REQUIRED" });
        if (!(await SettingsAsync()).Enabled) return ReservationBookingResult.Conflict(new { code = "WAITLIST_PAUSED" });
        if (await ValidateAsync(request) is { } error) return ReservationBookingResult.Invalid(new { code = error });
        var existing = await db.WaitlistEntries.FirstOrDefaultAsync(x => x.GuestId == guest.Id && x.Date == request.Date && (x.Status == "waiting" || x.Status == "offered" || x.Status == "paused"));
        if (existing != null) return ReservationBookingResult.Success(Describe(existing));
        if (await db.WaitlistEntries.CountAsync(x => x.Date == request.Date && (x.Status == "waiting" || x.Status == "offered" || x.Status == "paused")) >= 200)
            return ReservationBookingResult.RateLimited(new { code = "WAITLIST_LIMIT" });
        if (await db.WaitlistEntries.CountAsync(x => x.GuestId == guest.Id && (x.Status == "waiting" || x.Status == "offered" || x.Status == "paused")) >= 3) return ReservationBookingResult.RateLimited(new { code = "WAITLIST_LIMIT" });
        var e = new WaitlistEntry { GuestId = guest.Id, GuestName = guest.DisplayName, Email = guest.Email, Phone = guest.Phone,
            Language = guest.PreferredLanguage, Date = request.Date, Guests = request.Guests, Area = request.Area,
            TimesJson = JsonSerializer.Serialize(request.Times.Order()), CreatedAtUtc = UtcNow, QueueAtUtc = UtcNow, UpdatedAtUtc = UtcNow };
        db.WaitlistEntries.Add(e);
        await db.SaveChangesAsync(); await tx.CommitAsync();
        return ReservationBookingResult.Success(Describe(e));
    }

    public async Task<ReservationBookingResult> ChangeAsync(Guid id, Guid guestId, string action, WaitlistRequest? request = null)
    {
        await using var tx = await RestaurantWriteTransaction.BeginAsync(db);
        var e = await db.WaitlistEntries.SingleOrDefaultAsync(x => x.Id == id && x.GuestId == guestId);
        if (e == null) return ReservationBookingResult.NotFound(new { code = "NOT_FOUND" });
        if (e.Status is "booked" or "expired" or "cancelled") return ReservationBookingResult.Conflict(new { code = "WAITLIST_CLOSED" });
        switch (action)
        {
            case "cancel": e.Status = "cancelled"; break;
            case "decline": e.Status = "paused"; break;
            case "resume":
            case "edit":
                request ??= new(e.Date, e.Guests, e.Area, Times(e));
                if (!(await SettingsAsync()).Enabled) return ReservationBookingResult.Conflict(new { code = "WAITLIST_PAUSED" });
                if (await ValidateAsync(request) is { } error) return ReservationBookingResult.Invalid(new { code = error });
                if (await db.WaitlistEntries.AnyAsync(x => x.Id != id && x.GuestId == guestId && x.Date == request.Date && (x.Status == "waiting" || x.Status == "offered" || x.Status == "paused")))
                    return ReservationBookingResult.Conflict(new { code = "WAITLIST_EXISTS" });
                if (await db.WaitlistEntries.CountAsync(x => x.Id != id && x.Date == request.Date && (x.Status == "waiting" || x.Status == "offered" || x.Status == "paused")) >= 200 ||
                    await db.WaitlistEntries.CountAsync(x => x.Id != id && x.GuestId == guestId && (x.Status == "waiting" || x.Status == "offered" || x.Status == "paused")) >= 3)
                    return ReservationBookingResult.RateLimited(new { code = "WAITLIST_LIMIT" });
                e.Date = request.Date; e.Guests = request.Guests; e.Area = request.Area;
                e.TimesJson = JsonSerializer.Serialize(request.Times.Order()); e.Status = "waiting"; e.QueueAtUtc = UtcNow;
                break;
            default: return ReservationBookingResult.Invalid(new { code = "INVALID_ACTION" });
        }
        e.ExpiresAtUtc = null; e.OfferId = null; e.UpdatedAtUtc = UtcNow;
        await db.SaveChangesAsync(); await tx.CommitAsync(); return ReservationBookingResult.Success(Describe(e));
    }

    // The same per-restaurant advisory lock protects regular bookings and staff edits.
    // Every offer is persisted before delivery. Restarts do not lose its deadline.
    public async Task TickAsync()
    {
        await using var tx = await RestaurantWriteTransaction.BeginAsync(db);
        var now = UtcNow;
        var brand = await branding.GetAsync();
        var local = ReservationTimeRules.GetRestaurantNow(brand, clock);
        var settings = await SettingsAsync();
        var entries = await db.WaitlistEntries.Where(x => x.Status == "waiting" || x.Status == "offered" || x.Status == "paused").OrderBy(x => x.QueueAtUtc).ThenBy(x => x.Id).ToListAsync();
        var closed = await closures.GetAsync();
        var closedAreas = await zones.GetClosedAreasAsync();
        foreach (var e in entries)
        {
            if (e.Date < DateOnly.FromDateTime(local) || Times(e).All(t => ReservationTimeRules.IsPast(e.Date, t, local) || ReservationTimeRules.IsTooSoon(e.Date, t, local, brand.PublicLeadMinutes)))
                e.Status = "expired";
            else if (e.Status == "offered" && e.ExpiresAtUtc <= now) e.Status = "paused";
            // A closure or map edit can invalidate an offer. Do not keep a misleading countdown.
            else if (e.Status == "offered" && (RestaurantClosureService.Contains(closed, e.Date) || closedAreas.Contains(e.Area) ||
                (await plans.SelectAsync(JsonSerializer.Deserialize<List<string>>(e.TableIdsJson), e.Area, e.Guests, publicBooking: true)).Error != null ||
                await IsHeldAsync(e.Date, JsonSerializer.Deserialize<List<string>>(e.TableIdsJson) ?? []))) e.Status = "paused";
            if (e.Status != "offered") e.ExpiresAtUtc = null;
        }
        await db.SaveChangesAsync();
        if (settings.Enabled)
        {
            var plan = await plans.GetAsync();
            foreach (var e in entries.Where(x => x.Status == "waiting"))
            {
                if (RestaurantClosureService.Contains(closed, e.Date) || closedAreas.Contains(e.Area)) continue;
                var choices = plan.Tables.Select(t => new List<string> { t.Id }).Concat(plan.Combinations)
                    .OrderBy(ids => plan.Tables.Where(t => ids.Contains(t.Id)).Sum(t => t.Seats)).ToList();
                foreach (var slot in Times(e).Order())
                {
                    if (ReservationTimeRules.IsPast(e.Date, slot, local) || ReservationTimeRules.IsTooSoon(e.Date, slot, local, brand.PublicLeadMinutes + settings.OfferMinutes)) continue;
                    foreach (var ids in choices)
                    {
                        if ((await plans.SelectAsync(ids, e.Area, e.Guests, publicBooking: true)).Error != null || await IsHeldAsync(e.Date, ids)) continue;
                        if (await conflicts.FindTableConflictAsync(e.Date, slot, ids) != null) continue;
                        e.Status = "offered"; e.OfferId = Guid.NewGuid(); e.TableIdsJson = JsonSerializer.Serialize(ids); e.OfferTime = slot;
                        e.ExpiresAtUtc = now.AddMinutes(settings.OfferMinutes); e.UpdatedAtUtc = now;
                        e.NotificationAttempts = 0; e.EmailSentAtUtc = null; e.PushSentAtUtc = null; e.NotificationLeaseUntilUtc = null;
                        // Save before evaluating the next candidate so it sees this hold.
                        await db.SaveChangesAsync(); break;
                    }
                    if (e.Status == "offered") break;
                }
            }
        }
        await db.SaveChangesAsync(); await tx.CommitAsync();
    }
    private async Task<bool> IsHeldAsync(DateOnly date, List<string> ids)
    {
        var holds = await db.PublicTableHolds.Where(x => x.ReservedDate == date).Select(x => x.TableIdsJson).ToListAsync();
        return holds.SelectMany(PublicTableHoldSelection.DeserializeTableIds).Any(id => ids.Contains(id, StringComparer.OrdinalIgnoreCase));
    }
}
