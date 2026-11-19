using System.Security.Cryptography;
using System.Data;
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

public sealed class GuestAuthService(PlatformDbContext db, GuestPasswordHasher hasher, TimeProvider clock, IGuestEmailSender mail, IConfiguration configuration)
{
    private string HashCode(Guid id, string code)
    {
        var secret = configuration["Platform:Email:CodeSecret"];
        if (string.IsNullOrWhiteSpace(secret) || secret.Length < 32)
            throw new GuestAuthException(503, "EMAIL_DELIVERY_FAILED", "Email verification is not configured.");
        return Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes($"{id:N}:{code}")));
    }
    private DateTime Now => clock.GetUtcNow().UtcDateTime;
    private static GuestAuthException InvalidLogin() => new(401, "INVALID_CREDENTIALS", "Неверный email или пароль. После нескольких попыток попробуйте через 15 минут.");
    private static string Email(string email) => email.Trim().ToLowerInvariant();
    public static string HashToken(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    public async Task<GuestChallengeResult> RegisterAsync(GuestRegisterRequest request, CancellationToken ct)
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
        try { await db.SaveChangesAsync(ct); return await SendCodeAsync(email, "verify", ct); }
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
        if (credential.Profile.EmailVerifiedAtUtc == null)
            throw new GuestAuthException(403, "EMAIL_NOT_VERIFIED", "Confirm your email before signing in.");
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
            x.Profile.EmailVerifiedAtUtc != null && x.TokenHash == hash && x.RevokedAtUtc == null && x.ExpiresAtUtc > now, ct);
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
            session.Profile.EmailVerifiedAtUtc = null;
            session.Profile.LastEmailSentAtUtc = null;
            foreach (var item in await db.GuestSessions.Where(x => x.GuestProfileId == session.GuestProfileId && x.RevokedAtUtc == null).ToListAsync(ct))
                item.RevokedAtUtc = Now;

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

    public async Task<GuestChallengeResult> SendCodeAsync(string address, string purpose, CancellationToken ct)
    {
        var email = Email(address);
        var credential = await db.GuestCredentials.AsNoTracking().SingleOrDefaultAsync(x => x.NormalizedEmail == email, ct);
        var now = Now;
        // Indistinguishable response for unknown, already verified and throttled accounts.
        var hidden = new GuestChallengeResult(Guid.NewGuid(), now.AddMinutes(10));
        if (credential == null) return hidden;
        var eligible = db.GuestProfiles.Where(x => x.Id == credential.GuestProfileId &&
            (x.LastEmailSentAtUtc == null || x.LastEmailSentAtUtc <= now.AddSeconds(-60)));
        if (purpose == "verify") eligible = eligible.Where(x => x.EmailVerifiedAtUtc == null);
        if (await eligible.ExecuteUpdateAsync(u => u.SetProperty(x => x.LastEmailSentAtUtc, now), ct) == 0) return hidden;
        var profile = await db.GuestProfiles.AsNoTracking().SingleAsync(x => x.Id == credential.GuestProfileId, ct);
        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        var challenge = new GuestEmailChallenge { GuestProfileId = profile.Id, Email = email, Purpose = purpose,
            CreatedAtUtc = now, ExpiresAtUtc = now.AddMinutes(10) };
        challenge.CodeHash = HashCode(challenge.Id, code);
        // Supersede outstanding codes for the same purpose; retain only recent audit metadata.
        await db.GuestEmailChallenges.Where(x => x.GuestProfileId == profile.Id && (x.Purpose == purpose || x.ExpiresAtUtc < now.AddDays(-1))).ExecuteDeleteAsync(ct);
        db.GuestEmailChallenges.Add(challenge);
        await db.SaveChangesAsync(ct);
        if (!await mail.SendCodeAsync(email, code, purpose, profile.PreferredLanguage, challenge.Id, ct))
            throw new GuestAuthException(503, "EMAIL_DELIVERY_FAILED", "Email could not be sent. Try again in a minute.");
        return new(challenge.Id, challenge.ExpiresAtUtc);
    }

    private async Task CountCodeAttemptAsync(GuestCodeRequest request, string purpose, CancellationToken ct)
    {
        var now = Now;
        var query = db.GuestEmailChallenges.Where(x => x.Id == request.ChallengeId && x.Purpose == purpose &&
            x.ConsumedAtUtc == null && x.ExpiresAtUtc > now && x.Attempts < 5);
        if (await query.ExecuteUpdateAsync(u => u.SetProperty(x => x.Attempts, x => x.Attempts + 1), ct) == 0)
            throw new GuestAuthException(400, "INVALID_EMAIL_CODE", "Invalid or expired code. Request a new code.");
    }

    private async Task<GuestEmailChallenge> ConsumeCodeAsync(GuestCodeRequest request, string purpose, CancellationToken ct)
    {
        var now = Now;
        var hash = HashCode(request.ChallengeId, request.Code);
        var claim = db.GuestEmailChallenges.Where(x => x.Id == request.ChallengeId && x.Purpose == purpose &&
            x.CodeHash == hash && x.ConsumedAtUtc == null && x.ExpiresAtUtc > now && x.Attempts <= 5);
        if (await claim.ExecuteUpdateAsync(u => u.SetProperty(x => x.ConsumedAtUtc, now), ct) != 1)
            throw new GuestAuthException(400, "INVALID_EMAIL_CODE", "Invalid or expired code. Request a new code.");
        var result = await db.GuestEmailChallenges.AsNoTracking().SingleAsync(x => x.Id == request.ChallengeId, ct);
        if (!await db.GuestCredentials.AnyAsync(x => x.GuestProfileId == result.GuestProfileId && x.NormalizedEmail == result.Email, ct))
            throw new GuestAuthException(400, "INVALID_EMAIL_CODE", "The email has changed. Request a new code.");
        return result;
    }

    public async Task<GuestAuthResult> VerifyEmailAsync(GuestCodeRequest request, CancellationToken ct)
    {
        // Consumption is an atomic compare-and-update, so concurrent replay cannot create sessions.
        await CountCodeAttemptAsync(request, "verify", ct);
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var challenge = await ConsumeCodeAsync(request, "verify", ct);
        var profile = await db.GuestProfiles.SingleAsync(x => x.Id == challenge.GuestProfileId, ct);
        profile.EmailVerifiedAtUtc = Now;
        // Do not revive sessions issued before verification (including legacy clients).
        await db.GuestSessions.Where(x => x.GuestProfileId == profile.Id && x.RevokedAtUtc == null)
            .ExecuteUpdateAsync(u => u.SetProperty(x => x.RevokedAtUtc, Now), ct);
        var result = await CreateSessionAsync(profile, ct);
        await transaction.CommitAsync(ct);
        return result;
    }

    public async Task ResetPasswordAsync(GuestResetRequest request, CancellationToken ct)
    {
        await CountCodeAttemptAsync(request, "reset", ct);
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var challenge = await ConsumeCodeAsync(request, "reset", ct);
        var credential = await db.GuestCredentials.Include(x => x.Profile).SingleAsync(x => x.GuestProfileId == challenge.GuestProfileId, ct);
        credential.PasswordHash = hasher.HashPassword(credential, request.NewPassword);
        credential.FailedLoginCount = 0; credential.LockedUntilUtc = null;
        credential.Profile.EmailVerifiedAtUtc = Now;
        foreach (var item in await db.GuestSessions.Where(x => x.GuestProfileId == challenge.GuestProfileId && x.RevokedAtUtc == null).ToListAsync(ct)) item.RevokedAtUtc = Now;
        await db.SaveChangesAsync(ct);
        await db.GuestEmailChallenges.Where(x => x.GuestProfileId == challenge.GuestProfileId && x.ConsumedAtUtc == null).ExecuteDeleteAsync(ct);
        await transaction.CommitAsync(ct);
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
