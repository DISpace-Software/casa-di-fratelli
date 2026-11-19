using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SeatMap.Api.Controllers;
using SeatMap.Api.Platform;
using SeatMap.Api.Platform.Auth;
using SeatMap.Api.Platform.Data;
using SeatMap.Api.Services.Tenancy;

static void Check(bool condition, string label)
{ if (!condition) throw new Exception(label); Console.WriteLine($"PASS {label}"); }
var runId = Guid.NewGuid().ToString("N")[..10];
var clock = new TestClock();
await using var sqlite = new SqliteConnection("Data Source=:memory:");
await sqlite.OpenAsync();
var connection = Environment.GetEnvironmentVariable("GUEST_CHECKS_POSTGRES");
var builder = WebApplication.CreateBuilder();
builder.Configuration["Platform:Email:CodeSecret"] = "isolated-checks-only-secret-not-for-production";
builder.Logging.ClearProviders();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Services.AddDbContext<PlatformDbContext>(o => { if (connection == null) o.UseSqlite(sqlite); else o.UseNpgsql(connection); });
builder.Services.Configure<PlatformOptions>(o => o.Enabled = true);
builder.Services.Configure<TenantResolutionOptions>(o => o.RequireKnownTenant = true);
builder.Services.AddScoped<CurrentTenant>();
builder.Services.AddSingleton<TimeProvider>(clock);
builder.Services.AddSingleton<GuestPasswordHasher>();
builder.Services.AddScoped<GuestAuthService>();
var mail = new TestMail();
builder.Services.AddSingleton<IGuestEmailSender>(mail);
builder.Services.AddControllers().AddApplicationPart(typeof(GuestAccountController).Assembly);
builder.Services.AddRateLimiter(o => o.AddPolicy("guest-auth", _ => System.Threading.RateLimiting.RateLimitPartition.GetNoLimiter("test")));
await using var app = builder.Build();
app.UseRouting(); app.UseRateLimiter(); app.UseMiddleware<TenantResolutionMiddleware>(); app.MapControllers();
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
    if (connection == null) await db.Database.EnsureCreatedAsync(); else await db.Database.MigrateAsync();
}
await app.StartAsync();
try
{
    using var client = new HttpClient { BaseAddress = new(app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single()) };
    async Task<JsonElement> Verify(JsonElement challenge)
    {
        var id = challenge.GetProperty("challengeId").GetGuid();
        var response = await client.PostAsJsonAsync("/api/v1/guest/email/verify", new { challengeId = id, code = mail.Codes[id] });
        Check(response.IsSuccessStatusCode, "Correct email code verifies account");
        Check((await client.PostAsJsonAsync("/api/v1/guest/email/verify", new { challengeId = id, code = mail.Codes[id] })).StatusCode == HttpStatusCode.BadRequest, "Email code cannot be reused");
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
    var register = new GuestRegisterRequest { FirstName = "Мария", LastName = "Иванова", Email = $"Guest-{runId}@Example.test", Phone = "+359 888 123 456", Password = "Test passphrase 2026!", ConfirmPassword = "Test passphrase 2026!", PrivacyConsent = true, City = "София", Country = "България", DateOfBirth = new(1995, 3, 8), PreferredLanguage = "bg" };
    Check((await client.GetAsync("/api/v1/guest/me")).StatusCode == HttpStatusCode.Unauthorized, "Anonymous profile access denied in strict tenant mode");
    register.PrivacyConsent = false;
    Check((await client.PostAsJsonAsync("/api/v1/guest/register", register)).StatusCode == HttpStatusCode.BadRequest, "Registration requires explicit privacy consent");
    register.PrivacyConsent = true; register.Phone = "888";
    Check((await client.PostAsJsonAsync("/api/v1/guest/register", register)).StatusCode == HttpStatusCode.BadRequest, "Server rejects malformed phone");
    register.Phone = "+359 888 123 456"; register.ConfirmPassword = "different";
    Check((await client.PostAsJsonAsync("/api/v1/guest/register", register)).StatusCode == HttpStatusCode.BadRequest, "Server rejects mismatching password confirmation");
    register.ConfirmPassword = register.Password;
    var created = await client.PostAsJsonAsync("/api/v1/guest/register", register);
    Check(created.StatusCode == HttpStatusCode.Created, "Registration creates an account without selecting a restaurant");
    var pending = await created.Content.ReadFromJsonAsync<JsonElement>();
    Check(!pending.TryGetProperty("token", out _), "Registration cannot create a session before email verification");
    Check((await client.PostAsJsonAsync("/api/v1/guest/login", new { register.Email, register.Password })).StatusCode == HttpStatusCode.Forbidden, "Unverified login requires email verification");
    var auth = await Verify(pending);
    var token = auth.GetProperty("token").GetString()!;
    Check(created.Headers.CacheControl?.NoStore == true && !created.Headers.Contains("X-Tenant-Id"), "Account responses are not cached and have no restaurant context");
    var profile = auth.GetProperty("profile");
    Check(profile.GetProperty("name").GetString() == "Мария Иванова" && profile.GetProperty("phone").GetString() == "+359888123456" && profile.GetProperty("dateOfBirth").GetString() == "1995-03-08", "Profile stores complete normalized data");
    Check(!profile.TryGetProperty("passwordHash", out _) && !profile.TryGetProperty("tokenHash", out _), "Profile response exposes no hashes");
    register.Email = register.Email.ToLowerInvariant();
    Check((await client.PostAsJsonAsync("/api/v1/guest/register", register)).StatusCode == HttpStatusCode.Conflict, "Normalized duplicate email rejected");
    using (var scope = app.Services.CreateScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var createdId = profile.GetProperty("id").GetGuid();
        var credential = await db.GuestCredentials.SingleAsync(x => x.GuestProfileId == createdId); var session = await db.GuestSessions.SingleAsync(x => x.GuestProfileId == createdId);
        Check(credential.PasswordHash != register.Password && session.TokenHash != token && session.TokenHash == GuestAuthService.HashToken(token), "Database persists password and token hashes only");
    }
    var second = await client.PostAsJsonAsync("/api/v1/guest/register", new { firstName = "Другой", lastName = "Гость", email = $"second-{runId}@example.test", phone = "+359888123457", password = register.Password, confirmPassword = register.Password, privacyConsent = true });
    var secondAuth = await Verify(await second.Content.ReadFromJsonAsync<JsonElement>());
    var otherToken = secondAuth.GetProperty("token").GetString()!;
    var otherId = secondAuth.GetProperty("profile").GetProperty("id").GetString();
    client.DefaultRequestHeaders.Authorization = new("Bearer", token);
    var protectedRead = await client.GetFromJsonAsync<JsonElement>($"/api/v1/guest/me?guestProfileId={otherId}");
    Check(protectedRead.GetProperty("id").GetString() != otherId, "Guest cannot select another profile through a user-supplied ID");
    var own = await client.GetAsync("/api/v1/guest/me");
    Check(own.IsSuccessStatusCode, "Authenticated guest can read own profile");
    var update = new GuestProfileRequest { FirstName = "Мария", LastName = "Петрова", Email = register.Email, Phone = "+359999111222", City = "Пловдив", Country = "България", DateOfBirth = null, PreferredLanguage = "en", MarketingConsent = true };
    Check((await client.PutAsJsonAsync("/api/v1/guest/me", update)).IsSuccessStatusCode, "Profile edits including optional-date removal persist");
    update.Email = $"new-{runId}@example.test";
    Check((await client.PutAsJsonAsync("/api/v1/guest/me", update)).StatusCode == HttpStatusCode.BadRequest, "Changing login email requires current password");
    update.CurrentPassword = register.Password;
    Check((await client.PutAsJsonAsync("/api/v1/guest/me", update)).IsSuccessStatusCode, "Email changes with valid password");
    Check((await client.PostAsJsonAsync("/api/v1/guest/login", new { email = register.Email, password = register.Password })).StatusCode == HttpStatusCode.Unauthorized, "Old email no longer signs in");
    Check((await client.GetAsync("/api/v1/guest/me")).StatusCode == HttpStatusCode.Unauthorized, "Email change revokes existing sessions");
    Check((await client.PostAsJsonAsync("/api/v1/guest/login", new { email = update.Email, password = register.Password })).StatusCode == HttpStatusCode.Forbidden, "New email requires verification");
    var changedChallenge = await client.PostAsJsonAsync("/api/v1/guest/email/code", new { email = update.Email });
    var changedAuth = await Verify(await changedChallenge.Content.ReadFromJsonAsync<JsonElement>());
    token = changedAuth.GetProperty("token").GetString()!;
    client.DefaultRequestHeaders.Authorization = new("Bearer", token);
    var login = await client.PostAsJsonAsync("/api/v1/guest/login", new { email = update.Email.ToUpperInvariant(), password = register.Password });
    Check(login.IsSuccessStatusCode, "New email signs in case-insensitively");
    var secondToken = (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString()!;
    const string newPassword = "Another long passphrase 2026!";
    Check((await client.PostAsJsonAsync("/api/v1/guest/password", new { currentPassword = register.Password, newPassword, confirmPassword = newPassword })).StatusCode == HttpStatusCode.NoContent, "Password changes successfully");
    Check((await client.GetAsync("/api/v1/guest/me")).StatusCode == HttpStatusCode.Unauthorized, "Password change revokes current session");
    client.DefaultRequestHeaders.Authorization = new("Bearer", secondToken);
    Check((await client.GetAsync("/api/v1/guest/me")).StatusCode == HttpStatusCode.Unauthorized, "Password change revokes other devices too");
    Check((await client.PostAsJsonAsync("/api/v1/guest/login", new { email = update.Email, password = register.Password })).StatusCode == HttpStatusCode.Unauthorized, "Old password rejected");
    login = await client.PostAsJsonAsync("/api/v1/guest/login", new { email = update.Email, password = newPassword });
    token = (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString()!;
    client.DefaultRequestHeaders.Authorization = new("Bearer", token);
    Check((await client.PostAsync("/api/v1/guest/logout", null)).StatusCode == HttpStatusCode.NoContent, "Logout revokes server session");
    Check((await client.GetAsync("/api/v1/guest/me")).StatusCode == HttpStatusCode.Unauthorized, "Logged-out token cannot be reused");
    for (var i = 0; i < 5; i++) await client.PostAsJsonAsync("/api/v1/guest/login", new { email = update.Email, password = "wrong" });
    Check((await client.PostAsJsonAsync("/api/v1/guest/login", new { email = update.Email, password = newPassword })).StatusCode == HttpStatusCode.Unauthorized, "Repeated failed logins temporarily lock account");
    clock.Advance(TimeSpan.FromMinutes(16));
    login = await client.PostAsJsonAsync("/api/v1/guest/login", new { email = update.Email, password = newPassword });
    Check(login.IsSuccessStatusCode, "Account unlocks after lockout window");
    token = (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString()!;
    client.DefaultRequestHeaders.Authorization = new("Bearer", token);
    clock.Advance(TimeSpan.FromDays(31));
    Check((await client.GetAsync("/api/v1/guest/me")).StatusCode == HttpStatusCode.Unauthorized, "Expired sessions cannot read profile");
    login = await client.PostAsJsonAsync("/api/v1/guest/login", new { email = update.Email, password = newPassword });
    token = (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString()!;
    client.DefaultRequestHeaders.Authorization = new("Bearer", token);
    clock.Advance(TimeSpan.FromMinutes(2));
    var before = mail.Count;
    var unknown = await client.PostAsJsonAsync("/api/v1/guest/password/forgot", new { email = $"missing-{runId}@example.test" });
    Check(unknown.IsSuccessStatusCode && mail.Count == before, "Unknown email has generic success without sending mail");
    var forgot = await client.PostAsJsonAsync("/api/v1/guest/password/forgot", new { email = update.Email });
    var resetChallenge = await forgot.Content.ReadFromJsonAsync<JsonElement>();
    var resetId = resetChallenge.GetProperty("challengeId").GetGuid();
    var resetCode = mail.Codes[resetId];
    Check(mail.Count == before + 1, "Reset delivers one code through platform transport");
    await client.PostAsJsonAsync("/api/v1/guest/password/forgot", new { email = update.Email });
    Check(mail.Count == before + 1, "Resend cooldown prevents email flooding");
    for (var attempt = 0; attempt < 5; attempt++)
        Check((await client.PostAsJsonAsync("/api/v1/guest/password/reset", new { challengeId = resetId, code = resetCode == "000000" ? "000001" : "000000", newPassword, confirmPassword = newPassword })).StatusCode == HttpStatusCode.BadRequest, "Wrong code rejected");
    Check((await client.PostAsJsonAsync("/api/v1/guest/password/reset", new { challengeId = resetId, code = resetCode, newPassword, confirmPassword = newPassword })).StatusCode == HttpStatusCode.BadRequest, "Code locked after five attempts");
    clock.Advance(TimeSpan.FromMinutes(2));
    forgot = await client.PostAsJsonAsync("/api/v1/guest/password/forgot", new { email = update.Email });
    resetId = (await forgot.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("challengeId").GetGuid();
    resetCode = mail.Codes[resetId];
    Check((await client.PostAsJsonAsync("/api/v1/guest/email/verify", new { challengeId = resetId, code = resetCode })).StatusCode == HttpStatusCode.BadRequest, "Reset code cannot verify an email");
    clock.Advance(TimeSpan.FromMinutes(11));
    Check((await client.PostAsJsonAsync("/api/v1/guest/password/reset", new { challengeId = resetId, code = resetCode, newPassword, confirmPassword = newPassword })).StatusCode == HttpStatusCode.BadRequest, "Expired reset code rejected");
    forgot = await client.PostAsJsonAsync("/api/v1/guest/password/forgot", new { email = update.Email });
    resetId = (await forgot.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("challengeId").GetGuid();
    resetCode = mail.Codes[resetId];
    const string recoveredPassword = "Recovered long passphrase 2026!";
    var resetBody = new { challengeId = resetId, code = resetCode, newPassword = recoveredPassword, confirmPassword = recoveredPassword };
    Check((await client.PostAsJsonAsync("/api/v1/guest/password/reset", resetBody)).StatusCode == HttpStatusCode.NoContent, "Valid reset changes password");
    Check((await client.PostAsJsonAsync("/api/v1/guest/password/reset", resetBody)).StatusCode == HttpStatusCode.BadRequest, "Reset code cannot be replayed");
    Check((await client.GetAsync("/api/v1/guest/me")).StatusCode == HttpStatusCode.Unauthorized, "Recovery revokes existing sessions");
    Check((await client.PostAsJsonAsync("/api/v1/guest/login", new { email = update.Email, password = newPassword })).StatusCode == HttpStatusCode.Unauthorized, "Recovery rejects previous password");
    login = await client.PostAsJsonAsync("/api/v1/guest/login", new { email = update.Email, password = recoveredPassword });
    Check(login.IsSuccessStatusCode, "Recovered password can sign in");
    token = (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString()!;
    client.DefaultRequestHeaders.Authorization = new("Bearer", token);
    var delete = new HttpRequestMessage(HttpMethod.Delete, "/api/v1/guest/me") { Content = JsonContent.Create(new { currentPassword = "wrong" }) };
    Check((await client.SendAsync(delete)).StatusCode == HttpStatusCode.BadRequest, "Deletion requires valid current password");
    delete = new(HttpMethod.Delete, "/api/v1/guest/me") { Content = JsonContent.Create(new { currentPassword = recoveredPassword }) };
    Check((await client.SendAsync(delete)).StatusCode == HttpStatusCode.NoContent, "Account deletion succeeds with confirmation credentials");
    Check((await client.GetAsync("/api/v1/guest/me")).StatusCode == HttpStatusCode.Unauthorized, "Deleted account tokens cannot be reused");
    using (var scope = app.Services.CreateScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Check(!await db.GuestProfiles.AnyAsync(x => x.Id == profile.GetProperty("id").GetGuid()) && !await db.GuestSessions.AnyAsync(x => x.GuestProfileId == profile.GetProperty("id").GetGuid()), "Deletion cascades own credentials/sessions and preserves another guest");
    }
    var otherLogin = await client.PostAsJsonAsync("/api/v1/guest/login", new { email = $"second-{runId}@example.test", password = register.Password });
    otherToken = (await otherLogin.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString()!;
    client.DefaultRequestHeaders.Authorization = new("Bearer", otherToken);
    Check((await client.GetAsync("/api/v1/guest/me")).IsSuccessStatusCode, "Deleting one account leaves another account usable");
    await client.SendAsync(new HttpRequestMessage(HttpMethod.Delete, "/api/v1/guest/me") { Content = JsonContent.Create(new { currentPassword = register.Password }) });
    app.Services.GetRequiredService<IOptions<PlatformOptions>>().Value.Enabled = false;
    Check((await client.GetAsync("/api/v1/guest/me")).StatusCode == HttpStatusCode.ServiceUnavailable, "Disabled platform fails closed without touching restaurant accounts");
}
finally { await app.StopAsync(); }

sealed class TestClock : TimeProvider
{
    private DateTimeOffset _now = DateTimeOffset.UtcNow;
    public override DateTimeOffset GetUtcNow() => _now;
    public void Advance(TimeSpan value) => _now += value;
}

sealed class TestMail : IGuestEmailSender
{
    public Dictionary<Guid, string> Codes { get; } = new();
    public int Count => Codes.Count;
    public Task<bool> SendCodeAsync(string email, string code, string purpose, string language, Guid challengeId, CancellationToken ct)
    { Codes[challengeId] = code; return Task.FromResult(true); }
}
