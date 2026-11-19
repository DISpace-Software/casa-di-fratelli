using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SeatMap.Api.Data;
using SeatMap.Api.Models;
using SeatMap.Api.Services.Tenancy;

namespace SeatMap.Api.Services.Reservations;

public sealed record GuestReservationStatus(int Id, string Status, DateOnly ReservedDate,
    string ReservedTime, DateTime? StartsAtUtc, DateTime? CancellationDeadlineUtc,
    int CancellationLeadMinutes, bool CanCancel, string RestaurantPhone, int GuestCount, string[] TableIds);

// A capability belongs to exactly one booking in exactly one restaurant DB.
// Contact details or an integer reservation ID never prove ownership.
public sealed class GuestReservationService(AppDbContext db, TenantBrandingService branding, TimeProvider time)
{
    public static string CreateToken() => Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
    public static string HashToken(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    public static DateTime? StartsAtUtc(Reservation reservation, TenantBrandingSettings brand)
    {
        if (!TimeOnly.TryParseExact(reservation.ReservedTime, "HH:mm", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var hour)) return null;
        var zone = TimeZoneInfo.FindSystemTimeZoneById(brand.TimeZoneId);
        var local = reservation.ReservedDate.ToDateTime(hour, DateTimeKind.Unspecified);
        if (zone.IsInvalidTime(local)) return null;
        // Use the earlier occurrence if a restaurant ever books during the DST overlap.
        if (zone.IsAmbiguousTime(local))
            return zone.GetAmbiguousTimeOffsets(local).Select(offset => new DateTimeOffset(local, offset).UtcDateTime).Min();
        return TimeZoneInfo.ConvertTimeToUtc(local, zone);
    }

    public static GuestReservationStatus Describe(Reservation reservation, TenantBrandingSettings brand, DateTime utcNow)
    {
        var start = StartsAtUtc(reservation, brand);
        var deadline = start?.AddMinutes(-brand.GuestCancellationLeadMinutes);
        var active = reservation.Status is "Approved" or "Pending" or "AwaitingEmailConfirmation";
        return new(reservation.Id, reservation.Status, reservation.ReservedDate, reservation.ReservedTime,
            start, deadline, brand.GuestCancellationLeadMinutes,
            active && !reservation.IsDeleted && !reservation.IsArrived && !reservation.HasCompletedVisit &&
            !reservation.IsNoShow && !reservation.IsWalkIn && !reservation.CreatedByAdmin && deadline.HasValue && utcNow <= deadline,
            brand.Phone, reservation.GuestCount, reservation.Tables.Select(t => t.TableCode).ToArray());
    }

    private async Task<Reservation?> FindAsync(int id, string? token)
    {
        if (id < 1 || token == null || token.Length != 64 || !token.All(Uri.IsHexDigit)) return null;
        var reservation = await db.Reservations.Include(x => x.Tables).SingleOrDefaultAsync(x => x.Id == id);
        if (reservation?.GuestManagementTokenHash is not { Length: 64 } expected || reservation.CreatedByAdmin) return null;
        return CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(expected), Encoding.ASCII.GetBytes(HashToken(token)))
            ? reservation : null;
    }

    public async Task<ReservationBookingResult> GetAsync(int id, string? token)
    {
        var reservation = await FindAsync(id, token);
        if (reservation == null) return Missing();
        var status = Describe(reservation, await branding.GetAsync(), time.GetUtcNow().UtcDateTime);
        if (status.CanCancel && await HasOrdersAsync(id)) status = status with { CanCancel = false };
        return ReservationBookingResult.Success(status);
    }

    public async Task<ReservationBookingResult> CancelAsync(int id, string? token)
    {
        await using var transaction = await RestaurantWriteTransaction.BeginAsync(db);
        var reservation = await FindAsync(id, token);
        if (reservation == null) return Missing();
        var brand = await branding.GetAsync();
        var now = time.GetUtcNow().UtcDateTime;
        var status = Describe(reservation, brand, now);
        // Safe to retry after a lost response, including after the deadline.
        if (reservation.Status == "Cancelled") return ReservationBookingResult.Success(status);
        if (!status.CanCancel || await HasOrdersAsync(id))
            return ReservationBookingResult.Conflict(new { code = "CONTACT_RESTAURANT", message = "Please contact the restaurant to change this reservation.", reservation = status with { CanCancel = false } });
        var before = reservation.Status;
        reservation.Status = "Cancelled";
        reservation.DeletedAtUtc = now;
        reservation.DeletedByAdminUserId = null;
        reservation.DeletedByAdminName = null;
        reservation.DeleteReason = "Cancelled by guest";
        reservation.EmailConfirmationTokenHash = null;
        reservation.EmailConfirmationExpiresAtUtc = null;
        reservation.OrderAccessToken = null;
        db.AuditLogs.Add(new AuditLog {
            Action = "guest-cancel", Entity = "Reservation", EntityId = id.ToString(CultureInfo.InvariantCulture),
            AdminName = "Guest", BeforeJson = JsonSerializer.Serialize(new { Status = before }),
            AfterJson = JsonSerializer.Serialize(new { Status = "Cancelled" }), CreatedAtUtc = now
        });
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return ReservationBookingResult.Success(Describe(reservation, brand, now));
    }

    private Task<bool> HasOrdersAsync(int id) => db.DiningOrders.AnyAsync(x => x.ReservationId == id && !x.IsDeleted && x.Status != "Cancelled");
    private static ReservationBookingResult Missing() => ReservationBookingResult.NotFound(new { code = "RESERVATION_NOT_FOUND", message = "Reservation not found or access is invalid." });
}
