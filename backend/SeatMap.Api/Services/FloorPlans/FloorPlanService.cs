using Microsoft.EntityFrameworkCore.Storage;
using SeatMap.Api.Services.Reservations;
using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using SeatMap.Api.Data;
using SeatMap.Api.Models;
using SeatMap.Api.Services.Tenancy;
using Microsoft.EntityFrameworkCore;
using SeatMap.Api.Dtos;

namespace SeatMap.Api.Services.FloorPlans;

// Scoped with the tenant's AppDbContext. Reads never mutate legacy data.
public sealed class FloorPlanService(AppDbContext db, ICurrentTenant tenant)
{
    public const string StorageKey = "seatmap:floor-plan:v1";
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<FloorPlan> GetAsync()
    {
        var stored = await db.AppSettings.AsNoTracking().Where(x => x.Key == StorageKey).Select(x => x.Value).SingleOrDefaultAsync();
        if (stored != null)
        {
            var saved = JsonSerializer.Deserialize<FloorPlan>(stored, Json)
                ?? throw new InvalidOperationException("The restaurant floor plan is invalid.");
            if (Validate(saved) is { } error) throw new InvalidOperationException($"The restaurant floor plan is invalid: {error}");
            return saved;
        }

        // Compatibility import, only until this restaurant explicitly saves its plan.
        // Missing storage is distinct from malformed JSON or a database outage.
        var connection = db.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open) await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.Transaction = db.Database.CurrentTransaction?.GetDbTransaction();
        command.CommandText = db.Database.IsNpgsql()
            ? "SELECT to_regclass('\"TableLayouts\"') IS NOT NULL"
            : "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'TableLayouts'";
        var exists = Convert.ToBoolean(await command.ExecuteScalarAsync());
        string? raw = null;
        if (exists)
        {
            command.CommandText = """SELECT "LayoutJson" FROM "TableLayouts" WHERE "Id" = 1;""";
            raw = await command.ExecuteScalarAsync() as string;
        }
        var tables = raw == null ? null : JsonSerializer.Deserialize<List<TableLayoutItem>>(raw, Json)
            ?? throw new InvalidOperationException("The legacy floor plan is invalid.");
        var plan = tenant.TenantId.Equals("casa-di-fratelli", StringComparison.OrdinalIgnoreCase)
            ? CasaFloorPlan.Create(tables)
            : new FloorPlan { Tables = tables ?? [], Zones = (tables ?? []).Select(t => t.Area).Distinct().Select(id => new FloorZone(id, id)).ToList() };
        // Preserve custom legacy zones and prune combinations referring to removed tables.
        var zoneIds = plan.Zones.Select(z => z.Id).ToHashSet();
        var tableIds = plan.Tables.Select(t => t.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
        plan = plan with {
            Zones = plan.Zones.Concat(plan.Tables.Select(t => t.Area).Distinct().Where(id => !zoneIds.Contains(id)).Select(id => new FloorZone(id, id))).ToList(),
            Combinations = plan.Combinations.Where(group => group.All(tableIds.Contains) && plan.Tables.Where(t => group.Contains(t.Id)).Select(t => t.Area).Distinct().Count() == 1).ToList()
        };
        if (Validate(plan) is { } legacyError) throw new InvalidOperationException($"The legacy floor plan is invalid: {legacyError}");
        return plan with { Revision = "legacy-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(plan, Json)))) };
    }

    public async Task<FloorPlan> SaveAsync(FloorPlan plan)
    {
        var error = Validate(plan);
        if (error != null) throw new ArgumentException(error);
        await using var transaction = await RestaurantWriteTransaction.BeginAsync(db);
        var before = await GetAsync();
        if (plan.Revision != before.Revision) throw new FloorPlanConflictException("The map was changed by another administrator. Reload it before saving.");
        // Table IDs are durable reservation references. Deactivate instead of deleting.
        var removed = before.Tables.Select(t => t.Id).Except(plan.Tables.Select(t => t.Id), StringComparer.Ordinal).Select(id => id.ToUpperInvariant()).ToList();
        if (removed.Count > 0 && await db.ReservationTables.IgnoreQueryFilters().AnyAsync(t => removed.Contains(t.TableCode.ToUpper())))
            throw new ArgumentException("A table with reservation history cannot be deleted or renumbered. Deactivate it instead.");
        var today = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1));
        var bookings = await db.Reservations.AsNoTracking().Include(x => x.Tables)
            .Where(x => x.ReservedDate >= today && x.Status != "Cancelled" && x.Status != "Released" && !x.IsNoShow).ToListAsync();
        foreach (var booking in bookings)
        {
            var ids = booking.Tables.Select(t => t.TableCode).ToList();
            // Legacy bookings may already violate current rules. Only block newly introduced breakage.
            var previous = Select(before, ids, null, booking.GuestCount, booking.GuestCount == 0);
            var next = Select(plan, ids, null, booking.GuestCount, booking.GuestCount == 0);
            if (previous.Error == null && next.Error != null)
                throw new ArgumentException($"Move or cancel reservation #{booking.Id} before changing its tables: {next.Error}");
            if (previous.Error == null && previous.Area != next.Area)
                throw new ArgumentException($"Move reservation #{booking.Id} before moving its table to another zone.");
        }
        var holds = await db.PublicTableHolds.AsNoTracking().Where(x => x.ReservedDate >= today).ToListAsync();
        foreach (var hold in holds)
            if (Select(plan, Reservations.PublicTableHoldSelection.DeserializeTableIds(hold.TableIdsJson), null, 0, true).Error != null)
                throw new ArgumentException($"Remove table hold #{hold.Id} before changing its tables.");

        var saved = plan with { Revision = Guid.NewGuid().ToString("N") };
        var json = JsonSerializer.Serialize(saved, Json);
        var oldValue = await db.AppSettings.AsNoTracking().Where(x => x.Key == StorageKey).Select(x => x.Value).SingleOrDefaultAsync();
        if (oldValue != null)
        {
            var storedPlan = JsonSerializer.Deserialize<FloorPlan>(oldValue, Json)!;
            if (storedPlan.Revision != plan.Revision || await db.AppSettings.Where(x => x.Key == StorageKey && x.Value == oldValue)
                    .ExecuteUpdateAsync(s => s.SetProperty(x => x.Value, json).SetProperty(x => x.UpdatedAtUtc, DateTime.UtcNow)) != 1)
                throw new FloorPlanConflictException("The map changed while saving. Reload it before saving.");
        }
        else
        {
            var setting = new AppSetting { Key = StorageKey, Value = json };
            db.AppSettings.Add(setting);
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException e) when (e.InnerException is Npgsql.PostgresException { SqlState: "23505" } || e.InnerException?.Message.Contains("UNIQUE constraint failed") == true)
            {
                db.Entry(setting).State = EntityState.Detached;
                throw new FloorPlanConflictException("The map changed while saving. Reload it before saving.");
            }
        }
        await transaction.CommitAsync();
        return saved;
    }

    public async Task<TableSelection> SelectAsync(IEnumerable<string>? ids, string? area, int guests, bool block = false, bool publicBooking = false)
    {
        var plan = await GetAsync();
        var result = Select(plan, ids, area, guests, block);
        if (result.Error != null || block) return result;
        if (publicBooking && (guests > plan.PublicMaxGuests || result.TableIds.Count > plan.PublicMaxTables))
            return result with { Error = "This party size or table combination requires contacting the restaurant." };
        const string prefix = "seasonal-zone:";
        var closed = await db.AppSettings.AsNoTracking().Where(x => x.Key.StartsWith(prefix) && x.Value == "closed").Select(x => x.Key).ToListAsync();
        if (closed.Contains(prefix + result.Area)) return result with { Error = "The selected zone is closed for the season." };
        return result;
    }

    public static TableSelection Select(FloorPlan plan, IEnumerable<string>? ids, string? area, int guests, bool block = false)
    {
        var requested = ReservationConflictService.NormalizeTableIds(ids);
        TableSelection Fail(string message) => new(message, [], "", 0);
        if (requested.Count == 0) return Fail("At least one active table must be selected.");
        var selected = requested.Select(id => plan.Tables.SingleOrDefault(t => t.Id.Equals(id, StringComparison.OrdinalIgnoreCase))).ToList();
        if (selected.Any(t => t == null || !t.IsActive || !plan.Zones.Any(z => z.Id == t.Area && z.IsActive)))
            return Fail("One or more selected tables are not active in this restaurant.");
        var tables = selected.Select(t => t!).ToList();
        var areas = tables.Select(t => t.Area).Distinct().ToArray();
        if (!block && areas.Length != 1) return Fail("A reservation must use tables in one zone.");
        var realArea = areas.Length == 1 ? areas[0] : "all";
        if (!string.IsNullOrWhiteSpace(area) && area != "all" && area != realArea) return Fail("The selected tables do not belong to the requested zone.");
        var codes = tables.Select(t => t.Id).ToList();
        if (!block && codes.Count > 1 && !plan.Combinations.Any(g => g.Count == codes.Count && g.ToHashSet(StringComparer.OrdinalIgnoreCase).SetEquals(codes)))
            return Fail("This table combination is not allowed by the restaurant.");
        var capacity = tables.Sum(t => t.Seats);
        if (!block && (guests <= 0 || capacity < guests)) return Fail("The selected tables do not have enough seats.");
        return new(null, codes, realArea, capacity);
    }

    public static string? Validate(FloorPlan plan)
    {
        if (plan.SchemaVersion != 1) return "Unsupported floor plan version.";
        if (plan.Zones == null || plan.Tables == null || plan.Combinations == null) return "Zones, tables and combinations are required.";
        if (plan.Zones.Count > 50 || plan.Tables.Count > 500 || plan.Combinations.Count > 2000) return "The floor plan is too large.";
        if (plan.PublicMaxGuests is < 1 or > 500 || plan.PublicMaxTables is < 1 or > 50) return "Invalid public booking limits.";
        if (plan.Zones.Any(z => z == null || string.IsNullOrWhiteSpace(z.Id) || !Regex.IsMatch(z.Id, "^[a-zA-Z][a-zA-Z0-9_-]{0,49}$") || z.Id == "all" || string.IsNullOrWhiteSpace(z.Name) || z.Name.Length > 100 || !new[] { "plain", "casa-indoor", "casa-garden", "casa-terrace" }.Contains(z.Presentation))) return "Every zone needs a unique ID, name and supported presentation.";
        if (plan.Zones.Any(z => (z.Presentation == "casa-indoor" && z.Id != "indoor") || (z.Presentation == "casa-garden" && z.Id != "garden") || (z.Presentation == "casa-terrace" && z.Id != "openTerrace"))) return "Casa presentation presets require their original zone IDs. Use plain for custom zones.";
        if (plan.Zones.Any(z => z.Names != null && (z.Names.Count > 10 || z.Names.Any(n => n.Key.Length > 10 || string.IsNullOrWhiteSpace(n.Value) || n.Value.Length > 100)))) return "Invalid translated zone name.";
        if (plan.Zones.Select(z => z.Id).Distinct(StringComparer.OrdinalIgnoreCase).Count() != plan.Zones.Count) return "Duplicate zone ID.";
        if (plan.Tables.Any(t => t == null || string.IsNullOrWhiteSpace(t.Id) || t.Id != t.Id.Trim() || t.Id.Length > 20 || t.Id.Contains(',') || t.Id.Any(char.IsControl))) return "Every table needs a valid ID (up to 20 characters, without commas).";
        if (plan.Tables.Select(t => t.Id).Distinct(StringComparer.OrdinalIgnoreCase).Count() != plan.Tables.Count) return "Duplicate table ID.";
        foreach (var t in plan.Tables)
        {
            if (!plan.Zones.Any(z => z.Id == t.Area)) return $"Table {t.Id} refers to an unknown zone.";
            if (t.Seats is < 1 or > 500 || t.X is < 5 or > 95 || t.Y is < 5 or > 95) return $"Invalid capacity or position for table {t.Id}.";
        }
        foreach (var group in plan.Combinations)
        {
            if (group == null || group.Count is < 2 or > 50 || group.Distinct(StringComparer.OrdinalIgnoreCase).Count() != group.Count) return "A combination must contain distinct table IDs.";
            var tables = group.Select(id => plan.Tables.SingleOrDefault(t => t.Id == id)).ToList();
            if (tables.Any(t => t == null) || tables.Select(t => t!.Area).Distinct().Count() != 1) return "A combination must contain existing tables in one zone.";
        }
        foreach (var t in plan.Tables.Where(t => t.IsActive))
            if (plan.Tables.Any(other => other.IsActive && other.Id != t.Id && other.Area == t.Area && (other.X - t.X) * (other.X - t.X) + (other.Y - t.Y) * (other.Y - t.Y) < 36)) return $"Table {t.Id} overlaps another table.";
        return null;
    }
}
