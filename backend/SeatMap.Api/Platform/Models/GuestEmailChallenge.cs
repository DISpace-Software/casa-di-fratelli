namespace SeatMap.Api.Platform.Models;

public sealed class GuestEmailChallenge
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GuestProfileId { get; set; }
    public GuestProfile Profile { get; set; } = null!;
    public string Email { get; set; } = "";
    public string Purpose { get; set; } = "";
    public string CodeHash { get; set; } = "";
    public int Attempts { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? ConsumedAtUtc { get; set; }
}
