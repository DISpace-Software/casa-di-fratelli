using CasaDiFratelli.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Services;

public class AutomaticTableReleaseService
{
    private readonly AppDbContext _db;

    public AutomaticTableReleaseService(AppDbContext db)
    {
        _db = db;
    }

    public Task<int> ReleasePreviousDayTablesAsync(DateOnly restaurantToday, CancellationToken cancellationToken = default)
    {
        return _db.Reservations
            .Where(reservation =>
                reservation.ReservedDate < restaurantToday &&
                reservation.Status != "Cancelled" &&
                reservation.Status != "Released")
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(reservation => reservation.Status, "Released")
                .SetProperty(reservation => reservation.IsArrived, false)
                .SetProperty(reservation => reservation.IsNoShow, false), cancellationToken);
    }

    public async Task<int> ReleaseWalkInsForUpcomingReservationsAsync(
        DateTime restaurantNow,
        CancellationToken cancellationToken = default)
    {
        var today = DateOnly.FromDateTime(restaurantNow);
        var activeWalkIns = await _db.Reservations
            .Include(reservation => reservation.Tables)
            .Where(reservation =>
                reservation.ReservedDate == today &&
                reservation.Status == "Approved" &&
                reservation.IsWalkIn &&
                reservation.IsArrived)
            .ToListAsync(cancellationToken);

        if (activeWalkIns.Count == 0)
            return 0;

        var scheduledReservations = await _db.Reservations
            .Include(reservation => reservation.Tables)
            .Where(reservation =>
                reservation.ReservedDate == today &&
                reservation.Status == "Approved" &&
                !reservation.IsWalkIn &&
                !reservation.IsNoShow)
            .ToListAsync(cancellationToken);

        var dueTableIds = scheduledReservations
            .Where(reservation =>
                TimeOnly.TryParse(reservation.ReservedTime, out var reservedTime) &&
                reservation.ReservedDate.ToDateTime(reservedTime) <= restaurantNow)
            .SelectMany(reservation => reservation.Tables)
            .Select(table => table.TableCode)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        if (dueTableIds.Count == 0)
            return 0;

        var walkInsToRelease = activeWalkIns
            .Where(reservation => reservation.Tables.Any(table => dueTableIds.Contains(table.TableCode)))
            .ToList();

        foreach (var reservation in walkInsToRelease)
        {
            reservation.Status = "Released";
            reservation.IsArrived = false;
            reservation.IsNoShow = false;
        }

        if (walkInsToRelease.Count > 0)
            await _db.SaveChangesAsync(cancellationToken);

        return walkInsToRelease.Count;
    }
}
