using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using SeatMap.Api.Data;
using SeatMap.Api.Filters;
using SeatMap.Api.Models;
using SeatMap.Api.Platform.Auth;
using SeatMap.Api.Platform.Models;
using SeatMap.Api.Services;
using SeatMap.Api.Services.Reservations;
using SeatMap.Api.Services.Tenancy;
using SeatMap.Api.Services.Waitlist;
using System.Text.Json;

namespace SeatMap.Api.Controllers;

[ApiController, Route("api/v1/restaurants/{restaurantId}/waitlist"), RequestSizeLimit(8192)]
[GuestPlatformAvailable, GuestAuthErrors, GuestAuthorize, EnableRateLimiting("guest-reservations")]
public sealed class WaitlistController(AppDbContext db, WaitlistService waitlist, ReservationBookingService booking, TenantBrandingService branding) : ControllerBase
{
    private GuestProfile Guest => ((GuestSession)HttpContext.Items[typeof(GuestSession)]!).Profile;
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var entries = await db.WaitlistEntries.AsNoTracking().Where(x => x.GuestId == Guest.Id).OrderByDescending(x => x.CreatedAtUtc).Take(100).ToListAsync();
        return Ok(new { entries = entries.Select(WaitlistService.Describe), settings = await waitlist.SettingsAsync(), serverTimeUtc = DateTime.UtcNow, notificationChannel = "email" });
    }
    [HttpPost] public async Task<IActionResult> Join(WaitlistRequest request) => (await waitlist.JoinAsync(Guest, request)).ToActionResult();
    [HttpPut("{id:guid}")] public async Task<IActionResult> Edit(Guid id, WaitlistRequest request) => (await waitlist.ChangeAsync(id, Guest.Id, "edit", request)).ToActionResult();
    [HttpPost("{id:guid}/{operation:regex(^(cancel|decline|resume)$)}")]
    public async Task<IActionResult> Change(Guid id, string operation) => (await waitlist.ChangeAsync(id, Guest.Id, operation)).ToActionResult();
    public sealed record AcceptOfferRequest(Guid OfferId);
    [HttpPost("{id:guid}/confirm")]
    public async Task<IActionResult> Confirm(Guid id, AcceptOfferRequest request)
    {
        if (Guest.EmailVerifiedAtUtc == null) return BadRequest(new { code = "VERIFIED_PROFILE_REQUIRED" });
        var result = await booking.CreateAsync(new(), acceptance: new(id, Guest.Id, request.OfferId));
        if (result.Kind != ReservationBookingResultKind.Success) return result.ToActionResult();
        // Recover a lost success response without ever creating a second booking.
        // Only the authenticated owner can obtain a fresh management capability.
        await using var tx = await RestaurantWriteTransaction.BeginAsync(db);
        var entry = await db.WaitlistEntries.SingleAsync(x => x.Id == id && x.GuestId == Guest.Id);
        var reservation = await db.Reservations.Include(x => x.Tables).SingleOrDefaultAsync(x => x.Id == entry.ReservationId);
        if (reservation == null) return NotFound(new { code = "NOT_FOUND" });
        var token = GuestReservationService.CreateToken();
        reservation.GuestManagementTokenHash = GuestReservationService.HashToken(token);
        await db.SaveChangesAsync(); await tx.CommitAsync();
        return Ok(new { reservation.Id, reservation.GuestName, reservation.GuestCount, reservation.ReservedDate, reservation.ReservedTime,
            reservation.Area, reservation.Status, ManagementToken = token, TableIds = reservation.Tables.Select(t => t.TableCode),
            GuestReservation = GuestReservationService.Describe(reservation, await branding.GetAsync(), DateTime.UtcNow) });
    }
}

[ApiController, Route("api/waitlist"), RequestSizeLimit(8192)]
[AdminAuthorize(AdminRoleAccess.Owner, AdminRoleAccess.Administrator, AdminRoleAccess.Developer)]
public sealed class AdminWaitlistController(AppDbContext db, WaitlistService waitlist, AuditService audit, IServiceProvider services) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] DateOnly? date)
    {
        Response.Headers.CacheControl = "no-store";
        var query = db.WaitlistEntries.AsNoTracking();
        if (date != null) query = query.Where(x => x.Date == date);
        var rows = await query.OrderByDescending(x => x.CreatedAtUtc).Take(300).ToListAsync();
        var bookingIds = rows.Where(x => x.ReservationId != null).Select(x => x.ReservationId!.Value).ToArray();
        var arrived = await db.Reservations.CountAsync(x => bookingIds.Contains(x.Id) && (x.IsArrived || x.HasCompletedVisit));
        return Ok(new { settings = await waitlist.SettingsAsync(), serverTimeUtc = DateTime.UtcNow,
            entries = rows.Select(e => new { entry = WaitlistService.Describe(e), e.GuestName, e.Phone, e.Email, e.NotificationAttempts }),
            zones = (await services.GetRequiredService<SeatMap.Api.Services.FloorPlans.FloorPlanService>().GetAsync()).Zones,
            metrics = new { arrived, requests = rows.Count, booked = rows.Count(x => x.Status == "booked"), waiting = rows.Count(x => x.Status == "waiting"), offered = rows.Count(x => x.Status == "offered") } });
    }
    public sealed record StaffJoinRequest(string Email, WaitlistRequest Request, bool GuestRequested);
    [HttpPost]
    public async Task<IActionResult> Join(StaffJoinRequest request)
    {
        if (!request.GuestRequested || string.IsNullOrWhiteSpace(request.Email)) return BadRequest();
        var platform = services.GetService<SeatMap.Api.Platform.Data.PlatformDbContext>();
        if (platform == null) return StatusCode(503);
        var email = request.Email.Trim().ToLowerInvariant();
        var guest = await platform.GuestProfiles.AsNoTracking().SingleOrDefaultAsync(x => x.Email == email && x.EmailVerifiedAtUtc != null);
        if (guest == null) return BadRequest(new { code = "VERIFIED_PROFILE_REQUIRED" });
        var result = await waitlist.JoinAsync(guest, request.Request);
        if (result.Kind == ReservationBookingResultKind.Success)
            await audit.RecordAsync(HttpContext, "waitlist.staff-join", "Waitlist", guest.Id.ToString(), after: new { request.GuestRequested, request.Request });
        return result.ToActionResult();
    }
    [HttpPut("settings")]
    public async Task<IActionResult> Settings(WaitlistSettings settings)
    {
        if (settings.OfferMinutes is < 3 or > 10) return BadRequest(new { code = "OFFER_MINUTES_INVALID" });
        await using var tx = await RestaurantWriteTransaction.BeginAsync(db);
        var before = await waitlist.SettingsAsync();
        var item = await db.AppSettings.SingleOrDefaultAsync(x => x.Key == WaitlistService.SettingsKey);
        if (item == null) { item = new AppSetting { Key = WaitlistService.SettingsKey }; db.AppSettings.Add(item); }
        item.Value = JsonSerializer.Serialize(settings, WaitlistService.Json); item.UpdatedAtUtc = DateTime.UtcNow;
        await audit.RecordAsync(HttpContext, "waitlist.settings", "Waitlist", "settings", before, settings);
        await tx.CommitAsync(); return Ok(settings);
    }
    public sealed record CloseRequest(string Reason);
    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, CloseRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Length > 300) return BadRequest();
        await using var tx = await RestaurantWriteTransaction.BeginAsync(db);
        var e = await db.WaitlistEntries.SingleOrDefaultAsync(x => x.Id == id);
        if (e == null) return NotFound();
        if (e.Status == "booked") return Conflict(new { code = "ALREADY_BOOKED" });
        var before = WaitlistService.Describe(e);
        e.Status = "cancelled"; e.ExpiresAtUtc = null; e.UpdatedAtUtc = DateTime.UtcNow;
        await audit.RecordAsync(HttpContext, "waitlist.cancel", "Waitlist", id.ToString(), before, new { request.Reason, entry = WaitlistService.Describe(e) });
        await tx.CommitAsync(); return Ok(WaitlistService.Describe(e));
    }
}

// One authenticated inbox request covers all restaurants without exposing guest IDs
// or exhausting the rate limit as more restaurants join SeatMap.
[ApiController, Route("api/v1/guest/waitlist"), SeatMap.Api.Platform.PlatformEndpoint]
[GuestPlatformAvailable, GuestAuthErrors, GuestAuthorize, EnableRateLimiting("guest-reservations")]
public sealed class GuestWaitlistInboxController(IServiceProvider services,
    Microsoft.Extensions.Options.IOptions<TenantResolutionOptions> tenancy,
    ILogger<GuestWaitlistInboxController> logger) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var guest = ((GuestSession)HttpContext.Items[typeof(GuestSession)]!).Profile;
        var entries = new List<System.Text.Json.Nodes.JsonNode>();
        var failed = new List<string>();
        foreach (var tenant in tenancy.Value.Tenants.Where(x => x.IsActive))
        {
            try
            {
                using var scope = services.CreateScope();
                scope.ServiceProvider.GetRequiredService<CurrentTenant>().Resolve(tenant);
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var rows = await db.WaitlistEntries.AsNoTracking().Where(x => x.GuestId == guest.Id).OrderByDescending(x => x.CreatedAtUtc).Take(100).ToListAsync(HttpContext.RequestAborted);
                foreach (var row in rows)
                {
                    var node = JsonSerializer.SerializeToNode(WaitlistService.Describe(row), WaitlistService.Json)!;
                    node["restaurantId"] = tenant.Id;
                    node["restaurantName"] = tenant.Name;
                    entries.Add(node);
                }
            }
            catch (Exception error) when (!HttpContext.RequestAborted.IsCancellationRequested)
            { logger.LogWarning(error, "Waitlist inbox unavailable. TenantId={TenantId}", tenant.Id); failed.Add(tenant.Id); }
        }
        return Ok(new { entries, failedRestaurantIds = failed, serverTimeUtc = DateTime.UtcNow });
    }
}
