namespace SeatMap.Api.Platform.Models;

// A rebuildable projection. Full booking/contact snapshots remain restaurant-owned.
// Integer reservation IDs are unique only within one restaurant database.
public sealed class GuestReservationReference
{
    public string RestaurantId { get; set; } = string.Empty;
    public int ReservationId { get; set; }
    public Guid GuestProfileId { get; set; }
    public DateOnly ReservedDate { get; set; }
    public string ReservedTime { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public long SourceVersion { get; set; }
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
