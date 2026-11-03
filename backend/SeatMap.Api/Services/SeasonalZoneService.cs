using SeatMap.Api.Services.Reservations;
using SeatMap.Api.Data;
using SeatMap.Api.Models;
using SeatMap.Api.Services.FloorPlans;
using Microsoft.EntityFrameworkCore;

namespace SeatMap.Api.Services;

public sealed class SeasonalZoneService(AppDbContext db, FloorPlanService plans)
{
    public FloorPlanService Plans => plans;
    private const string Prefix = "seasonal-zone:";
    public async Task<string[]> GetAreasAsync() => (await plans.GetAsync()).Zones.Select(z => z.Id).ToArray();
    public async Task<string[]> GetClosedAreasAsync()
    {
        var plan = await plans.GetAsync();
        var closed = (await db.AppSettings.AsNoTracking().Where(x => x.Key.StartsWith(Prefix) && x.Value == "closed").Select(x => x.Key).ToListAsync()).Select(key => key[Prefix.Length..]);
        return plan.Zones.Where(z => !z.IsActive || closed.Contains(z.Id)).Select(z => z.Id).ToArray();
    }
    public async Task SetClosedAsync(string area, bool closed)
    {
        await using var transaction = await RestaurantWriteTransaction.BeginAsync(db);
        if (!(await GetAreasAsync()).Contains(area)) throw new ArgumentException("Unknown zone.", nameof(area));
        var key = Prefix + area;
        var setting = await db.AppSettings.SingleOrDefaultAsync(x => x.Key == key);
        if (setting == null) { setting = new AppSetting { Key = key }; db.AppSettings.Add(setting); }
        setting.Value = closed ? "closed" : "open";
        setting.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
    }
    public async Task<bool> IsSelectionClosedAsync(string? area, IEnumerable<string> tableIds)
    {
        var closed = await GetClosedAreasAsync();
        var ids = tableIds.ToHashSet(StringComparer.OrdinalIgnoreCase);
        return closed.Contains(area) || (await plans.GetAsync()).Tables.Any(t => ids.Contains(t.Id) && closed.Contains(t.Area));
    }
}
