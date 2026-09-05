using System.Data;
using System.Text.Json;
using CasaDiFratelli.Api.Filters;
using CasaDiFratelli.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CasaDiFratelli.Api.Data;

namespace CasaDiFratelli.Api.Controllers;

[ApiController]
[Route("api/table-layouts")]
public class TableLayoutsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<TableLayoutsController> _logger;
    private readonly AuditService _audit;

    public TableLayoutsController(AppDbContext db, ILogger<TableLayoutsController> logger, AuditService audit)
    {
        _db = db;
        _logger = logger;
        _audit = audit;
    }

    public sealed record TableLayoutItem(
        string Id,
        string Area,
        decimal X,
        decimal Y,
        int Seats,
        bool Special,
        bool Wide,
        bool IsActive
    );

    private static readonly List<TableLayoutItem> DefaultLayout = new()
    {
        new("42", "garden", 17, 22, 4, false, false, true),
        new("43", "garden", 17, 42, 4, false, false, true),
        new("44", "garden", 17, 62, 4, false, false, true),
        new("45", "garden", 17, 82, 4, false, false, true),
        new("38", "garden", 38, 24, 4, false, false, true),
        new("39", "garden", 38, 44, 4, false, false, true),
        new("40", "garden", 38, 64, 4, false, false, true),
        new("41", "garden", 38, 84, 4, false, false, true),
        new("34", "garden", 59, 24, 4, false, false, true),
        new("35", "garden", 59, 44, 4, false, false, true),
        new("36", "garden", 59, 64, 4, false, false, true),
        new("37", "garden", 59, 84, 4, false, false, true),
        new("30", "garden", 78, 22, 4, false, false, true),
        new("31", "garden", 78, 42, 4, false, false, true),
        new("32", "garden", 78, 62, 4, false, false, true),
        new("33", "garden", 78, 82, 4, false, false, true),
        new("1", "indoor", 83, 12, 4, false, true, true),
        new("2", "indoor", 83, 22, 4, false, true, true),
        new("3", "indoor", 83, 32, 4, false, true, true),
        new("4", "indoor", 83, 42, 4, false, true, true),
        new("5", "indoor", 51, 22, 6, false, true, true),
        new("6", "indoor", 51, 35, 6, false, true, true),
        new("7", "indoor", 16, 10, 4, false, true, true),
        new("8", "indoor", 16, 20, 6, false, true, true),
        new("9", "indoor", 16, 30, 6, false, true, true),
        new("10", "indoor", 16, 40, 6, false, true, true),
        new("11", "indoor", 16, 50, 6, false, true, true),
        new("20", "indoor", 82, 60, 4, false, true, true),
        new("21", "indoor", 82, 70, 4, false, true, true),
        new("22", "indoor", 82, 80, 4, false, true, true),
        new("23", "indoor", 82, 90, 4, false, true, true),
        new("24", "indoor", 53, 65, 6, false, true, true),
        new("25", "indoor", 54, 78, 6, false, false, true),
        new("26", "indoor", 55, 90, 4, false, true, true),
        new("27", "indoor", 35, 92, 4, false, true, true),
        new("28", "indoor", 16, 90, 6, false, true, true),
        new("29", "indoor", 16, 80, 6, false, true, true),

        new("46", "openTerrace", 34, 40, 4, false, false, true),
        new("47", "openTerrace", 66, 40, 4, false, false, true),
        new("48", "openTerrace", 34, 68, 2, true, false, true),
        new("49", "openTerrace", 66, 68, 2, true, false, true),
    };

    private async Task EnsureStorageAsync()
    {
        var connection = _db.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open)
        {
            await connection.OpenAsync();
        }

        await using var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS "TableLayouts" (
                "Id" integer NOT NULL,
                "LayoutJson" text NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NOT NULL DEFAULT now(),
                CONSTRAINT "PK_TableLayouts" PRIMARY KEY ("Id")
            );
            """;

        await command.ExecuteNonQueryAsync();
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        try
        {
            await EnsureStorageAsync();

            await using var command = _db.Database.GetDbConnection().CreateCommand();
            command.CommandText = """SELECT "LayoutJson" FROM "TableLayouts" WHERE "Id" = 1;""";
            var rawJson = await command.ExecuteScalarAsync() as string;

            if (string.IsNullOrWhiteSpace(rawJson))
            {
                return Ok(DefaultLayout);
            }

            var items = JsonSerializer.Deserialize<List<TableLayoutItem>>(rawJson, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            var activeLayout = items?
                .Where(item => !TableCapacityService.IsRetired(item.Id))
                .ToList();

            if (items != null && activeLayout != null && activeLayout.Count != items.Count)
            {
                await PersistLayoutAsync(activeLayout);
            }

            return Ok(activeLayout?.Count > 0 ? activeLayout : DefaultLayout);
        }
        catch (Exception error)
        {
            _logger.LogError(error, "Failed to load table layout.");
            return StatusCode(500, new { message = "Failed to load table layout." });
        }
    }

    [HttpPut]
    [AdminAuthorize(AdminRoleAccess.Administrator, AdminRoleAccess.Owner, AdminRoleAccess.Developer)]
    public async Task<IActionResult> Save([FromBody] List<TableLayoutItem> layout)
    {
        try
        {
            var validationError = ValidateLayout(layout);
            if (validationError != null)
            {
                return BadRequest(new { message = validationError });
            }

            await PersistLayoutAsync(layout);
            await _audit.RecordAsync(HttpContext, "save", "TableLayout", "1", after: layout);

            return Ok(layout);
        }
        catch (Exception error)
        {
            _logger.LogError(error, "Failed to save table layout.");
            return StatusCode(500, new { message = "Failed to save table layout." });
        }
    }

    [HttpPost("reset")]
    [AdminAuthorize(AdminRoleAccess.Administrator, AdminRoleAccess.Owner, AdminRoleAccess.Developer)]
    public async Task<IActionResult> Reset()
    {
        return await Save(DefaultLayout);
    }

    private static string? ValidateLayout(List<TableLayoutItem>? layout)
    {
        if (layout == null || layout.Count == 0) return "Layout cannot be empty.";

        var duplicate = layout
            .Where(item => !string.IsNullOrWhiteSpace(item.Id))
            .GroupBy(item => item.Id.Trim(), StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault(group => group.Count() > 1);

        if (duplicate != null) return $"Duplicate table id: {duplicate.Key}.";

        foreach (var item in layout)
        {
            if (string.IsNullOrWhiteSpace(item.Id)) return "Every table needs a number.";
            if (TableCapacityService.IsRetired(item.Id)) return $"Table {item.Id} is permanently retired.";
            if (string.IsNullOrWhiteSpace(item.Area)) return $"Table {item.Id} needs an area.";
            if (item.Seats <= 0) return $"Table {item.Id} needs at least one seat.";
            if (item.X < 5 || item.X > 95 || item.Y < 5 || item.Y > 95)
                return $"Table {item.Id} is outside the map.";
        }

        foreach (var areaGroup in layout.Where(item => item.IsActive).GroupBy(item => item.Area))
        {
            var items = areaGroup.ToList();

            for (var index = 0; index < items.Count; index++)
            {
                for (var nextIndex = index + 1; nextIndex < items.Count; nextIndex++)
                {
                    var first = items[index];
                    var second = items[nextIndex];
                    var distance = Math.Sqrt(
                        Math.Pow((double)(first.X - second.X), 2) +
                        Math.Pow((double)(first.Y - second.Y), 2));

                    if (distance < 6)
                    {
                        return $"Tables {first.Id} and {second.Id} overlap.";
                    }
                }
            }
        }

        return null;
    }

    private async Task PersistLayoutAsync(List<TableLayoutItem> layout)
    {
        await EnsureStorageAsync();
        var json = JsonSerializer.Serialize(layout);

        await using var command = _db.Database.GetDbConnection().CreateCommand();
        command.CommandText = """
            INSERT INTO "TableLayouts" ("Id", "LayoutJson", "UpdatedAtUtc")
            VALUES (1, @json, now())
            ON CONFLICT ("Id")
            DO UPDATE SET "LayoutJson" = EXCLUDED."LayoutJson", "UpdatedAtUtc" = now();
            """;

        var parameter = command.CreateParameter();
        parameter.ParameterName = "@json";
        parameter.Value = json;
        command.Parameters.Add(parameter);

        await command.ExecuteNonQueryAsync();
    }
}
