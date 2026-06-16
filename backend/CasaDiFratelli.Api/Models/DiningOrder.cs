namespace CasaDiFratelli.Api.Models;

public class DiningOrder
{
    public int Id { get; set; }

    public int ReservationId { get; set; }

    public Reservation? Reservation { get; set; }

    public string GuestName { get; set; } = string.Empty;

    public string TableLabel { get; set; } = string.Empty;

    public string Status { get; set; } = "New";

    public string Source { get; set; } = "GuestOnline";

    public int? AssignedWaiterId { get; set; }

    public string? AssignedWaiterName { get; set; }

    public DateTime? ClaimedAtUtc { get; set; }

    public decimal TotalPrice { get; set; }

    public string? Notes { get; set; }

    public DateTime? InventoryConsumedAtUtc { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public bool IsDeleted { get; set; } = false;

    public DateTime? DeletedAtUtc { get; set; }

    public int? DeletedByAdminUserId { get; set; }

    public string? DeletedByAdminName { get; set; }

    public string? DeleteReason { get; set; }

    public List<DiningOrderItem> Items { get; set; } = new();
}
