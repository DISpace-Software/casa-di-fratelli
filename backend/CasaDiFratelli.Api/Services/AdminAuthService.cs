using System.Security.Cryptography;
using System.Text;
using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Services;

public sealed record AdminPrincipal(int Id, string Name, string Email, string Role);
public sealed record AdminLoginResult(string Token, AdminPrincipal User);

public class AdminAuthService
{
    private const string FallbackPassword = "CasaFratelli2026!";
    private readonly AppDbContext _db;
    private readonly IConfiguration _configuration;

    public AdminAuthService(AppDbContext db, IConfiguration configuration)
    {
        _db = db;
        _configuration = configuration;
    }

    public async Task EnsureDefaultAdminAsync()
    {
        await AdminSchemaBootstrapper.EnsureAsync(_db);
        if (await _db.AdminUsers.AnyAsync()) return;

        var (hash, salt) = HashPassword(
            _configuration["ADMIN_PASSWORD"]
            ?? _configuration["AdminPassword"]
            ?? FallbackPassword);

        _db.AdminUsers.Add(new AdminUser
        {
            Name = "Owner",
            Email = _configuration["ADMIN_EMAIL"] ?? "admin@casadifratelli.local",
            Role = AdminRoleAccess.Owner,
            PasswordHash = hash,
            PasswordSalt = salt,
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow
        });

        await _db.SaveChangesAsync();
    }

    public async Task<AdminLoginResult?> LoginAsync(
        string email,
        string password,
        HttpRequest request)
    {
        await EnsureDefaultAdminAsync();

        var normalizedEmail = NormalizeEmail(email);
        var user = await _db.AdminUsers.FirstOrDefaultAsync(x => x.Email == normalizedEmail && x.IsActive);
        if (user == null || !VerifyPassword(password, user.PasswordHash, user.PasswordSalt))
            return null;

        return await CreateSessionAsync(user, request);
    }

    public async Task<AdminLoginResult?> LoginWithDeviceAsync(string credentialToken, HttpRequest request)
    {
        await EnsureDefaultAdminAsync();
        var hash = HashToken(credentialToken);
        var credential = await _db.AdminDeviceCredentials
            .Include(x => x.AdminUser)
            .FirstOrDefaultAsync(x => x.CredentialHash == hash && x.IsActive && x.AdminUser != null && x.AdminUser.IsActive);

        if (credential?.AdminUser == null) return null;

        credential.LastUsedAtUtc = DateTime.UtcNow;
        return await CreateSessionAsync(credential.AdminUser, request);
    }

    public async Task<AdminDeviceCredential> RegisterDeviceAsync(AdminPrincipal admin, string label, string credentialToken)
    {
        var hash = HashToken(credentialToken);
        var existing = await _db.AdminDeviceCredentials.FirstOrDefaultAsync(x => x.CredentialHash == hash);
        if (existing != null)
        {
            existing.Label = string.IsNullOrWhiteSpace(label) ? existing.Label : label.Trim();
            existing.IsActive = true;
            await _db.SaveChangesAsync();
            return existing;
        }

        var credential = new AdminDeviceCredential
        {
            AdminUserId = admin.Id,
            Label = string.IsNullOrWhiteSpace(label) ? "Trusted device" : label.Trim(),
            CredentialHash = hash,
            CreatedAtUtc = DateTime.UtcNow,
            IsActive = true
        };

        _db.AdminDeviceCredentials.Add(credential);
        await _db.SaveChangesAsync();
        return credential;
    }

    public async Task<AdminPrincipal?> GetPrincipalAsync(HttpRequest request)
    {
        var token = ReadToken(request);
        if (string.IsNullOrWhiteSpace(token)) return null;

        var hash = HashToken(token);
        var session = await _db.AdminSessions
            .Include(x => x.AdminUser)
            .FirstOrDefaultAsync(x =>
                x.TokenHash == hash &&
                x.RevokedAtUtc == null &&
                x.ExpiresAtUtc > DateTime.UtcNow &&
                x.AdminUser != null &&
                x.AdminUser.IsActive);

        return session?.AdminUser == null
            ? null
            : new AdminPrincipal(
                session.AdminUser.Id,
                session.AdminUser.Name,
                session.AdminUser.Email,
                AdminRoleAccess.Normalize(session.AdminUser.Role));
    }

    public async Task<bool> IsAuthorizedAsync(HttpRequest request)
    {
        var principal = await GetPrincipalAsync(request);
        if (principal == null) return false;

        request.HttpContext.Items["AdminUser"] = principal;
        return true;
    }

    public static AdminPrincipal? Current(HttpContext context)
    {
        return context.Items["AdminUser"] as AdminPrincipal;
    }

    public static string GenerateDeviceToken()
    {
        return Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
    }

    public static (string Hash, string Salt) HashPassword(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            salt,
            120_000,
            HashAlgorithmName.SHA256,
            32);

        return (Convert.ToBase64String(hash), Convert.ToBase64String(salt));
    }

    public static bool VerifyPassword(string password, string hash, string salt)
    {
        var saltBytes = Convert.FromBase64String(salt);
        var expected = Convert.FromBase64String(hash);
        var actual = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            saltBytes,
            120_000,
            HashAlgorithmName.SHA256,
            32);

        return CryptographicOperations.FixedTimeEquals(expected, actual);
    }

    public static string HashToken(string token)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    public static string NormalizeEmail(string email)
    {
        return email.Trim().ToLowerInvariant();
    }

    private async Task<AdminLoginResult> CreateSessionAsync(AdminUser user, HttpRequest request)
    {
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
        var session = new AdminSession
        {
            AdminUserId = user.Id,
            TokenHash = HashToken(token),
            CreatedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = DateTime.UtcNow.AddDays(7),
            UserAgent = request.Headers.UserAgent.ToString(),
            IpAddress = request.HttpContext.Connection.RemoteIpAddress?.ToString()
        };

        user.LastLoginAtUtc = DateTime.UtcNow;
        _db.AdminSessions.Add(session);
        await _db.SaveChangesAsync();

        return new AdminLoginResult(token, new AdminPrincipal(user.Id, user.Name, user.Email, AdminRoleAccess.Normalize(user.Role)));
    }

    private static string? ReadToken(HttpRequest request)
    {
        var headerToken = request.Headers["X-Admin-Token"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(headerToken)) return headerToken.Trim();

        return request.Headers.Authorization
            .FirstOrDefault()?
            .Replace("Bearer ", string.Empty, StringComparison.OrdinalIgnoreCase)
            .Trim();
    }
}
