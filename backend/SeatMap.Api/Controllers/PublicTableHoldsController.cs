using SeatMap.Api.Services.Reservations;
using SeatMap.Api.Services.FloorPlans;
using SeatMap.Api.Services.Tenancy;
using System.Text.Json;
using SeatMap.Api.Data;
using SeatMap.Api.Dtos;
using SeatMap.Api.Filters;
using SeatMap.Api.Models;
using SeatMap.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace SeatMap.Api.Controllers;

[ApiController]
[Route("api/reservations/public-table-holds")]
[AdminAuthorize("Administrator", "Owner", "Developer")]
public class PublicTableHoldsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AuditService _audit;
    private readonly FloorPlanService _plans;
    private readonly TenantBrandingService _branding;

    public PublicTableHoldsController(AppDbContext db, AuditService audit, FloorPlanService plans, TenantBrandingService branding)
    {
        _db = db;
        _audit = audit;
        _plans = plans;
        _branding = branding;
    }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] DateOnly? reservedDate)
    {
        var today = await RestaurantTodayAsync();
        var query = _db.PublicTableHolds.AsNoTracking().Where(x => x.ReservedDate >= today);
        if (reservedDate.HasValue)
            query = query.Where(x => x.ReservedDate == reservedDate.Value);

        var holds = await query.OrderBy(x => x.ReservedDate).ThenBy(x => x.Id).ToListAsync();
        return Ok(holds.Select(ToResponse));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePublicTableHoldRequest request)
    {
        await using var transaction = await RestaurantWriteTransaction.BeginAsync(_db);
        var selection = await _plans.SelectAsync(request.TableIds, null, 0, block: true);
        if (selection.Error != null) return BadRequest(new { message = selection.Error });
        var tableIds = selection.TableIds;
        if (request.ReservedDate < await RestaurantTodayAsync())
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
        await transaction.CommitAsync();
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
        => SeatMap.Api.Services.Reservations.PublicTableHoldSelection.DeserializeTableIds(value);

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

    private async Task<DateOnly> RestaurantTodayAsync() => DateOnly.FromDateTime(
        ReservationTimeRules.GetRestaurantNow(await _branding.GetAsync(), TimeProvider.System));
}
