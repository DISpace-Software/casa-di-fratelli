namespace CasaDiFratelli.Api.Models;

public class InventoryMovement
{
    public int Id { get; set; }

    public int InventoryItemId { get; set; }

    public InventoryItem? InventoryItem { get; set; }

    public decimal Quantity { get; set; }

    public string Type { get; set; } = "ManualAdjustment";

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public int? AdminUserId { get; set; }

    public string? AdminName { get; set; }

    public string? Comment { get; set; }

    public int? DiningOrderId { get; set; }

    public int? DiningOrderItemId { get; set; }

    public int? InventoryAuditId { get; set; }
}
