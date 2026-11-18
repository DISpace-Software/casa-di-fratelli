namespace SeatMap.Api.Platform.Models;

public sealed class GuestCredential
{
    public Guid GuestProfileId { get; set; }
    public GuestProfile Profile { get; set; } = null!;
    public string NormalizedEmail { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public int FailedLoginCount { get; set; }
    public DateTime? LockedUntilUtc { get; set; }
}

public sealed class GuestSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GuestProfileId { get; set; }
    public GuestProfile Profile { get; set; } = null!;
    public string TokenHash { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? RevokedAtUtc { get; set; }
}
