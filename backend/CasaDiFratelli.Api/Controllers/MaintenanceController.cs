using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Filters;
using CasaDiFratelli.Api.Models;
using CasaDiFratelli.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Controllers;

[ApiController]
[Route("api/maintenance")]
[AdminAuthorize]
public class MaintenanceController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AuditService _audit;

    public MaintenanceController(AppDbContext db, AuditService audit)
    {
        _db = db;
        _audit = audit;
    }

    [HttpPost("clear-reservations-and-orders")]
    public async Task<IActionResult> ClearReservationsAndOrders([FromBody] ClearReservationsAndOrdersRequest? request)
    {
        var admin = AdminAuthService.Current(HttpContext);
        if (!AdminRoleAccess.CanClearOperationalData(admin?.Role))
            return Forbid();

        if (request?.ConfirmationCode != "2215")
            return BadRequest(new { message = "Invalid confirmation code." });

        var reason = string.IsNullOrWhiteSpace(request.Reason) ? "Legacy clear reservations and orders" : request.Reason.Trim();
        var reservations = await SoftDeleteReservationsAsync(_db.Reservations, admin, reason);
        var orders = await SoftDeleteOrdersAsync(_db.DiningOrders.Include(x => x.Items), admin, reason);

        var result = new { Reservations = reservations, Orders = orders };
        await _audit.RecordAsync(HttpContext, "soft-clear", "OperationalData", "reservations-and-orders", after: result);

        return Ok(new { Message = "Reservations and dining orders were soft deleted.", Deleted = result });
    }

    [HttpPost("reservations/delete")]
    public async Task<IActionResult> DeleteReservations([FromBody] MaintenanceDeleteRequest request)
    {
        var admin = AdminAuthService.Current(HttpContext);
        if (!AdminRoleAccess.CanDeleteReservations(admin?.Role))
            return Forbid();

        var query = _db.Reservations.AsQueryable();
        query = ApplyReservationPeriod(query, request);
        var count = await SoftDeleteReservationsAsync(query, admin, RequireReason(request));
        await _audit.RecordAsync(HttpContext, "soft-delete-bulk", "Reservation", request.EntityId?.ToString() ?? "bulk", after: new { Count = count, request.FromDate, request.ToDate, request.Reason });
        return Ok(new { Count = count });
    }

    [HttpPost("reservations/{id:int}/delete")]
    public async Task<IActionResult> DeleteReservation(int id, [FromBody] MaintenanceDeleteRequest request)
    {
        request.EntityId = id;
        return await DeleteReservations(request);
    }

    [HttpPost("reservations/{id:int}/restore")]
    public async Task<IActionResult> RestoreReservation(int id)
    {
        var admin = AdminAuthService.Current(HttpContext);
        if (!AdminRoleAccess.CanRestoreReservations(admin?.Role))
            return Forbid();

        var reservation = await _db.Reservations.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id);
        if (reservation == null) return NotFound();

        var before = new { reservation.Id, reservation.IsDeleted, reservation.DeleteReason };
        reservation.IsDeleted = false;
        reservation.DeletedAtUtc = null;
        reservation.DeletedByAdminUserId = null;
        reservation.DeletedByAdminName = null;
        reservation.DeleteReason = null;
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "restore", "Reservation", id.ToString(), before, after: new { reservation.Id, reservation.IsDeleted });
        return Ok(new { reservation.Id, reservation.IsDeleted });
    }

    [HttpGet("reservations/deleted")]
    public async Task<IActionResult> GetDeletedReservations()
    {
        var admin = AdminAuthService.Current(HttpContext);
        if (!AdminRoleAccess.CanViewDeletedOperationalData(admin?.Role))
            return Forbid();

        var reservations = await _db.Reservations
            .IgnoreQueryFilters()
            .Where(x => x.IsDeleted)
            .Include(x => x.Tables)
            .OrderByDescending(x => x.DeletedAtUtc)
            .Take(200)
            .Select(x => new
            {
                x.Id,
                x.GuestName,
                x.Phone,
                x.Email,
                x.ReservedDate,
                x.ReservedTime,
                x.Status,
                x.DeletedAtUtc,
                x.DeletedByAdminName,
                x.DeleteReason,
                TableIds = x.Tables.Select(t => t.TableCode).ToList()
            })
            .ToListAsync();

        return Ok(reservations);
    }

    [HttpPost("orders/delete")]
    public async Task<IActionResult> DeleteOrders([FromBody] MaintenanceDeleteRequest request)
    {
        var admin = AdminAuthService.Current(HttpContext);
        if (!AdminRoleAccess.CanDeleteOrders(admin?.Role))
            return Forbid();

        var query = _db.DiningOrders.Include(x => x.Items).AsQueryable();
        query = ApplyOrderPeriodAndRole(query, request, admin);
        var count = await SoftDeleteOrdersAsync(query, admin, RequireReason(request));
        await _audit.RecordAsync(HttpContext, "soft-delete-bulk", "DiningOrder", request.EntityId?.ToString() ?? "bulk", after: new { Count = count, request.FromDate, request.ToDate, request.Reason });
        return Ok(new { Count = count });
    }

    [HttpPost("orders/{id:int}/delete")]
    public async Task<IActionResult> DeleteOrder(int id, [FromBody] MaintenanceDeleteRequest request)
    {
        request.EntityId = id;
        return await DeleteOrders(request);
    }

    [HttpPost("orders/{id:int}/restore")]
    public async Task<IActionResult> RestoreOrder(int id)
    {
        var admin = AdminAuthService.Current(HttpContext);
        if (!AdminRoleAccess.CanRestoreOrders(admin?.Role))
            return Forbid();

        var order = await _db.DiningOrders
            .IgnoreQueryFilters()
            .Include(x => x.Items)
            .FirstOrDefaultAsync(x => x.Id == id);
        if (order == null) return NotFound();

        var before = new { order.Id, order.IsDeleted, order.DeleteReason };
        ClearDelete(order, restoreItems: true);
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "restore", "DiningOrder", id.ToString(), before, after: new { order.Id, order.IsDeleted });
        return Ok(new { order.Id, order.IsDeleted });
    }

    [HttpGet("orders/deleted")]
    public async Task<IActionResult> GetDeletedOrders()
    {
        var admin = AdminAuthService.Current(HttpContext);
        if (!AdminRoleAccess.CanViewDeletedOperationalData(admin?.Role))
            return Forbid();

        var orders = await _db.DiningOrders
            .IgnoreQueryFilters()
            .Where(x => x.IsDeleted)
            .Include(x => x.Items)
            .OrderByDescending(x => x.DeletedAtUtc)
            .Take(200)
            .Select(x => new
            {
                x.Id,
                x.GuestName,
                x.TableLabel,
                x.Status,
                x.TotalPrice,
                x.DeletedAtUtc,
                x.DeletedByAdminName,
                x.DeleteReason,
                Items = x.Items.Count
            })
            .ToListAsync();

        return Ok(orders);
    }

    private IQueryable<Reservation> ApplyReservationPeriod(IQueryable<Reservation> query, MaintenanceDeleteRequest request)
    {
        if (request.EntityId.HasValue) query = query.Where(x => x.Id == request.EntityId.Value);
        if (request.FromDate.HasValue) query = query.Where(x => x.ReservedDate >= request.FromDate.Value);
        if (request.ToDate.HasValue) query = query.Where(x => x.ReservedDate <= request.ToDate.Value);
        return query;
    }

    private static IQueryable<DiningOrder> ApplyOrderPeriodAndRole(IQueryable<DiningOrder> query, MaintenanceDeleteRequest request, AdminPrincipal? admin)
    {
        var role = AdminRoleAccess.Normalize(admin?.Role);
        if (request.EntityId.HasValue) query = query.Where(x => x.Id == request.EntityId.Value);
        if (request.FromDate.HasValue)
        {
            var from = request.FromDate.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            query = query.Where(x => x.CreatedAtUtc >= from);
        }
        if (request.ToDate.HasValue)
        {
            var to = request.ToDate.Value.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            query = query.Where(x => x.CreatedAtUtc < to);
        }

        return role switch
        {
            AdminRoleAccess.Waiter when admin != null => query.Where(x => x.AssignedWaiterId == admin.Id),
            AdminRoleAccess.Kitchen => query.Where(x => x.Items.Any(item => item.Kind == "Dish")),
            AdminRoleAccess.Bar => query.Where(x => x.Items.Any(item => item.Kind == "Drink")),
            _ => query
        };
    }

    private static string RequireReason(MaintenanceDeleteRequest request)
    {
        return string.IsNullOrWhiteSpace(request.Reason) ? "Maintenance cleanup" : request.Reason.Trim();
    }

    private async Task<int> SoftDeleteReservationsAsync(IQueryable<Reservation> query, AdminPrincipal? admin, string reason)
    {
        var now = DateTime.UtcNow;
        var reservations = await query.Where(x => !x.IsDeleted).ToListAsync();
        foreach (var reservation in reservations)
            MarkDeleted(reservation, admin, reason, now);

        if (reservations.Count > 0)
            await _db.SaveChangesAsync();

        return reservations.Count;
    }

    private async Task<int> SoftDeleteOrdersAsync(IQueryable<DiningOrder> query, AdminPrincipal? admin, string reason)
    {
        var now = DateTime.UtcNow;
        var role = AdminRoleAccess.Normalize(admin?.Role);
        var limitedItemKind = role switch
        {
            AdminRoleAccess.Kitchen => "Dish",
            AdminRoleAccess.Bar => "Drink",
            _ => null
        };

        var orders = await query.Where(x => !x.IsDeleted || x.Items.Any(item => !item.IsDeleted)).ToListAsync();
        var touched = 0;
        foreach (var order in orders)
        {
            var items = order.Items
                .Where(item => !item.IsDeleted)
                .Where(item => limitedItemKind == null || item.Kind == limitedItemKind)
                .ToList();

            if (limitedItemKind != null)
            {
                if (items.Count == 0) continue;

                foreach (var item in items)
                    MarkDeleted(item, admin, reason, now);

                if (order.Items.All(item => item.IsDeleted || items.Contains(item)))
                    MarkDeleted(order, admin, reason, now);

                touched++;
                continue;
            }

            MarkDeleted(order, admin, reason, now);

            foreach (var item in items)
                MarkDeleted(item, admin, reason, now);

            touched++;
        }

        if (touched > 0)
            await _db.SaveChangesAsync();

        return touched;
    }

    private static void MarkDeleted(Reservation reservation, AdminPrincipal? admin, string reason, DateTime now)
    {
        reservation.IsDeleted = true;
        reservation.DeletedAtUtc = now;
        reservation.DeletedByAdminUserId = admin?.Id;
        reservation.DeletedByAdminName = admin?.Name;
        reservation.DeleteReason = reason;
    }

    private static void MarkDeleted(DiningOrder order, AdminPrincipal? admin, string reason, DateTime now)
    {
        order.IsDeleted = true;
        order.DeletedAtUtc = now;
        order.DeletedByAdminUserId = admin?.Id;
        order.DeletedByAdminName = admin?.Name;
        order.DeleteReason = reason;
    }

    private static void MarkDeleted(DiningOrderItem item, AdminPrincipal? admin, string reason, DateTime now)
    {
        item.IsDeleted = true;
        item.DeletedAtUtc = now;
        item.DeletedByAdminUserId = admin?.Id;
        item.DeletedByAdminName = admin?.Name;
        item.DeleteReason = reason;
    }

    private static void ClearDelete(DiningOrder order, bool restoreItems)
    {
        order.IsDeleted = false;
        order.DeletedAtUtc = null;
        order.DeletedByAdminUserId = null;
        order.DeletedByAdminName = null;
        order.DeleteReason = null;

        if (!restoreItems) return;

        foreach (var item in order.Items)
        {
            item.IsDeleted = false;
            item.DeletedAtUtc = null;
            item.DeletedByAdminUserId = null;
            item.DeletedByAdminName = null;
            item.DeleteReason = null;
        }
    }
}

public sealed record ClearReservationsAndOrdersRequest(string? ConfirmationCode, string? Reason);

public sealed class MaintenanceDeleteRequest
{
    public int? EntityId { get; set; }
    public DateOnly? FromDate { get; set; }
    public DateOnly? ToDate { get; set; }
    public string? Reason { get; set; }
}
