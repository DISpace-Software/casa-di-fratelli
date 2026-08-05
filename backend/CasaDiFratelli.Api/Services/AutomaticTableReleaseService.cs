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
}
