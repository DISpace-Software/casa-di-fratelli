namespace SeatMap.Api.Platform.Models;

public sealed class GuestFavorite
{
    public Guid GuestProfileId { get; set; }
    public string RestaurantId { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
