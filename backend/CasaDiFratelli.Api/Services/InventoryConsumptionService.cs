using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Services;

public class InventoryConsumptionService
{
    private readonly AppDbContext _db;

    public InventoryConsumptionService(AppDbContext db)
    {
        _db = db;
    }

    public static bool IsFinalOrderStatus(string? status)
    {
        return status is not null &&
            (status.Equals("Paid", StringComparison.OrdinalIgnoreCase) ||
             status.Equals("Completed", StringComparison.OrdinalIgnoreCase));
    }

    public async Task<InventoryConsumptionResult> ConsumeOrderAsync(int orderId, AdminPrincipal? admin, string? comment = null)
    {
        await using var transaction = await _db.Database.BeginTransactionAsync();

        var order = await _db.DiningOrders
            .Include(x => x.Items)
                .ThenInclude(x => x.InventoryExtras)
            .FirstOrDefaultAsync(x => x.Id == orderId);

        if (order == null)
            return new InventoryConsumptionResult(false, "Order was not found.", 0);

        if (order.InventoryConsumedAtUtc.HasValue)
            return new InventoryConsumptionResult(true, "Inventory was already consumed for this order.", 0);

        var menuItemIds = order.Items
            .Where(x => x.MenuItemId.HasValue && x.Quantity > 0)
            .Select(x => x.MenuItemId!.Value)
            .Distinct()
            .ToList();

        var recipeLines = await _db.MenuItemRecipeIngredients
            .Where(x => menuItemIds.Contains(x.MenuItemId))
            .ToListAsync();

        var required = new Dictionary<int, decimal>();

        foreach (var orderItem in order.Items.Where(x => x.Quantity > 0))
        {
            if (orderItem.MenuItemId.HasValue)
            {
                foreach (var line in recipeLines.Where(x => x.MenuItemId == orderItem.MenuItemId.Value))
                {
                    AddRequired(required, line.InventoryItemId, line.Quantity * orderItem.Quantity);
                }
            }

            foreach (var extra in orderItem.InventoryExtras.Where(x => x.Quantity > 0))
            {
                AddRequired(required, extra.InventoryItemId, extra.Quantity * orderItem.Quantity);
            }
        }

        if (required.Count == 0)
        {
            order.InventoryConsumedAtUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();
            return new InventoryConsumptionResult(true, "No recipes were configured for this order.", 0);
        }

        var itemIds = required.Keys.ToList();
        var inventoryItems = await _db.InventoryItems
            .Where(x => itemIds.Contains(x.Id))
            .ToListAsync();

        var now = DateTime.UtcNow;
        foreach (var ingredient in inventoryItems)
        {
            var quantity = required[ingredient.Id];
            ingredient.CurrentQuantity -= quantity;
            ingredient.UpdatedAtUtc = now;

            _db.InventoryMovements.Add(new InventoryMovement
            {
                InventoryItemId = ingredient.Id,
                Quantity = -quantity,
                Type = "SaleConsumption",
                CreatedAtUtc = now,
                AdminUserId = admin?.Id,
                AdminName = admin?.Name,
                Comment = comment ?? $"Auto consumption for order #{order.Id}",
                DiningOrderId = order.Id
            });
        }

        order.InventoryConsumedAtUtc = now;
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();

        return new InventoryConsumptionResult(true, "Inventory consumed.", required.Count);
    }

    private static void AddRequired(Dictionary<int, decimal> required, int itemId, decimal quantity)
    {
        if (quantity <= 0) return;
        required[itemId] = required.TryGetValue(itemId, out var existing) ? existing + quantity : quantity;
    }
}

public record InventoryConsumptionResult(bool Success, string Message, int IngredientCount);
