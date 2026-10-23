using System.Text.Json;
using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Services;

public sealed class SeasonalZoneService(AppDbContext db)
{
    public static readonly string[] Areas = ["indoor", "garden", "openTerrace"];
    private const string Prefix = "seasonal-zone:";

    public async Task<string[]> GetClosedAreasAsync() => (await db.AppSettings.AsNoTracking()
        .Where(x => x.Key.StartsWith(Prefix) && x.Value == "closed")
        .Select(x => x.Key).ToListAsync())
        .Select(x => x[Prefix.Length..]).Where(Areas.Contains).ToArray();

    public async Task SetClosedAsync(string area, bool closed)
    {
        if (!Areas.Contains(area)) throw new ArgumentException("Unknown zone.", nameof(area));
        var key = Prefix + area;
        var setting = await db.AppSettings.SingleOrDefaultAsync(x => x.Key == key);
        if (setting == null) { setting = new AppSetting { Key = key }; db.AppSettings.Add(setting); }
        setting.Value = closed ? "closed" : "open";
        setting.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }

    public async Task<bool> IsSelectionClosedAsync(string? area, IEnumerable<string> tableIds)
    {
        var closed = await GetClosedAreasAsync();
        if (closed.Length == 0) return false;
        if (closed.Contains(area)) return true;
        // Check the actual table zone as well, so a stale client cannot bypass closure by changing Area.
        var tableAreas = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var id in Enumerable.Range(1, 49))
            tableAreas[id.ToString()] = id >= 46 ? "openTerrace" : id >= 30 ? "garden" : "indoor";
        var connection = db.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open) await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = """SELECT "LayoutJson" FROM "TableLayouts" WHERE "Id" = 1;""";
        string? json = null;
        try { json = await command.ExecuteScalarAsync() as string; }
        catch (System.Data.Common.DbException error) when (
            error.Message.Contains("TableLayouts", StringComparison.OrdinalIgnoreCase) &&
            (error.Message.Contains("does not exist", StringComparison.OrdinalIgnoreCase) || error.Message.Contains("no such table", StringComparison.OrdinalIgnoreCase)))
        {
            // A new restaurant has the default layout until its first layout is saved.
        }
        if (!string.IsNullOrWhiteSpace(json))
        {
            var layout = JsonSerializer.Deserialize<List<TableLayoutsEntry>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            foreach (var item in layout ?? [])
                if (!string.IsNullOrWhiteSpace(item.Id) && !string.IsNullOrWhiteSpace(item.Area)) tableAreas[item.Id] = item.Area;
        }
        return tableIds.Any(id => tableAreas.TryGetValue(id, out var zone) && closed.Contains(zone));
    }

    private sealed record TableLayoutsEntry(string Id, string Area);
}
