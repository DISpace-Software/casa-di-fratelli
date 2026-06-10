namespace CasaDiFratelli.Api.Models;

public class DiningOrderItemInventoryExtra
{
    public int Id { get; set; }

    public int DiningOrderItemId { get; set; }

    public DiningOrderItem? DiningOrderItem { get; set; }

    public int InventoryItemId { get; set; }

    public InventoryItem? InventoryItem { get; set; }

    public decimal Quantity { get; set; }

    public string? Notes { get; set; }
}
