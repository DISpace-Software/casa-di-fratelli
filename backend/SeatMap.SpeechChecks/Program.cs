using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
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
using SeatMap.Api.Data;
using SeatMap.Api.Models;
using SeatMap.Api.Services;
using SeatMap.Api.Services.Reservations;
using SeatMap.Api.Services.Tenancy;

var passed = 0;
void Check(bool condition, string scenario) { if (!condition) throw new Exception(scenario); passed++; Console.WriteLine($"PASS {scenario}"); }
var options = new ReservationSpeechOptions();
Check(!options.Enabled && options.AllowedTenants.SequenceEqual(["casa-di-fratelli"]), "Speech is disabled by default and opt-in is scoped to Casa");
options.Enabled = true; options.ServiceToken = "fixture-worker-token-for-tests-0123456789"; options.ServiceUrl = "https://speech.example.test";
Check(options.Endpoint(false)?.AbsoluteUri == "https://speech.example.test/v1/audio/transcriptions", "Private worker route is fixed");
foreach (var url in new[] { "http://speech.example.test", "https://user:pass@speech.example.test", "https://speech.example.test/path", "https://speech.example.test/?key=x", "file:///tmp/audio" })
{ options.ServiceUrl = url; Check(options.Endpoint(false) is null, "Reject unsafe worker URL shape"); }
options.ServiceUrl = "http://127.0.0.1:9988";
Check(options.Endpoint(false) is null && options.Endpoint(true) is not null, "HTTP loopback worker requires Development");
options.ServiceUrl = "https://speech.example.test"; options.ServiceToken = "";
Check(options.Endpoint(false) is null, "A service token is required even for the configured endpoint");
options.ServiceToken = "too-short";
Check(options.Endpoint(false) is null, "Worker token strength agrees with the private worker configuration");
options.ServiceToken = "fixture-worker-token-for-tests-0123456789";

var clock = new TestClock(); var gate = new ReservationSpeechGate(clock);
var first = gate.TryEnter("casa", 1, out _); var second = gate.TryEnter("casa", 2, out _);
Check(first is not null && second is not null && gate.TryEnter("casa", 3, out var busy) is null && busy == "busy", "Global concurrency includes separate administrators");
first!.Dispose(); first.Dispose(); second!.Dispose();
for (var i = 1; i < ReservationSpeechGate.RequestsPerAdminMinute; i++) gate.TryEnter("casa", 1, out _)!.Dispose();
Check(gate.TryEnter("casa", 1, out var rate) is null && rate == "rate-limited", "Administrator rate is bounded and idempotent lease disposal is safe");
using (var otherTenant = gate.TryEnter("cofein", 1, out _)) Check(otherTenant is not null, "Same numeric administrator ID in another tenant has a separate allowance");
clock.Advance(TimeSpan.FromSeconds(61));
using (var reset = gate.TryEnter("casa", 1, out _)) Check(reset is not null, "Expired limiter entries recover");

var casa = new TenantDefinition { Id = "casa-di-fratelli", Slug = "casa-di-fratelli", Domain = "casa.example.test" };
var cofein = new TenantDefinition { Id = "cofein", Slug = "cofein", Domain = "cofein.example.test" };
var tenancy = new TenantResolutionOptions { RequireKnownTenant = true, DefaultTenant = casa, Tenants = [casa, cofein] };
var connections = new Dictionary<string, SqliteConnection>();
foreach (var tenant in tenancy.Tenants)
{
    var connection = new SqliteConnection("Data Source=:memory:"); await connection.OpenAsync(); connections[tenant.Id] = connection;
    await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
    await db.Database.EnsureCreatedAsync();
    db.AdminUsers.Add(new AdminUser { Id = 1, Name = "Fixture admin", Email = "admin@example.test", Role = "Administrator", IsActive = true });
    db.AdminSessions.Add(new AdminSession { AdminUserId = 1, TokenHash = AdminAuthService.HashToken($"fixture-{tenant.Id}"), ExpiresAtUtc = DateTime.UtcNow.AddHours(1) });
    db.AdminUsers.Add(new AdminUser { Id = 2, Name = "Fixture waiter", Email = "waiter@example.test", Role = "Waiter", IsActive = true });
    db.AdminSessions.Add(new AdminSession { AdminUserId = 2, TokenHash = AdminAuthService.HashToken($"fixture-waiter-{tenant.Id}"), ExpiresAtUtc = DateTime.UtcNow.AddHours(1) });
    await db.SaveChangesAsync();
}
var worker = new WorkerHandler();
var builder = WebApplication.CreateBuilder();
builder.Logging.ClearProviders(); builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Services.AddSingleton<IOptions<TenantResolutionOptions>>(Options.Create(tenancy));
builder.Services.AddSingleton<IOptions<ReservationSpeechOptions>>(Options.Create(options));
builder.Services.AddSingleton<TimeProvider>(TimeProvider.System);
builder.Services.AddSingleton<ReservationSpeechGate>();
builder.Services.AddScoped<CurrentTenant>();
builder.Services.AddScoped<ICurrentTenant>(p => p.GetRequiredService<CurrentTenant>());
builder.Services.AddScoped(p => new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connections[p.GetRequiredService<CurrentTenant>().TenantId]).Options));
builder.Services.AddScoped<AdminAuthService>();
builder.Services.AddTransient(_ => new HttpClient(worker, false));
builder.Services.AddTransient<ReservationSpeechService>();
builder.Services.AddControllers().AddApplicationPart(typeof(ReservationSpeechController).Assembly);
await using var app = builder.Build();
app.UseRouting(); app.UseMiddleware<TenantResolutionMiddleware>(); app.MapControllers(); await app.StartAsync();
using var client = new HttpClient { BaseAddress = new Uri(app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single()) };
var wav = Encoding.ASCII.GetBytes("RIFF1234WAVEfixture-audio");
MultipartFormDataContent Form(byte[]? bytes = null, string mime = "audio/wav", string language = "bg-BG", string field = "guestName", bool duplicate = false)
{
    var form = new MultipartFormDataContent();
    var audio = new ByteArrayContent(bytes ?? wav); audio.Headers.ContentType = MediaTypeHeaderValue.Parse(mime);
    form.Add(audio, "audio", "untrusted-original-name.wav"); form.Add(new StringContent(language), "language"); form.Add(new StringContent(field), "field");
    if (duplicate) form.Add(new StringContent("ru"), "language");
    return form;
}
async Task<HttpResponseMessage> Send(string suffix, HttpContent? body = null, string tenant = "casa-di-fratelli", string? token = "fixture-casa-di-fratelli", string? origin = null)
{
    using var request = new HttpRequestMessage(body is null ? HttpMethod.Get : HttpMethod.Post, $"/api/admin/reservations/voice/{suffix}");
    request.Headers.Add("X-Tenant-Id", tenant); if (token is not null) request.Headers.Add("X-Admin-Token", token);
    if (origin is not null) request.Headers.Add("Origin", origin);
    request.Content = body; return await client.SendAsync(request);
}
async Task Code(HttpResponseMessage response, int status, string code, string scenario)
{
    using (response)
    {
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Check((int)response.StatusCode == status && json.GetProperty("code").GetString() == code, scenario);
    }
}
try
{
    using (var response = await Send("capabilities", token: null)) Check(response.StatusCode == HttpStatusCode.Unauthorized, "Capabilities require an actual stored admin session");
    using (var response = await Send("transcribe", Form(), token: null)) Check(response.StatusCode == HttpStatusCode.Unauthorized && worker.Calls == 0, "Unauthenticated audio never reaches the worker");
    using (var response = await Send("capabilities", token: "fixture-waiter-casa-di-fratelli")) Check(response.StatusCode == HttpStatusCode.Forbidden, "Waiter cannot inspect privileged speech capabilities");
    using (var response = await Send("transcribe", Form(), token: "fixture-waiter-casa-di-fratelli")) Check(response.StatusCode == HttpStatusCode.Forbidden && worker.Calls == 0, "Waiter cannot send audio to inference");
    using (var response = await Send("transcribe", Form(), tenant: "cofein")) Check(response.StatusCode == HttpStatusCode.Unauthorized && worker.Calls == 0, "Casa session cannot upload as Cofein despite the same numeric admin ID");
    await Code(await Send("transcribe", Form(), tenant: "cofein", token: "fixture-cofein"), 404, "unavailable", "A valid session cannot bypass the tenant allowlist");
    using (var response = await Send("transcribe", Form(), origin: "https://cofein.example.test")) Check(response.StatusCode == HttpStatusCode.NotFound && worker.Calls == 0, "Tenant/origin mismatch is rejected before voice processing");
    using (var response = await Send("capabilities"))
    {
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        var text = json.ToString();
        Check(json.GetProperty("enabled").GetBoolean() && json.GetProperty("languages").GetArrayLength() == 3 && !text.Contains("Service") && !text.Contains("fixture-worker"), "Capabilities expose availability without the worker URL or secret");
    }
    options.Enabled = false;
    await Code(await Send("transcribe", Form()), 404, "unavailable", "Disabled feature never sends audio");
    options.Enabled = true; options.ServiceToken = "";
    await Code(await Send("transcribe", Form()), 503, "unavailable", "Missing worker configuration fails closed");
    options.ServiceToken = "fixture-worker-token-for-tests-0123456789";
    await Code(await Send("transcribe", Form(mime: "video/mp4")), 400, "invalid-audio", "Reject unsupported declared MIME");
    await Code(await Send("transcribe", Form(Encoding.ASCII.GetBytes("not-a-real-audio-file"))), 400, "invalid-audio", "Reject a MIME/magic mismatch");
    await Code(await Send("transcribe", Form(language: "fr")), 400, "invalid-language", "Reject unconfigured language");
    await Code(await Send("transcribe", Form(field: "adminPassword")), 400, "invalid-field", "Reject arbitrary field names");
    await Code(await Send("transcribe", Form(duplicate: true)), 400, "invalid-audio", "Reject ambiguous duplicate multipart fields");
    await Code(await Send("transcribe", Form(new byte[ReservationSpeechAudio.MaxAudioBytes + 1])), 413, "audio-too-large", "Limit the actual streamed audio bytes independently of multipart size");
    Check(worker.Calls == 0, "Rejected uploads and unavailable tenants never reach inference");
    using (var response = await Send("transcribe", Form()))
    {
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Check(response.IsSuccessStatusCode && json.GetProperty("text").GetString() == "Георги Иванов" && response.Headers.CacheControl?.NoStore == true, "Authenticated transcript result is returned with no-store");
        Check(worker.LastUri == "https://speech.example.test/v1/audio/transcriptions" && worker.AuthValid && worker.MultipartValid, "Worker receives only fixed route, bearer, normalized language, field and generated filename");
    }
    foreach (var sample in new[] { ("audio/mp4", new byte[] {0,0,0,24,102,116,121,112,77,52,65,32}), ("audio/webm;codecs=opus", new byte[]{0x1a,0x45,0xdf,0xa3,0,0,0,0,0,0,0,0}), ("audio/ogg", Encoding.ASCII.GetBytes("OggS12345678")) })
    { using var response = await Send("transcribe", Form(sample.Item2, sample.Item1)); Check(response.IsSuccessStatusCode, "Accept supported audio container signature and MIME"); }
    worker.Status = HttpStatusCode.Unauthorized; worker.Body = "secret internal worker failure";
    await Code(await Send("transcribe", Form()), 502, "recognition-unavailable", "Worker authentication/error details remain private");
    worker.Status = HttpStatusCode.TooManyRequests;
    await Code(await Send("transcribe", Form()), 429, "busy", "Worker concurrency response maps to retryable busy");
    worker.Status = HttpStatusCode.RequestEntityTooLarge;
    await Code(await Send("transcribe", Form()), 413, "audio-too-large", "Worker decoded-duration limits request a shorter recording");
    worker.Status = HttpStatusCode.OK; worker.Body = "[\"invalid\"]";
    await Code(await Send("transcribe", Form()), 502, "recognition-unavailable", "Reject a malformed success envelope");
    worker.Body = "{\"text\":\" \"}";
    await Code(await Send("transcribe", Form()), 422, "no-speech", "Empty recognition never becomes field content");
    worker.Body = new string('x', 17000);
    await Code(await Send("transcribe", Form()), 502, "recognition-unavailable", "Bound the worker response body");
    worker.ThrowTimeout = true;
    await Code(await Send("transcribe", Form()), 504, "timeout", "Worker timeout has a sanitized bounded failure");
    Check(await CountSessions(connections[casa.Id]) == 2 && await CountSessions(connections[cofein.Id]) == 2, "Voice requests do not create reservations or admin sessions");
}
finally { await app.StopAsync(); foreach (var connection in connections.Values) await connection.DisposeAsync(); }
Console.WriteLine($"PASS {passed} focused speech checks (synthetic protocol responses; no external inference).");

static async Task<int> CountSessions(SqliteConnection connection)
{
    await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
    if (await db.Reservations.AnyAsync()) throw new Exception("Voice processing wrote a reservation");
    return await db.AdminSessions.CountAsync();
}
sealed class TestClock : TimeProvider { private DateTimeOffset _now = DateTimeOffset.UtcNow; public override DateTimeOffset GetUtcNow() => _now; public void Advance(TimeSpan amount) => _now += amount; }
sealed class WorkerHandler : HttpMessageHandler
{
    public int Calls; public HttpStatusCode Status = HttpStatusCode.OK; public string Body = "{\"text\":\"Георги Иванов\"}";
    public string? LastUri; public bool AuthValid, MultipartValid, ThrowTimeout;
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
    {
        Calls++; LastUri = request.RequestUri?.AbsoluteUri;
        AuthValid = request.Headers.Authorization?.Scheme == "Bearer" && request.Headers.Authorization.Parameter == "fixture-worker-token-for-tests-0123456789";
        var parts = (MultipartFormDataContent)request.Content!;
        var named = parts.ToDictionary(part => part.Headers.ContentDisposition!.Name!.Trim('"'));
        MultipartValid = named.Count == 3 && named.ContainsKey("file") &&
            named["file"].Headers.ContentDisposition!.FileName!.Trim('"').StartsWith("reservation.") &&
            await named["language"].ReadAsStringAsync(token) == "bg" && await named["field"].ReadAsStringAsync(token) == "guestName";
        if (ThrowTimeout) throw new TaskCanceledException("private worker timeout detail");
        return new HttpResponseMessage(Status) { Content = new StringContent(Body, Encoding.UTF8, "application/json") };
    }
}
