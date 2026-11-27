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
    public static object Describe(WaitlistEntry entry) => new { entry.Id, entry.Date, entry.Guests, entry.Area, Times = Times(entry), entry.Status,
        entry.OfferId, entry.OfferTime, TableIds = JsonSerializer.Deserialize<List<string>>(entry.TableIdsJson), entry.ExpiresAtUtc, entry.ReservationId, entry.CreatedAtUtc, entry.EmailSentAtUtc, entry.PushSentAtUtc };
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
        var entry = new WaitlistEntry { GuestId = guest.Id, GuestName = guest.DisplayName, Email = guest.Email, Phone = guest.Phone,
            Language = guest.PreferredLanguage, Date = request.Date, Guests = request.Guests, Area = request.Area,
            TimesJson = JsonSerializer.Serialize(request.Times.Order()), CreatedAtUtc = UtcNow, QueueAtUtc = UtcNow, UpdatedAtUtc = UtcNow };
        db.WaitlistEntries.Add(entry);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return ReservationBookingResult.Success(Describe(entry));
    }

    public async Task<ReservationBookingResult> ChangeAsync(Guid id, Guid guestId, string action, WaitlistRequest? request = null)
    {
        await using var tx = await RestaurantWriteTransaction.BeginAsync(db);
        var entry = await db.WaitlistEntries.SingleOrDefaultAsync(x => x.Id == id && x.GuestId == guestId);
        if (entry == null) return ReservationBookingResult.NotFound(new { code = "NOT_FOUND" });
        if (entry.Status is "booked" or "expired" or "cancelled") return ReservationBookingResult.Conflict(new { code = "WAITLIST_CLOSED" });
        switch (action)
        {
            case "cancel":
                entry.Status = "cancelled";
                break;
            case "decline":
                entry.Status = "paused";
                break;
            case "resume":
            case "edit":
                request ??= new(entry.Date, entry.Guests, entry.Area, Times(entry));
                if (!(await SettingsAsync()).Enabled) return ReservationBookingResult.Conflict(new { code = "WAITLIST_PAUSED" });
                if (await ValidateAsync(request) is { } error) return ReservationBookingResult.Invalid(new { code = error });
                if (await db.WaitlistEntries.AnyAsync(x => x.Id != id && x.GuestId == guestId && x.Date == request.Date && (x.Status == "waiting" || x.Status == "offered" || x.Status == "paused")))
                    return ReservationBookingResult.Conflict(new { code = "WAITLIST_EXISTS" });
                if (await db.WaitlistEntries.CountAsync(x => x.Id != id && x.Date == request.Date && (x.Status == "waiting" || x.Status == "offered" || x.Status == "paused")) >= 200 ||
                    await db.WaitlistEntries.CountAsync(x => x.Id != id && x.GuestId == guestId && (x.Status == "waiting" || x.Status == "offered" || x.Status == "paused")) >= 3)
                    return ReservationBookingResult.RateLimited(new { code = "WAITLIST_LIMIT" });
                entry.Date = request.Date;
                entry.Guests = request.Guests;
                entry.Area = request.Area;
                entry.TimesJson = JsonSerializer.Serialize(request.Times.Order());
                entry.Status = "waiting";
                entry.QueueAtUtc = UtcNow;
                break;
            default: return ReservationBookingResult.Invalid(new { code = "INVALID_ACTION" });
        }
        entry.ExpiresAtUtc = null;
        entry.OfferId = null;
        entry.UpdatedAtUtc = UtcNow;
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return ReservationBookingResult.Success(Describe(entry));
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
        foreach (var entry in entries)
        {
            if (entry.Date < DateOnly.FromDateTime(local) || Times(entry).All(t => ReservationTimeRules.IsPast(entry.Date, t, local) || ReservationTimeRules.IsTooSoon(entry.Date, t, local, brand.PublicLeadMinutes)))
                entry.Status = "expired";
            else if (entry.Status == "offered" && entry.ExpiresAtUtc <= now) entry.Status = "paused";
            // A closure or map edit can invalidate an offer. Do not keep a misleading countdown.
            else if (entry.Status == "offered" && (RestaurantClosureService.Contains(closed, entry.Date) || closedAreas.Contains(entry.Area) ||
                (await plans.SelectAsync(JsonSerializer.Deserialize<List<string>>(entry.TableIdsJson), entry.Area, entry.Guests, publicBooking: true)).Error != null ||
                await IsHeldAsync(entry.Date, JsonSerializer.Deserialize<List<string>>(entry.TableIdsJson) ?? []))) entry.Status = "paused";
            if (entry.Status != "offered") entry.ExpiresAtUtc = null;
        }
        await db.SaveChangesAsync();
        if (settings.Enabled)
        {
            var plan = await plans.GetAsync();
            foreach (var entry in entries.Where(x => x.Status == "waiting"))
            {
                if (RestaurantClosureService.Contains(closed, entry.Date) || closedAreas.Contains(entry.Area)) continue;
                var choices = plan.Tables.Select(t => new List<string> { t.Id }).Concat(plan.Combinations)
                    .OrderBy(ids => plan.Tables.Where(t => ids.Contains(t.Id)).Sum(t => t.Seats)).ToList();
                foreach (var slot in Times(entry).Order())
                {
                    if (ReservationTimeRules.IsPast(entry.Date, slot, local) || ReservationTimeRules.IsTooSoon(entry.Date, slot, local, brand.PublicLeadMinutes + settings.OfferMinutes)) continue;
                    foreach (var ids in choices)
                    {
                        if ((await plans.SelectAsync(ids, entry.Area, entry.Guests, publicBooking: true)).Error != null || await IsHeldAsync(entry.Date, ids)) continue;
                        if (await conflicts.FindTableConflictAsync(entry.Date, slot, ids) != null) continue;
                        entry.OfferTables(ids, slot, now, settings.OfferMinutes);
                        // Save before evaluating the next candidate so it sees this hold.
                        await db.SaveChangesAsync();
                        break;
                    }
                    if (entry.Status == "offered") break;
                }
            }
        }
        await db.SaveChangesAsync();
        await tx.CommitAsync();
    }
    private async Task<bool> IsHeldAsync(DateOnly date, List<string> ids)
    {
        var holds = await db.PublicTableHolds.Where(x => x.ReservedDate == date).Select(x => x.TableIdsJson).ToListAsync();
        return holds.SelectMany(PublicTableHoldSelection.DeserializeTableIds).Any(id => ids.Contains(id, StringComparer.OrdinalIgnoreCase));
    }
}
