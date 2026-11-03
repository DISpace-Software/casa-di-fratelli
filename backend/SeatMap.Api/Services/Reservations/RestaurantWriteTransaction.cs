using SeatMap.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace SeatMap.Api.Services.Reservations;

// One short transaction for map/availability decisions and their writes.
// PostgreSQL advisory locks are database-scoped: other restaurants proceed independently.
// All API replicas share the lock; it is released on commit, rollback or connection loss.
public static class RestaurantWriteTransaction
{
    public static async Task<IDbContextTransaction> BeginAsync(AppDbContext db)
    {
        var transaction = await db.Database.BeginTransactionAsync();
        try
        {
            if (db.Database.IsNpgsql())
                await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(7346281901)");
            return transaction;
        }
        catch { await transaction.DisposeAsync(); throw; }
    }
}
