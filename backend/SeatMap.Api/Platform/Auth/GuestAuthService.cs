using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SeatMap.Api.Platform.Data;
using SeatMap.Api.Platform.Models;

namespace SeatMap.Api.Platform.Auth;

public sealed class GuestPasswordHasher : PasswordHasher<GuestCredential>
{
    public string DummyHash { get; }
    public GuestPasswordHasher() : base(Microsoft.Extensions.Options.Options.Create(
        new PasswordHasherOptions { IterationCount = 210_000 }))
    {
        DummyHash = HashPassword(new(), Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)));
    }
}

public sealed class GuestAuthService(PlatformDbContext db, GuestPasswordHasher hasher, TimeProvider clock)
{
    private DateTime Now => clock.GetUtcNow().UtcDateTime;
    private static GuestAuthException InvalidLogin() => new(401, "INVALID_CREDENTIALS", "Неверный email или пароль. После нескольких попыток попробуйте через 15 минут.");
    private static string Email(string email) => email.Trim().ToLowerInvariant();
    public static string HashToken(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    public async Task<GuestAuthResult> RegisterAsync(GuestRegisterRequest request, CancellationToken ct)
    {
        var email = Email(request.Email);
        if (await db.GuestCredentials.AnyAsync(x => x.NormalizedEmail == email, ct))
            throw new GuestAuthException(409, "EMAIL_IN_USE", "Не удалось зарегистрировать этот email. Попробуйте войти в аккаунт.");
        var profile = new GuestProfile
        {
            IdentityIssuer = "seatmap:password", CreatedAtUtc = Now,
            PrivacyConsentAtUtc = Now, PrivacyPolicyVersion = "seatmap-privacy-v1"
        };
        profile.IdentitySubject = profile.Id.ToString();
        Apply(profile, request);
        var credential = new GuestCredential { Profile = profile, NormalizedEmail = email };
        credential.PasswordHash = hasher.HashPassword(credential, request.Password);
        db.GuestCredentials.Add(credential);
        // The unique database index also rejects simultaneous duplicate registrations.
        try { return await CreateSessionAsync(profile, ct); }
        catch (DbUpdateException error) when (error.InnerException is Npgsql.PostgresException { SqlState: "23505" })
        { throw new GuestAuthException(409, "EMAIL_IN_USE", "Не удалось зарегистрировать этот email. Попробуйте войти в аккаунт."); }
    }

    public async Task<GuestAuthResult> LoginAsync(GuestLoginRequest request, CancellationToken ct)
    {
        var email = Email(request.Email);
        var credential = await db.GuestCredentials.Include(x => x.Profile)
            .SingleOrDefaultAsync(x => x.NormalizedEmail == email, ct);
        // Perform a real hash check for unknown accounts too.
        var verification = hasher.VerifyHashedPassword(credential ?? new(),
            credential?.PasswordHash ?? hasher.DummyHash, request.Password);
        if (credential == null || credential.LockedUntilUtc > Now) throw InvalidLogin();
        if (verification == PasswordVerificationResult.Failed)
        {
            var until = Now.AddMinutes(15);
            await db.GuestCredentials.Where(x => x.GuestProfileId == credential.GuestProfileId)
                .ExecuteUpdateAsync(update => update
                    .SetProperty(x => x.LockedUntilUtc, x => x.FailedLoginCount >= 4 ? until : x.LockedUntilUtc)
                    .SetProperty(x => x.FailedLoginCount, x => x.FailedLoginCount + 1), ct);
            throw InvalidLogin();
        }
        credential.FailedLoginCount = 0;
        credential.LockedUntilUtc = null;
        if (verification == PasswordVerificationResult.SuccessRehashNeeded)
            credential.PasswordHash = hasher.HashPassword(credential, request.Password);
        return await CreateSessionAsync(credential.Profile, ct);
    }

    public async Task<GuestSession?> FindSessionAsync(HttpRequest request, CancellationToken ct)
    {
        var authorization = request.Headers.Authorization.ToString();
        if (!authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return null;
        var token = authorization[7..].Trim();
        if (token.Length is < 32 or > 256) return null;
        var hash = HashToken(token);
        var now = Now;
        return await db.GuestSessions.Include(x => x.Profile).SingleOrDefaultAsync(x =>
            x.TokenHash == hash && x.RevokedAtUtc == null && x.ExpiresAtUtc > now, ct);
    }

    public async Task<GuestProfileDto> UpdateAsync(GuestSession session, GuestProfileRequest request, CancellationToken ct)
    {
        var credential = await CredentialAsync(session, ct);
        var email = Email(request.Email);
        if (email != credential.NormalizedEmail)
        {
            VerifyCurrentPassword(credential, request.CurrentPassword);
            if (await db.GuestCredentials.AnyAsync(x => x.NormalizedEmail == email && x.GuestProfileId != session.GuestProfileId, ct))
                throw new GuestAuthException(409, "EMAIL_IN_USE", "Этот email нельзя использовать. Укажите другой адрес.");
            credential.NormalizedEmail = email;
        }
        Apply(session.Profile, request);
        session.Profile.UpdatedAtUtc = Now;
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException error) when (error.InnerException is Npgsql.PostgresException { SqlState: "23505" })
        { throw new GuestAuthException(409, "EMAIL_IN_USE", "Этот email нельзя использовать. Укажите другой адрес."); }
        return GuestProfileDto.From(session.Profile);
    }

    public async Task ChangePasswordAsync(GuestSession session, GuestPasswordRequest request, CancellationToken ct)
    {
        var credential = await CredentialAsync(session, ct);
        VerifyCurrentPassword(credential, request.CurrentPassword);
        credential.PasswordHash = hasher.HashPassword(credential, request.NewPassword);
        credential.FailedLoginCount = 0;
        credential.LockedUntilUtc = null;
        // Revoke all sessions atomically with the password change.
        var sessions = await db.GuestSessions.Where(x => x.GuestProfileId == session.GuestProfileId && x.RevokedAtUtc == null).ToListAsync(ct);
        foreach (var item in sessions) item.RevokedAtUtc = Now;
        await db.SaveChangesAsync(ct);
    }

    public async Task LogoutAsync(GuestSession session, CancellationToken ct)
    {
        session.RevokedAtUtc = Now;
        await db.SaveChangesAsync(ct);
    }

    public async Task DeleteAsync(GuestSession session, string password, CancellationToken ct)
    {
        VerifyCurrentPassword(await CredentialAsync(session, ct), password);
        db.GuestProfiles.Remove(session.Profile);
        await db.SaveChangesAsync(ct);
    }

    private Task<GuestCredential> CredentialAsync(GuestSession session, CancellationToken ct) =>
        db.GuestCredentials.SingleAsync(x => x.GuestProfileId == session.GuestProfileId, ct);
    private void VerifyCurrentPassword(GuestCredential credential, string? password)
    {
        if (string.IsNullOrEmpty(password) || hasher.VerifyHashedPassword(credential, credential.PasswordHash, password) == PasswordVerificationResult.Failed)
            throw new GuestAuthException(400, "CURRENT_PASSWORD_REQUIRED", "Введите верный текущий пароль.");
    }
    private async Task<GuestAuthResult> CreateSessionAsync(GuestProfile profile, CancellationToken ct)
    {
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
        var session = new GuestSession { Profile = profile, TokenHash = HashToken(token), CreatedAtUtc = Now, ExpiresAtUtc = Now.AddDays(30) };
        db.GuestSessions.Add(session);
        await db.SaveChangesAsync(ct);
        return new(token, session.ExpiresAtUtc, GuestProfileDto.From(profile));
    }
    private static void Apply(GuestProfile profile, GuestProfileRequest request)
    {
        profile.FirstName = request.FirstName.Trim(); profile.LastName = request.LastName.Trim();
        profile.DisplayName = $"{profile.FirstName} {profile.LastName}";
        profile.Email = Email(request.Email); profile.Phone = GuestProfileRequest.NormalizePhone(request.Phone);
        profile.City = (request.City ?? "").Trim(); profile.Country = (request.Country ?? "").Trim();
        profile.DateOfBirth = request.DateOfBirth; profile.PreferredLanguage = request.PreferredLanguage;
        profile.MarketingConsent = request.MarketingConsent;
    }
}
