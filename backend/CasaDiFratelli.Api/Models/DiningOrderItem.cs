namespace CasaDiFratelli.Api.Models;

public class DiningOrderItem
{
    public int Id { get; set; }

    public int DiningOrderId { get; set; }

    public DiningOrder? DiningOrder { get; set; }

    public int? MenuItemId { get; set; }

    public string Name { get; set; } = string.Empty;

    public decimal UnitPrice { get; set; }

    public int Quantity { get; set; }

    public string? Notes { get; set; }

    public string Status { get; set; } = "New";

    public string Source { get; set; } = "GuestOnline";

    public string Kind { get; set; } = "Dish";

    public DateTime? WaiterSeenAtUtc { get; set; }

    public bool IsDeleted { get; set; } = false;

    public DateTime? DeletedAtUtc { get; set; }

    public int? DeletedByAdminUserId { get; set; }

    public string? DeletedByAdminName { get; set; }

    public string? DeleteReason { get; set; }

    public List<DiningOrderItemInventoryExtra> InventoryExtras { get; set; } = new();
}
