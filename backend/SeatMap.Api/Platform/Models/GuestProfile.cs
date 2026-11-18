namespace SeatMap.Api.Platform.Models;

// Global guest identity; credentials are independent of restaurant staff accounts.
public sealed class GuestProfile
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string IdentityIssuer { get; set; } = string.Empty;
    public string IdentitySubject { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public string Country { get; set; } = string.Empty;
    public DateOnly? DateOfBirth { get; set; }
    public string PreferredLanguage { get; set; } = "ru";
    public bool MarketingConsent { get; set; }
    public DateTime? PrivacyConsentAtUtc { get; set; }
    public string? PrivacyPolicyVersion { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public DateTime? PhoneVerifiedAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
