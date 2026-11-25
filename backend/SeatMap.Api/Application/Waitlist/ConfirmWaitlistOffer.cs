using Microsoft.EntityFrameworkCore;
using SeatMap.Api.Data;
using SeatMap.Api.Platform.Models;
using SeatMap.Api.Services;
using SeatMap.Api.Services.Tenancy;
using SeatMap.Api.Services.Reservations;

namespace SeatMap.Api.Application.Waitlist;

/// <summary>Accepts an owned offer and recovers its booking capability after a lost response.</summary>
/// <remarks>The booking service remains the single transaction boundary for table allocation.</remarks>
public sealed class ConfirmWaitlistOffer(
    AppDbContext db,
    ReservationBookingService booking,
    TenantBrandingService branding)
{
    public async Task<ReservationBookingResult> ExecuteAsync(Guid id, GuestProfile guest, Guid offerId)
    {
        if (guest.EmailVerifiedAtUtc == null) return ReservationBookingResult.Invalid(new { code = "VERIFIED_PROFILE_REQUIRED" });
        var result = await booking.CreateAsync(new(), acceptance: new(id, guest.Id, offerId));
        if (result.Kind != ReservationBookingResultKind.Success) return result;
        // Recover a lost success response without ever creating a second booking.
        // Only the authenticated owner can obtain a fresh management capability.
        await using var tx = await RestaurantWriteTransaction.BeginAsync(db);
        var entry = await db.WaitlistEntries.SingleAsync(x => x.Id == id && x.GuestId == guest.Id);
        var reservation = await db.Reservations.Include(x => x.Tables).SingleOrDefaultAsync(x => x.Id == entry.ReservationId);
        if (reservation == null) return ReservationBookingResult.NotFound(new { code = "NOT_FOUND" });
        var token = GuestReservationService.CreateToken();
        reservation.GuestManagementTokenHash = GuestReservationService.HashToken(token);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return ReservationBookingResult.Success(new { reservation.Id, reservation.GuestName, reservation.GuestCount, reservation.ReservedDate, reservation.ReservedTime,
            reservation.Area, reservation.Status, ManagementToken = token, TableIds = reservation.Tables.Select(t => t.TableCode),
            GuestReservation = GuestReservationService.Describe(reservation, await branding.GetAsync(), DateTime.UtcNow) });
    }
}
