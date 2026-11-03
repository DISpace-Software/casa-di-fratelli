namespace SeatMap.Api.Models;

public class BlacklistEntry
{
    public int Id { get; set; }

    public string? GuestName { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }

    public string Reason { get; set; } = string.Empty;
    public string? Notes { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}