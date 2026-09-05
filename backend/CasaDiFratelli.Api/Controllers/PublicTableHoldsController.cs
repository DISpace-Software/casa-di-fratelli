using System.Text.Json;
using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Dtos;
using CasaDiFratelli.Api.Filters;
using CasaDiFratelli.Api.Models;
using CasaDiFratelli.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Controllers;

[ApiController]
[Route("api/reservations/public-table-holds")]
[AdminAuthorize("Administrator", "Owner", "Developer")]
public class PublicTableHoldsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AuditService _audit;

    public PublicTableHoldsController(AppDbContext db, AuditService audit)
    {
        _db = db;
        _audit = audit;
    }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] DateOnly? reservedDate)
    {
        var today = RestaurantToday();
        var query = _db.PublicTableHolds.AsNoTracking().Where(x => x.ReservedDate >= today);
        if (reservedDate.HasValue)
            query = query.Where(x => x.ReservedDate == reservedDate.Value);

        var holds = await query.OrderBy(x => x.ReservedDate).ThenBy(x => x.Id).ToListAsync();
        return Ok(holds.Select(ToResponse));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePublicTableHoldRequest request)
    {
        var tableIds = ReservationConflictService.NormalizeTableIds(request.TableIds)
            .Where(id => !TableCapacityService.IsRetired(id))
            .ToList();
        if (tableIds.Count == 0)
            return BadRequest(new { message = "At least one active table must be selected." });
        if (request.ReservedDate < RestaurantToday())
            return BadRequest(new { message = "A public table hold cannot be created for a past date." });

        var existing = await _db.PublicTableHolds
            .Where(x => x.ReservedDate == request.ReservedDate)
            .ToListAsync();
        var existingIds = existing
            .SelectMany(x => DeserializeTableIds(x.TableIdsJson))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (tableIds.Any(existingIds.Contains))
            return Conflict(new { message = "One or more tables are already blocked for public booking on this date." });

        var admin = AdminAuthService.Current(HttpContext);
        var hold = new PublicTableHold
        {
            ReservedDate = request.ReservedDate,
            TableIdsJson = JsonSerializer.Serialize(tableIds),
            Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim(),
            CreatedByAdminUserId = admin?.Id,
            CreatedByAdminName = admin?.Name
        };
        _db.PublicTableHolds.Add(hold);
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "create", "PublicTableHold", hold.Id.ToString(), after: ToResponse(hold));
        return Ok(ToResponse(hold));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var hold = await _db.PublicTableHolds.FirstOrDefaultAsync(x => x.Id == id);
        if (hold == null) return NotFound();
        var before = ToResponse(hold);
        _db.PublicTableHolds.Remove(hold);
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "delete", "PublicTableHold", id.ToString(), before: before);
        return NoContent();
    }

    internal static List<string> DeserializeTableIds(string? value)
    {
        try { return JsonSerializer.Deserialize<List<string>>(value ?? "[]") ?? new(); }
        catch (JsonException) { return new(); }
    }

    private static object ToResponse(PublicTableHold hold) => new
    {
        hold.Id,
        hold.ReservedDate,
        TableIds = DeserializeTableIds(hold.TableIdsJson),
        hold.Note,
        hold.CreatedAtUtc,
        hold.CreatedByAdminUserId,
        hold.CreatedByAdminName
    };

    private static DateOnly RestaurantToday()
    {
        try
        {
            var timezone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Sofia");
            return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, timezone));
        }
        catch (TimeZoneNotFoundException) { return DateOnly.FromDateTime(DateTime.Now); }
        catch (InvalidTimeZoneException) { return DateOnly.FromDateTime(DateTime.Now); }
    }
}
