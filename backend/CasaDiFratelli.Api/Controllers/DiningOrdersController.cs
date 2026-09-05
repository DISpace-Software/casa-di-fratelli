using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Dtos;
using CasaDiFratelli.Api.Filters;
using CasaDiFratelli.Api.Models;
using CasaDiFratelli.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Controllers;

[ApiController]
[Route("api/dining-orders")]
[ProOnly]
public class DiningOrdersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AuditService _audit;
    private readonly InventoryConsumptionService _inventory;

    public DiningOrdersController(AppDbContext db, AuditService audit, InventoryConsumptionService inventory)
    {
        _db = db;
        _audit = audit;
        _inventory = inventory;
    }

    private async Task RecalculateOrderTotalAsync(DiningOrder order)
    {
        if (order.Id == 0)
        {
            order.TotalPrice = order.Items.Sum(x => x.UnitPrice * x.Quantity);
            return;
        }

        order.TotalPrice = await _db.DiningOrderItems
            .Where(x => x.DiningOrderId == order.Id)
            .SumAsync(x => x.UnitPrice * x.Quantity);
    }

    private static string NormalizeItemKind(string? kind)
    {
        return string.Equals(kind, "Drink", StringComparison.OrdinalIgnoreCase) ? "Drink" : "Dish";
    }

    private async Task<string> ResolveItemKindAsync(CreateDiningOrderItemRequest request)
    {
        if (request.MenuItemId.HasValue)
        {
            var department = await _db.MenuItems
                .Where(x => x.Id == request.MenuItemId.Value)
                .Select(x => x.Department)
                .FirstOrDefaultAsync();

            if (string.Equals(department, "Bar", StringComparison.OrdinalIgnoreCase))
                return "Drink";
        }

        return NormalizeItemKind(request.Kind);
    }

    private static void AddOrIncreaseItem(DiningOrder order, CreateDiningOrderItemRequest request, string source, string kind)
    {
        var name = request.Name.Trim();
        var quantity = Math.Min(request.Quantity, 99);
        var notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        var hasInventoryExtras = request.InventoryExtras.Any(x => x.InventoryItemId > 0 && x.Quantity > 0);
        var existingItem = hasInventoryExtras ? null : order.Items.FirstOrDefault(x =>
            x.Status == "New" &&
            x.Source == source &&
            x.Kind == kind &&
            x.MenuItemId == request.MenuItemId &&
            x.Name.Equals(name, StringComparison.OrdinalIgnoreCase) &&
            x.UnitPrice == request.UnitPrice &&
            x.Notes == notes);

        if (existingItem == null)
        {
            order.Items.Add(new DiningOrderItem
            {
                MenuItemId = request.MenuItemId,
                Name = name,
                UnitPrice = request.UnitPrice,
                Quantity = quantity,
                Notes = notes,
                Source = source,
                Kind = kind,
                InventoryExtras = request.InventoryExtras
                    .Where(x => x.InventoryItemId > 0 && x.Quantity > 0)
                    .Select(x => new DiningOrderItemInventoryExtra
                    {
                        InventoryItemId = x.InventoryItemId,
                        Quantity = x.Quantity,
                        Notes = string.IsNullOrWhiteSpace(x.Notes) ? null : x.Notes.Trim()
                    })
                    .ToList()
            });
        }
        else
        {
            existingItem.Quantity = Math.Min(existingItem.Quantity + quantity, 99);
        }

        order.Status = "New";
        order.TotalPrice = order.Items.Sum(x => x.UnitPrice * x.Quantity);
    }

    private static bool IsProductionOrManager(AdminPrincipal? admin)
    {
        var role = AdminRoleAccess.Normalize(admin?.Role);
        return role is AdminRoleAccess.Kitchen or AdminRoleAccess.Bar or AdminRoleAccess.Owner or AdminRoleAccess.Administrator or AdminRoleAccess.Developer;
    }

    private static bool CanProductionRoleSeeItem(string role, DiningOrderItem item)
    {
        return role switch
        {
            AdminRoleAccess.Kitchen => item.Kind == "Dish",
            AdminRoleAccess.Bar => item.Kind == "Drink",
            _ => true
        };
    }

    private static bool CanWorkWithOrder(AdminPrincipal? admin, DiningOrder order)
    {
        if (admin == null) return false;

        var role = AdminRoleAccess.Normalize(admin.Role);
        if (role is AdminRoleAccess.Owner or AdminRoleAccess.Administrator or AdminRoleAccess.Developer or AdminRoleAccess.Kitchen or AdminRoleAccess.Bar)
            return true;

        return role == AdminRoleAccess.Waiter &&
            (!order.AssignedWaiterId.HasValue || order.AssignedWaiterId.Value == admin.Id);
    }

    private static void AssignToWaiterIfNeeded(DiningOrder order, AdminPrincipal? admin)
    {
        if (admin == null || AdminRoleAccess.Normalize(admin.Role) != AdminRoleAccess.Waiter)
            return;

        order.AssignedWaiterId ??= admin.Id;
        order.AssignedWaiterName ??= admin.Name;
        order.ClaimedAtUtc ??= DateTime.UtcNow;
    }

    [HttpGet]
    [AdminAuthorize]
    public async Task<IActionResult> GetAll()
    {
        var admin = AdminAuthService.Current(HttpContext);
        var role = AdminRoleAccess.Normalize(admin?.Role);
        var query = _db.DiningOrders
            .Include(x => x.Items)
            .Include(x => x.Reservation)
                .ThenInclude(x => x!.Tables)
            .AsQueryable();

        if (role == AdminRoleAccess.Waiter && admin != null)
        {
            query = query.Where(x => !x.AssignedWaiterId.HasValue || x.AssignedWaiterId == admin.Id);
        }
        else if (role == AdminRoleAccess.Kitchen)
        {
            query = query.Where(x => x.Items.Any(item => item.Kind == "Dish"));
        }
        else if (role == AdminRoleAccess.Bar)
        {
            query = query.Where(x => x.Items.Any(item => item.Kind == "Drink"));
        }

        var orderEntities = await query
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync();

        var orders = orderEntities.Select(x => new
            {
                x.Id,
                x.ReservationId,
                x.GuestName,
                x.TableLabel,
                x.Status,
                x.Source,
                x.AssignedWaiterId,
                x.AssignedWaiterName,
                x.ClaimedAtUtc,
                x.TotalPrice,
                x.Notes,
                x.InventoryConsumedAtUtc,
                x.CreatedAtUtc,
                Reservation = x.Reservation == null ? null : new
                {
                    x.Reservation.Phone,
                    x.Reservation.Email,
                    x.Reservation.ReservedDate,
                    x.Reservation.ReservedTime,
                    x.Reservation.IsWalkIn,
                    TableIds = x.Reservation.Tables.Select(t => t.TableCode).ToList()
                },
                Items = x.Items
                    .Where(item => CanProductionRoleSeeItem(role, item))
                    .Select(item => new
                    {
                        item.Id,
                        item.MenuItemId,
                        item.Name,
                        item.UnitPrice,
                        item.Quantity,
                        item.Notes,
                        item.Status,
                        item.Source,
                        item.Kind,
                        item.WaiterSeenAtUtc
                    }).ToList()
            })
            .ToList();

        return Ok(orders);
    }

    [HttpGet("reservation/{reservationId:int}")]
    [AdminAuthorize]
    public async Task<IActionResult> GetForReservation(int reservationId)
    {
        var orders = await _db.DiningOrders
            .Include(x => x.Items)
            .Include(x => x.Reservation)
                .ThenInclude(x => x!.Tables)
            .Where(x => x.ReservationId == reservationId && x.Status != "Cancelled")
            .OrderBy(x => x.CreatedAtUtc)
            .ToListAsync();

        return Ok(orders.Select(x => new
        {
            x.Id,
            x.ReservationId,
            x.GuestName,
            TableLabel = x.Reservation == null ? x.TableLabel : string.Join(", ", x.Reservation.Tables.Select(t => t.TableCode)),
            x.Status,
            x.Source,
            x.AssignedWaiterId,
            x.AssignedWaiterName,
            x.ClaimedAtUtc,
            x.TotalPrice,
            x.Notes,
            x.InventoryConsumedAtUtc,
            x.CreatedAtUtc,
            Items = x.Items.Select(item => new
            {
                item.Id,
                item.MenuItemId,
                item.Name,
                item.UnitPrice,
                item.Quantity,
                item.Notes,
                item.Status,
                item.Source,
                item.Kind,
                item.WaiterSeenAtUtc
            }).ToList()
        }));
    }

    [HttpGet("session")]
    public async Task<IActionResult> GetSession([FromQuery] int reservationId, [FromQuery] string token)
    {
        var reservation = await _db.Reservations
            .Include(x => x.Tables)
            .FirstOrDefaultAsync(x => x.Id == reservationId && x.OrderAccessToken == token);

        if (reservation == null)
            return NotFound(new { message = "Order session was not found." });

        if (!reservation.IsArrived || reservation.Status == "Cancelled")
            return BadRequest(new { message = "This order link is not active." });

        return Ok(new
        {
            reservation.Id,
            reservation.GuestName,
            reservation.ReservedDate,
            reservation.ReservedTime,
            TableIds = reservation.Tables.Select(t => t.TableCode).ToList()
        });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateDiningOrderRequest request)
    {
        if (request.Items == null || request.Items.Count == 0)
            return BadRequest(new { message = "Order must contain at least one item." });

        if (request.Items.Any(x => x == null || !x.MenuItemId.HasValue || x.MenuItemId <= 0 || x.Quantity <= 0))
            return BadRequest(new { message = "Each item must reference a menu item and have a positive quantity." });

        var reservation = await _db.Reservations
            .Include(x => x.Tables)
            .FirstOrDefaultAsync(x => x.Id == request.ReservationId && x.OrderAccessToken == request.Token);

        if (reservation == null)
            return NotFound(new { message = "Order session was not found." });

        if (!reservation.IsArrived || reservation.Status == "Cancelled")
            return BadRequest(new { message = "This order link is not active." });

        var menuItemIds = request.Items
            .Select(x => x.MenuItemId!.Value)
            .Distinct()
            .ToList();
        var menuItems = await _db.MenuItems
            .AsNoTracking()
            .Where(x => menuItemIds.Contains(x.Id) && x.IsActive)
            .ToDictionaryAsync(x => x.Id);

        if (menuItems.Count != menuItemIds.Count)
            return BadRequest(new { message = "One or more menu items are no longer available. Please refresh the menu." });

        var items = request.Items
            .Select(x => new DiningOrderItem
            {
                MenuItemId = x.MenuItemId,
                Name = menuItems[x.MenuItemId!.Value].NameBg,
                UnitPrice = menuItems[x.MenuItemId!.Value].Price,
                Quantity = Math.Min(x.Quantity, 99),
                Notes = string.IsNullOrWhiteSpace(x.Notes) ? null : x.Notes.Trim(),
                Source = "GuestOnline",
                Kind = string.Equals(menuItems[x.MenuItemId!.Value].Department, "Bar", StringComparison.OrdinalIgnoreCase)
                    ? "Drink"
                    : "Dish"
            })
            .ToList();

        if (items.Count == 0)
            return BadRequest(new { message = "Order must contain valid items." });

        var order = new DiningOrder
        {
            ReservationId = reservation.Id,
            GuestName = reservation.GuestName,
            TableLabel = string.Join(", ", reservation.Tables.Select(t => t.TableCode)),
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            Source = "GuestOnline",
            TotalPrice = items.Sum(x => x.UnitPrice * x.Quantity),
            CreatedAtUtc = DateTime.UtcNow,
            Items = items
        };

        _db.DiningOrders.Add(order);
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "create", "DiningOrder", order.Id.ToString(), after: new { order.Id, order.ReservationId, order.TableLabel, order.TotalPrice });

        return Ok(new
        {
            order.Id,
            order.Status,
            order.TotalPrice
        });
    }

    [HttpPost("request")]
    public async Task<IActionResult> CreateGuestRequest([FromBody] CreateDiningOrderGuestRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Type))
            return BadRequest(new { message = "Request type is required." });

        var requestType = request.Type.Trim().ToLowerInvariant();
        if (requestType is not ("call-waiter" or "bill"))
            return BadRequest(new { message = "Invalid request type." });

        var reservation = await _db.Reservations
            .Include(x => x.Tables)
            .FirstOrDefaultAsync(x => x.Id == request.ReservationId && x.OrderAccessToken == request.Token);

        if (reservation == null)
            return NotFound(new { message = "Order session was not found." });

        if (!reservation.IsArrived || reservation.Status == "Cancelled")
            return BadRequest(new { message = "This order link is not active." });

        var order = await _db.DiningOrders
            .Include(x => x.Items)
            .Where(x => x.ReservationId == reservation.Id && x.Status != "Cancelled")
            .OrderBy(x => x.CreatedAtUtc)
            .FirstOrDefaultAsync();

        if (order == null)
        {
            order = new DiningOrder
            {
                ReservationId = reservation.Id,
                GuestName = reservation.GuestName,
                TableLabel = string.Join(", ", reservation.Tables.Select(t => t.TableCode)),
                Source = "GuestOnline",
                CreatedAtUtc = DateTime.UtcNow
            };
            _db.DiningOrders.Add(order);
        }

        var name = requestType == "bill" ? "Иска сметка" : "Повикай сервитьор";
        order.Items.Add(new DiningOrderItem
        {
            Name = name,
            UnitPrice = 0,
            Quantity = 1,
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            Source = "GuestOnline",
            Kind = requestType == "bill" ? "BillRequest" : "WaiterCall"
        });

        order.Status = "New";
        await RecalculateOrderTotalAsync(order);
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "guest-request", "DiningOrder", order.Id.ToString(), after: new { order.Id, order.ReservationId, Type = requestType });

        return Ok(new { order.Id, Type = requestType });
    }

    [HttpPost("reservations/{reservationId:int}/items")]
    [AdminAuthorize]
    public async Task<IActionResult> AddReservationItem(int reservationId, [FromBody] CreateDiningOrderItemRequest request)
    {
        var admin = AdminAuthService.Current(HttpContext);
        if (request.Quantity <= 0 || string.IsNullOrWhiteSpace(request.Name) || request.UnitPrice < 0)
            return BadRequest(new { message = "Order item is required." });

        var reservation = await _db.Reservations
            .Include(x => x.Tables)
            .FirstOrDefaultAsync(x => x.Id == reservationId);

        if (reservation == null)
            return NotFound();

        var order = await _db.DiningOrders
            .Include(x => x.Items)
            .Where(x => x.ReservationId == reservationId && x.Status != "Cancelled")
            .OrderBy(x => x.CreatedAtUtc)
            .FirstOrDefaultAsync();

        if (order == null)
        {
            order = new DiningOrder
            {
                ReservationId = reservation.Id,
                GuestName = reservation.GuestName,
                TableLabel = string.Join(", ", reservation.Tables.Select(t => t.TableCode)),
                Status = "New",
                Source = AdminRoleAccess.Normalize(admin?.Role) == AdminRoleAccess.Waiter ? "Waiter" : "Admin",
                CreatedAtUtc = DateTime.UtcNow
            };
            _db.DiningOrders.Add(order);
        }
        else if (!CanWorkWithOrder(admin, order))
        {
            return Forbid();
        }

        AssignToWaiterIfNeeded(order, admin);
        var itemSource = AdminRoleAccess.Normalize(admin?.Role) == AdminRoleAccess.Waiter ? "Waiter" : "Admin";
        AddOrIncreaseItem(order, request, itemSource, await ResolveItemKindAsync(request));
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "add-item", "DiningOrder", order.Id.ToString(), after: new { order.Id, order.ReservationId, order.TotalPrice });

        return Ok(new { order.Id, order.TotalPrice });
    }

    [HttpPost("{orderId:int}/items")]
    [AdminAuthorize]
    public async Task<IActionResult> AddOrderItem(int orderId, [FromBody] CreateDiningOrderItemRequest request)
    {
        var admin = AdminAuthService.Current(HttpContext);
        if (request.Quantity <= 0 || string.IsNullOrWhiteSpace(request.Name) || request.UnitPrice < 0)
            return BadRequest(new { message = "Order item is required." });

        var order = await _db.DiningOrders
            .Include(x => x.Items)
            .FirstOrDefaultAsync(x => x.Id == orderId && x.Status != "Cancelled");

        if (order == null)
            return NotFound();

        if (!CanWorkWithOrder(admin, order))
            return Forbid();

        AssignToWaiterIfNeeded(order, admin);
        var itemSource = AdminRoleAccess.Normalize(admin?.Role) == AdminRoleAccess.Waiter ? "Waiter" : "Admin";
        AddOrIncreaseItem(order, request, itemSource, await ResolveItemKindAsync(request));
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "add-item", "DiningOrder", order.Id.ToString(), after: new { order.Id, order.ReservationId, order.TotalPrice });

        return Ok(new { order.Id, order.TotalPrice });
    }

    [HttpPatch("items/{itemId:int}")]
    [HttpPatch("{orderId:int}/items/{itemId:int}")]
    [AdminAuthorize]
    public async Task<IActionResult> UpdateItemQuantity(int itemId, [FromBody] UpdateDiningOrderItemRequest request, int? orderId = null)
    {
        var admin = AdminAuthService.Current(HttpContext);
        var item = await _db.DiningOrderItems.FirstOrDefaultAsync(x =>
            x.Id == itemId &&
            (!orderId.HasValue || x.DiningOrderId == orderId.Value));

        if (item == null)
            return NotFound();

        var parentOrderId = item.DiningOrderId;
        var order = await _db.DiningOrders.FirstOrDefaultAsync(x => x.Id == parentOrderId);

        if (order == null)
            return NotFound();

        if (!CanWorkWithOrder(admin, order))
            return Forbid();

        if (request.Quantity <= 0)
        {
            _db.DiningOrderItems.Remove(item);
        }
        else
        {
            item.Quantity = Math.Min(request.Quantity, 99);
        }

        await _db.SaveChangesAsync();

        await RecalculateOrderTotalAsync(order);

        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "update-item", "DiningOrder", order.Id.ToString(), after: new { order.Id, order.TotalPrice });

        return Ok(new { order.Id, order.TotalPrice });
    }

    [HttpPatch("{id}/status")]
    [AdminAuthorize]
    public async Task<IActionResult> UpdateStatus(int id, [FromBody] UpdateDiningOrderStatusRequest request)
    {
        var admin = AdminAuthService.Current(HttpContext);
        var order = await _db.DiningOrders.FindAsync(id);

        if (order == null)
            return NotFound();

        if (!CanWorkWithOrder(admin, order))
            return Forbid();

        var nextStatus = string.IsNullOrWhiteSpace(request.Status) ? "New" : request.Status.Trim();
        if (!new[] { "New", "Seen", "Preparing", "Done", "Paid", "Completed", "Cancelled" }.Contains(nextStatus))
            return BadRequest(new { message = "Invalid order status." });

        var previousStatus = order.Status;
        var role = AdminRoleAccess.Normalize(admin?.Role);
        if (role == AdminRoleAccess.Waiter && nextStatus == "Seen")
        {
            await _db.DiningOrderItems
                .Where(item =>
                    item.DiningOrderId == order.Id &&
                    item.Source == "GuestOnline" &&
                    item.WaiterSeenAtUtc == null)
                .ExecuteUpdateAsync(setters => setters.SetProperty(item => item.WaiterSeenAtUtc, DateTime.UtcNow));

            await _audit.RecordAsync(HttpContext, "waiter-seen", "DiningOrder", order.Id.ToString(), new { Status = previousStatus }, new { SeenAtUtc = DateTime.UtcNow });
            return Ok(new { order.Id, order.Status });
        }

        order.Status = nextStatus;
        await _db.SaveChangesAsync();

        if (InventoryConsumptionService.IsFinalOrderStatus(nextStatus))
        {
            await _inventory.ConsumeOrderAsync(order.Id, admin, $"Order marked as {nextStatus}");
        }

        await _audit.RecordAsync(HttpContext, "update-status", "DiningOrder", order.Id.ToString(), new { Status = previousStatus }, new { order.Status });

        return Ok(new { order.Id, order.Status });
    }

    [HttpPost("{id:int}/claim")]
    [AdminAuthorize]
    public async Task<IActionResult> Claim(int id)
    {
        var admin = AdminAuthService.Current(HttpContext);
        if (admin == null || AdminRoleAccess.Normalize(admin.Role) != AdminRoleAccess.Waiter)
            return Forbid();

        var order = await _db.DiningOrders.FindAsync(id);
        if (order == null)
            return NotFound();

        if (order.AssignedWaiterId.HasValue && order.AssignedWaiterId.Value != admin.Id)
            return Conflict(new { message = "Order is already assigned to another waiter." });

        order.AssignedWaiterId = admin.Id;
        order.AssignedWaiterName = admin.Name;
        order.ClaimedAtUtc ??= DateTime.UtcNow;

        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "claim", "DiningOrder", order.Id.ToString(), after: new { order.Id, order.AssignedWaiterId, order.AssignedWaiterName });

        return Ok(new { order.Id, order.AssignedWaiterId, order.AssignedWaiterName, order.ClaimedAtUtc });
    }

    [HttpPost("reservations/{reservationId:int}/claim")]
    [AdminAuthorize]
    public async Task<IActionResult> ClaimReservation(int reservationId)
    {
        var admin = AdminAuthService.Current(HttpContext);
        if (admin == null || AdminRoleAccess.Normalize(admin.Role) != AdminRoleAccess.Waiter)
            return Forbid();

        var reservation = await _db.Reservations
            .Include(x => x.Tables)
            .FirstOrDefaultAsync(x => x.Id == reservationId);

        if (reservation == null)
            return NotFound();

        var order = await _db.DiningOrders
            .Where(x => x.ReservationId == reservationId && x.Status != "Cancelled")
            .OrderBy(x => x.CreatedAtUtc)
            .FirstOrDefaultAsync();

        if (order == null)
        {
            order = new DiningOrder
            {
                ReservationId = reservation.Id,
                GuestName = reservation.GuestName,
                TableLabel = string.Join(", ", reservation.Tables.Select(t => t.TableCode)),
                Status = "Seen",
                Source = "Waiter",
                CreatedAtUtc = DateTime.UtcNow
            };
            _db.DiningOrders.Add(order);
        }
        else if (order.AssignedWaiterId.HasValue && order.AssignedWaiterId.Value != admin.Id)
        {
            return Conflict(new { message = "Reservation is already assigned to another waiter." });
        }

        order.AssignedWaiterId = admin.Id;
        order.AssignedWaiterName = admin.Name;
        order.ClaimedAtUtc ??= DateTime.UtcNow;

        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "claim-reservation", "DiningOrder", order.Id.ToString(), after: new { order.Id, order.ReservationId, order.AssignedWaiterId, order.AssignedWaiterName });

        return Ok(new { order.Id, order.ReservationId, order.AssignedWaiterId, order.AssignedWaiterName, order.ClaimedAtUtc });
    }

    [HttpPatch("items/{itemId:int}/status")]
    [AdminAuthorize]
    public async Task<IActionResult> UpdateItemStatus(int itemId, [FromBody] UpdateDiningOrderItemStatusRequest request)
    {
        var admin = AdminAuthService.Current(HttpContext);
        if (admin == null)
            return Forbid();

        var item = await _db.DiningOrderItems
            .Include(x => x.DiningOrder)
                .ThenInclude(x => x!.Items)
            .FirstOrDefaultAsync(x => x.Id == itemId);

        if (item?.DiningOrder == null)
            return NotFound();

        var nextStatus = string.IsNullOrWhiteSpace(request.Status) ? "New" : request.Status.Trim();
        if (!new[] { "New", "Seen", "Preparing", "Ready", "Done", "Cancelled" }.Contains(nextStatus))
            return BadRequest(new { message = "Invalid item status." });

        var role = AdminRoleAccess.Normalize(admin.Role);
        if (role == AdminRoleAccess.Waiter)
        {
            if (nextStatus != "Done" || !CanWorkWithOrder(admin, item.DiningOrder))
                return Forbid();

            AssignToWaiterIfNeeded(item.DiningOrder, admin);
        }
        else if (!IsProductionOrManager(admin))
        {
            return Forbid();
        }

        if ((role == AdminRoleAccess.Kitchen && item.Kind != "Dish") ||
            (role == AdminRoleAccess.Bar && item.Kind != "Drink"))
        {
            return Forbid();
        }

        var previousStatus = item.Status;
        item.Status = nextStatus;

        if (item.DiningOrder.Items.Count > 0 && item.DiningOrder.Items.All(x => x.Status == "Ready" || x.Status == "Done"))
        {
            item.DiningOrder.Status = "Done";
        }
        else if (nextStatus == "Preparing" && item.DiningOrder.Status == "New")
        {
            item.DiningOrder.Status = "Preparing";
        }
        else if (nextStatus == "Seen" && item.DiningOrder.Status == "New")
        {
            item.DiningOrder.Status = "Seen";
        }

        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "update-item-status", "DiningOrderItem", item.Id.ToString(), new { Status = previousStatus }, new { item.Status, OrderStatus = item.DiningOrder.Status });

        return Ok(new { item.Id, item.Status, OrderId = item.DiningOrderId, OrderStatus = item.DiningOrder.Status });
    }

    [HttpPost("items/{itemId:int}/inventory-extras")]
    [AdminAuthorize]
    public async Task<IActionResult> AddItemInventoryExtra(int itemId, [FromBody] CreateDiningOrderItemInventoryExtraRequest request)
    {
        var admin = AdminAuthService.Current(HttpContext);
        var item = await _db.DiningOrderItems
            .Include(x => x.DiningOrder)
            .Include(x => x.InventoryExtras)
            .FirstOrDefaultAsync(x => x.Id == itemId);

        if (item?.DiningOrder == null)
            return NotFound();

        if (!CanWorkWithOrder(admin, item.DiningOrder))
            return Forbid();

        if (item.DiningOrder.InventoryConsumedAtUtc.HasValue)
            return Conflict(new { message = "Inventory was already consumed for this order." });

        if (request.InventoryItemId <= 0 || request.Quantity <= 0)
            return BadRequest(new { message = "Ingredient and positive quantity are required." });

        var ingredientExists = await _db.InventoryItems.AnyAsync(x => x.Id == request.InventoryItemId && x.IsActive);
        if (!ingredientExists)
            return NotFound(new { message = "Ingredient was not found." });

        item.InventoryExtras.Add(new DiningOrderItemInventoryExtra
        {
            InventoryItemId = request.InventoryItemId,
            Quantity = request.Quantity,
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim()
        });

        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "add-inventory-extra", "DiningOrderItem", item.Id.ToString(), after: new { item.Id, request.InventoryItemId, request.Quantity });

        return Ok(new { item.Id, item.DiningOrderId });
    }
}

public class UpdateDiningOrderStatusRequest
{
    public string Status { get; set; } = "Seen";
}

public class CreateDiningOrderGuestRequest
{
    public int ReservationId { get; set; }

    public string Token { get; set; } = string.Empty;

    public string Type { get; set; } = string.Empty;

    public string? Notes { get; set; }
}

public class UpdateDiningOrderItemRequest
{
    public int Quantity { get; set; }
}

public class UpdateDiningOrderItemStatusRequest
{
    public string Status { get; set; } = "Seen";
}
