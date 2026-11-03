namespace SeatMap.Api.Models;

public class AdminDeviceCredential
{
    public int Id { get; set; }
    public int AdminUserId { get; set; }
    public string Label { get; set; } = "";
    public string CredentialHash { get; set; } = "";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? LastUsedAtUtc { get; set; }
    public bool IsActive { get; set; } = true;

    public AdminUser? AdminUser { get; set; }
}
