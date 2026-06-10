namespace CasaDiFratelli.Api.Models;

public class MenuItemRecipeIngredient
{
    public int Id { get; set; }

    public int MenuItemId { get; set; }

    public MenuItem? MenuItem { get; set; }

    public int InventoryItemId { get; set; }

    public InventoryItem? InventoryItem { get; set; }

    public decimal Quantity { get; set; }

    public string? Notes { get; set; }
}
