namespace CasaDiFratelli.Api.Dtos;

public class CreateDiningOrderRequest
{
    public int ReservationId { get; set; }

    public string Token { get; set; } = string.Empty;

    public string? Notes { get; set; }

    public List<CreateDiningOrderItemRequest> Items { get; set; } = new();
}

public class CreateDiningOrderItemRequest
{
    public int? MenuItemId { get; set; }

    public string Name { get; set; } = string.Empty;

    public decimal UnitPrice { get; set; }

    public int Quantity { get; set; }

    public string? Notes { get; set; }

    public string? Kind { get; set; }

    public List<CreateDiningOrderItemInventoryExtraRequest> InventoryExtras { get; set; } = new();
}

public class CreateDiningOrderItemInventoryExtraRequest
{
    public int InventoryItemId { get; set; }

    public decimal Quantity { get; set; }

    public string? Notes { get; set; }
}
