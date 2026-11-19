using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;
using SeatMap.Api.Platform.Models;

namespace SeatMap.Api.Platform.Auth;

public class GuestProfileRequest : IValidatableObject
{
    [Required, StringLength(60, MinimumLength = 1)] public string FirstName { get; set; } = "";
    [Required, StringLength(60, MinimumLength = 1)] public string LastName { get; set; } = "";
    [Required, EmailAddress, StringLength(254)] public string Email { get; set; } = "";
    [Required, StringLength(30)] public string Phone { get; set; } = "";
    [StringLength(100)] public string City { get; set; } = "";
    [StringLength(80)] public string Country { get; set; } = "";
    public DateOnly? DateOfBirth { get; set; }
    [Required, RegularExpression("^(ru|en|bg)$")] public string PreferredLanguage { get; set; } = "ru";
    public bool MarketingConsent { get; set; }
    // Required only when changing the email used for sign-in.
    [StringLength(128)] public string? CurrentPassword { get; set; }
    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (new[] { FirstName, LastName, City, Country }.Any(value => value?.Any(char.IsControl) == true))
            yield return new("Text fields cannot contain control characters.");
        if (string.IsNullOrWhiteSpace(FirstName) || string.IsNullOrWhiteSpace(LastName))
            yield return new("First and last name are required.", [nameof(FirstName), nameof(LastName)]);
        if (!Regex.IsMatch(NormalizePhone(Phone ?? ""), @"^\+[1-9]\d{6,14}$"))
            yield return new("Use an international phone number, for example +359888123456.", [nameof(Phone)]);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        if (DateOfBirth.HasValue && (DateOfBirth > today || DateOfBirth < today.AddYears(-120)))
            yield return new("Date of birth must be a valid past date.", [nameof(DateOfBirth)]);
    }
    public static string NormalizePhone(string value) => Regex.Replace(value.Trim(), @"[\s()\-]", "");
}

public sealed class GuestRegisterRequest : GuestProfileRequest
{
    [Required, StringLength(128, MinimumLength = 12)] public string Password { get; set; } = "";
    [Required, Compare(nameof(Password))] public string ConfirmPassword { get; set; } = "";
    [Range(typeof(bool), "true", "true")] public bool PrivacyConsent { get; set; }
}
public sealed record GuestLoginRequest(
    [Required, EmailAddress, StringLength(254)] string Email,
    [Required, StringLength(128)] string Password);
public sealed class GuestPasswordRequest
{
    [Required, StringLength(128)] public string CurrentPassword { get; set; } = "";
    [Required, StringLength(128, MinimumLength = 12)] public string NewPassword { get; set; } = "";
    [Required, Compare(nameof(NewPassword))] public string ConfirmPassword { get; set; } = "";
}
public sealed record GuestDeleteRequest([Required, StringLength(128)] string CurrentPassword);
public sealed record GuestProfileDto(Guid Id, string FirstName, string LastName, string Name,
    string Email, string Phone, string City, string Country, DateOnly? DateOfBirth,
    string PreferredLanguage, bool MarketingConsent, DateTime CreatedAtUtc, bool EmailVerified)
{
    public static GuestProfileDto From(GuestProfile profile) => new(profile.Id, profile.FirstName,
        profile.LastName, profile.DisplayName, profile.Email ?? "", profile.Phone ?? "", profile.City,
        profile.Country, profile.DateOfBirth, profile.PreferredLanguage, profile.MarketingConsent, profile.CreatedAtUtc, profile.EmailVerifiedAtUtc.HasValue);
}
public sealed record GuestAuthResult(string Token, DateTime ExpiresAtUtc, GuestProfileDto Profile);
public sealed class GuestAuthException(int status, string code, string message) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
}

public sealed record GuestEmailRequest([Required, EmailAddress, StringLength(254)] string Email);
public sealed record GuestChallengeResult(Guid ChallengeId, DateTime ExpiresAtUtc, int ResendAfterSeconds = 60);
public class GuestCodeRequest
{
    public Guid ChallengeId { get; set; }
    [Required, RegularExpression(@"^\d{6}$")] public string Code { get; set; } = "";
}
public sealed class GuestResetRequest : GuestCodeRequest
{
    [Required, StringLength(128, MinimumLength = 12)] public string NewPassword { get; set; } = "";
    [Required, Compare(nameof(NewPassword))] public string ConfirmPassword { get; set; } = "";
}
