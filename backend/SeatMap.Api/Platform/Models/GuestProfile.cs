namespace SeatMap.Api.Platform.Models;

// Identity credentials belong to a future OIDC provider, not restaurant admin auth.
public sealed class GuestProfile
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string IdentityIssuer { get; set; } = string.Empty;
    public string IdentitySubject { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public DateTime? PhoneVerifiedAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
