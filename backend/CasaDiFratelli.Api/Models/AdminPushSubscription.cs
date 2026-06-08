namespace CasaDiFratelli.Api.Models;

public class AdminPushSubscription
{
    public int Id { get; set; }

    public int AdminUserId { get; set; }

    public AdminUser? AdminUser { get; set; }

    public string Endpoint { get; set; } = string.Empty;

    public string P256Dh { get; set; } = string.Empty;

    public string Auth { get; set; } = string.Empty;

    public string UserAgent { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? LastUsedAtUtc { get; set; }
}
