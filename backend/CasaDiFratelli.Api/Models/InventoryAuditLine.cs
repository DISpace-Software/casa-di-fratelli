namespace CasaDiFratelli.Api.Models;

public class InventoryAuditLine
{
    public int Id { get; set; }

    public int InventoryAuditId { get; set; }

    public InventoryAudit? InventoryAudit { get; set; }

    public int InventoryItemId { get; set; }

    public InventoryItem? InventoryItem { get; set; }

    public decimal ExpectedQuantity { get; set; }

    public decimal ActualQuantity { get; set; }

    public decimal DifferenceQuantity { get; set; }

    public string? Comment { get; set; }
}
