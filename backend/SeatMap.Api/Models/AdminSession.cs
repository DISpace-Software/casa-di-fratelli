namespace SeatMap.Api.Models;

public class AdminSession
{
    public int Id { get; set; }
    public int AdminUserId { get; set; }
    public string TokenHash { get; set; } = "";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? RevokedAtUtc { get; set; }
    public string? UserAgent { get; set; }
    public string? IpAddress { get; set; }

    public AdminUser? AdminUser { get; set; }
}
