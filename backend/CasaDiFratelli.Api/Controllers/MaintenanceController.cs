using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Filters;
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
    public async Task<IActionResult> ClearReservationsAndOrders()
    {
        var admin = AdminAuthService.Current(HttpContext);
        if (!AdminRoleAccess.CanClearOperationalData(admin?.Role))
            return Forbid();

        var before = new
        {
            Reservations = await _db.Reservations.CountAsync(),
            ReservationTables = await _db.ReservationTables.CountAsync(),
            DiningOrders = await _db.DiningOrders.CountAsync(),
            DiningOrderItems = await _db.DiningOrderItems.CountAsync()
        };

        await using var transaction = await _db.Database.BeginTransactionAsync();

        var deletedOrderItems = await _db.DiningOrderItems.ExecuteDeleteAsync();
        var deletedOrders = await _db.DiningOrders.ExecuteDeleteAsync();
        var deletedReservationTables = await _db.ReservationTables.ExecuteDeleteAsync();
        var deletedReservations = await _db.Reservations.ExecuteDeleteAsync();

        var deleted = new
        {
            Reservations = deletedReservations,
            ReservationTables = deletedReservationTables,
            DiningOrders = deletedOrders,
            DiningOrderItems = deletedOrderItems
        };

        await _audit.RecordAsync(HttpContext, "clear", "OperationalData", "reservations-and-orders", before, deleted);
        await transaction.CommitAsync();

        return Ok(new
        {
            Message = "Reservations and dining orders were cleared.",
            Before = before,
            Deleted = deleted
        });
    }
}
