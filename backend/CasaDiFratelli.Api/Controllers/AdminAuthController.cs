using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Filters;
using CasaDiFratelli.Api.Models;
using CasaDiFratelli.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Controllers;

[ApiController]
[Route("api/admin")]
public class AdminAuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AdminAuthService _auth;
    private readonly AuditService _audit;
    private readonly EmailService _emailService;
    private readonly IConfiguration _configuration;

    public AdminAuthController(
        AppDbContext db,
        AdminAuthService auth,
        AuditService audit,
        EmailService emailService,
        IConfiguration configuration)
    {
        _db = db;
        _auth = auth;
        _audit = audit;
        _emailService = emailService;
        _configuration = configuration;
    }

    public sealed record AdminLoginRequest(string Email, string Password);
    public sealed record RequestPasswordResetRequest(string Email);
    public sealed record ResetPasswordRequest(string Email, string Token, string Password);
    public sealed record CreateAdminRequest(string Name, string Email, string Password, string Role);
    public sealed record DeviceLoginRequest(string CredentialToken);
    public sealed record DeviceRegisterRequest(string Label, string CredentialToken);

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] AdminLoginRequest request)
    {
        var login = await _auth.LoginAsync(request.Email, request.Password, Request);
        if (login == null)
        {
            return Unauthorized(new { message = "Invalid admin credentials." });
        }

        await _audit.RecordAsync(HttpContext, "login", "AdminUser", login.User.Id.ToString(), after: login.User);
        return Ok(login);
    }

    [HttpPost("device-login")]
    public async Task<IActionResult> DeviceLogin([FromBody] DeviceLoginRequest request)
    {
        var login = await _auth.LoginWithDeviceAsync(request.CredentialToken, Request);
        if (login == null)
        {
            return Unauthorized(new { message = "Device login is not enabled." });
        }

        await _audit.RecordAsync(HttpContext, "device-login", "AdminUser", login.User.Id.ToString(), after: login.User);
        return Ok(login);
    }

    [HttpPost("password-reset/request")]
    public async Task<IActionResult> RequestPasswordReset([FromBody] RequestPasswordResetRequest request)
    {
        await _auth.EnsureDefaultAdminAsync();

        if (!string.IsNullOrWhiteSpace(request.Email))
        {
            var normalizedEmail = AdminAuthService.NormalizeEmail(request.Email);
            var user = await _db.AdminUsers.FirstOrDefaultAsync(x => x.Email == normalizedEmail && x.IsActive);

            if (user != null)
            {
                var token = AdminAuthService.GenerateDeviceToken();
                user.PasswordResetTokenHash = AdminAuthService.HashToken(token);
                user.PasswordResetTokenExpiresAtUtc = DateTime.UtcNow.AddMinutes(30);
                await _db.SaveChangesAsync();

                var adminUrl = (_configuration["ADMIN_URL"] ?? "https://casa-di-fratelli.vercel.app/admin").TrimEnd('/');
                var resetUrl = $"{adminUrl}?resetToken={Uri.EscapeDataString(token)}&email={Uri.EscapeDataString(user.Email)}";

                await _emailService.SendAsync(
                    user.Email,
                    "Възстановяване на админ парола · Casa di Fratelli",
                    $"""
                    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
                      <h2>Възстановяване на парола</h2>
                      <p>Получихме заявка за нова админ парола в <strong>Casa di Fratelli</strong>.</p>
                      <p>Линкът е валиден 30 минути.</p>
                      <p>
                        <a href="{resetUrl}" style="display:inline-block;background:#c9a56a;color:#111827;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:700">
                          Задай нова парола
                        </a>
                      </p>
                      <p style="color:#6b7280">Ако не сте поискали това, просто игнорирайте имейла.</p>
                    </div>
                    """);
            }
        }

        return Ok(new { message = "If this admin exists, a reset email has been sent." });
    }

    [HttpPost("password-reset/confirm")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) ||
            string.IsNullOrWhiteSpace(request.Token) ||
            string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new { message = "Email, token, and password are required." });
        }

        if (request.Password.Length < 8)
        {
            return BadRequest(new { message = "Password must be at least 8 characters." });
        }

        var normalizedEmail = AdminAuthService.NormalizeEmail(request.Email);
        var tokenHash = AdminAuthService.HashToken(request.Token);
        var user = await _db.AdminUsers.FirstOrDefaultAsync(x =>
            x.Email == normalizedEmail &&
            x.IsActive &&
            x.PasswordResetTokenHash == tokenHash &&
            x.PasswordResetTokenExpiresAtUtc > DateTime.UtcNow);

        if (user == null)
        {
            return BadRequest(new { message = "Reset link is invalid or expired." });
        }

        var (hash, salt) = AdminAuthService.HashPassword(request.Password);
        user.PasswordHash = hash;
        user.PasswordSalt = salt;
        user.PasswordResetTokenHash = null;
        user.PasswordResetTokenExpiresAtUtc = null;

        await _db.AdminSessions
            .Where(x => x.AdminUserId == user.Id && x.RevokedAtUtc == null)
            .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.RevokedAtUtc, DateTime.UtcNow));
        await _db.SaveChangesAsync();

        await _audit.RecordAsync(HttpContext, "password-reset", "AdminUser", user.Id.ToString(), after: new { user.Id, user.Email });
        return Ok(new { message = "Password was reset." });
    }

    [HttpGet("me")]
    [AdminAuthorize]
    public IActionResult Me()
    {
        return Ok(AdminAuthService.Current(HttpContext));
    }

    [HttpGet("users")]
    [AdminAuthorize]
    public async Task<IActionResult> Users()
    {
        var users = await _db.AdminUsers
            .OrderBy(x => x.Name)
            .Select(x => new
            {
                x.Id,
                x.Name,
                x.Email,
                x.Role,
                x.IsActive,
                x.CreatedAtUtc,
                x.LastLoginAtUtc
            })
            .ToListAsync();

        return Ok(users);
    }

    [HttpPost("users")]
    [AdminAuthorize]
    public async Task<IActionResult> CreateUser([FromBody] CreateAdminRequest request)
    {
        var current = AdminAuthService.Current(HttpContext);
        if (!AdminRoleAccess.CanManageAdmins(current?.Role))
            return Forbid();

        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return BadRequest(new { message = "Email and password are required." });

        var normalizedEmail = AdminAuthService.NormalizeEmail(request.Email);
        if (await _db.AdminUsers.AnyAsync(x => x.Email == normalizedEmail))
            return Conflict(new { message = "Admin already exists." });

        var (hash, salt) = AdminAuthService.HashPassword(request.Password);
        var user = new AdminUser
        {
            Name = string.IsNullOrWhiteSpace(request.Name) ? normalizedEmail : request.Name.Trim(),
            Email = normalizedEmail,
            Role = AdminRoleAccess.Normalize(request.Role),
            PasswordHash = hash,
            PasswordSalt = salt,
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow
        };

        _db.AdminUsers.Add(user);
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "create", "AdminUser", user.Id.ToString(), after: new { user.Id, user.Name, user.Email, user.Role });

        return Ok(new { user.Id, user.Name, user.Email, user.Role, user.IsActive });
    }

    [HttpPost("devices")]
    [AdminAuthorize]
    public async Task<IActionResult> RegisterDevice([FromBody] DeviceRegisterRequest request)
    {
        var admin = AdminAuthService.Current(HttpContext);
        if (admin == null) return Unauthorized();

        var credential = await _auth.RegisterDeviceAsync(admin, request.Label, request.CredentialToken);
        await _audit.RecordAsync(HttpContext, "register-device", "AdminDeviceCredential", credential.Id.ToString(), after: new { credential.Id, credential.Label });

        return Ok(new { credential.Id, credential.Label });
    }

    [HttpGet("audit")]
    [AdminAuthorize]
    public async Task<IActionResult> Audit()
    {
        var logs = await _db.AuditLogs
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(200)
            .ToListAsync();

        return Ok(logs);
    }
}
