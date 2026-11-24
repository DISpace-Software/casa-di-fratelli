using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SeatMap.Api.Controllers;
using SeatMap.Api.Data;
using SeatMap.Api.Platform;
using SeatMap.Api.Platform.Auth;
using SeatMap.Api.Platform.Data;
using SeatMap.Api.Platform.Models;
using SeatMap.Api.Services;
using SeatMap.Api.Services.FloorPlans;
using SeatMap.Api.Services.Reservations;
using SeatMap.Api.Services.Tenancy;
using SeatMap.Api.Services.Waitlist;

static class HttpChecks
{
 public static async Task Run(SqliteConnection restaurant, GuestProfile guest, DateOnly date, Action<bool,string> check)
 {
    await using var platform = new SqliteConnection("Data Source=:memory:"); await platform.OpenAsync();
    var builder = WebApplication.CreateBuilder(); builder.Logging.ClearProviders(); builder.WebHost.UseUrls("http://127.0.0.1:0");
    builder.Services.Configure<PlatformOptions>(x => x.Enabled = true);
    var tenant = new TenantDefinition { Id = "test", Name = "Test", NotificationsEnabled = false };
    builder.Services.Configure<TenantResolutionOptions>(x => { x.RequireKnownTenant = true; x.DefaultTenant = tenant; x.Tenants = [tenant]; });
    builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlite(restaurant));
    builder.Services.AddDbContext<PlatformDbContext>(o => o.UseSqlite(platform));
    builder.Services.AddScoped<CurrentTenant>(); builder.Services.AddScoped<ICurrentTenant>(s => s.GetRequiredService<CurrentTenant>());
    builder.Services.AddSingleton(TimeProvider.System); builder.Services.AddSingleton<GuestPasswordHasher>(); builder.Services.AddScoped<GuestAuthService>();
    builder.Services.AddSingleton<IGuestEmailSender, Mail>();
    builder.Services.AddScoped<TenantBrandingService>(); builder.Services.AddScoped<FloorPlanService>(); builder.Services.AddScoped<SeasonalZoneService>();
    builder.Services.AddScoped<RestaurantClosureService>(); builder.Services.AddScoped<ReservationConflictService>(); builder.Services.AddScoped<WaitlistService>(); builder.Services.AddScoped<ReservationBookingService>();
    builder.Services.AddScoped<IReservationBookingNotifications, NoNotifications>();
    builder.Services.AddControllers().AddApplicationPart(typeof(WaitlistController).Assembly);
    builder.Services.AddRateLimiter(o => { foreach (var key in new[] { "guest-auth", "guest-reservations" }) o.AddPolicy(key, _ => System.Threading.RateLimiting.RateLimitPartition.GetNoLimiter("tests")); });
    await using var app = builder.Build(); app.UseRouting(); app.UseRateLimiter(); app.UseMiddleware<TenantResolutionMiddleware>(); app.MapControllers();
    const string token = "waitlist-http-isolated-test-session-token";
    using (var scope = app.Services.CreateScope()) {
        var p = scope.ServiceProvider.GetRequiredService<PlatformDbContext>(); await p.Database.EnsureCreatedAsync();
        p.GuestProfiles.Add(guest); p.GuestSessions.Add(new() { GuestProfileId = guest.Id, TokenHash = GuestAuthService.HashToken(token), CreatedAtUtc = DateTime.UtcNow, ExpiresAtUtc = DateTime.UtcNow.AddHours(1) }); await p.SaveChangesAsync();
    }
    await app.StartAsync();
    try {
      using var http = new HttpClient { BaseAddress = new(app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single()) };
      const string path = "/api/v1/restaurants/test/waitlist";
      check((await http.GetAsync(path)).StatusCode == HttpStatusCode.Unauthorized, "HTTP guest queue rejects anonymous access");
      http.DefaultRequestHeaders.Authorization = new("Bearer", token);
      var joined = await http.PostAsJsonAsync(path, new WaitlistRequest(date, 4, "inside", ["19:00"]));
      check(joined.IsSuccessStatusCode, "HTTP authenticated join succeeds");
      var entry = await joined.Content.ReadFromJsonAsync<JsonElement>(); var id = entry.GetProperty("id").GetGuid();
      using (var scope = app.Services.CreateScope()) { scope.ServiceProvider.GetRequiredService<CurrentTenant>().Resolve(tenant); await scope.ServiceProvider.GetRequiredService<WaitlistService>().TickAsync(); }
      var inbox = await http.GetFromJsonAsync<JsonElement>("/api/v1/guest/waitlist");
      var offered = inbox.GetProperty("entries").EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == id);
      check(offered.GetProperty("status").GetString() == "offered" && offered.GetProperty("restaurantId").GetString() == "test", "HTTP inbox restores personal offer across restaurants");
      var accepted = await http.PostAsJsonAsync($"{path}/{id}/confirm", new { offerId = offered.GetProperty("offerId").GetGuid() });
      check(accepted.IsSuccessStatusCode && (await accepted.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("managementToken").GetString()!.Length >= 32, "HTTP confirmation returns a usable booking capability");
      var cancelled = await http.PostAsync($"{path}/{id}/cancel", null);
      check(cancelled.StatusCode == HttpStatusCode.Conflict, "HTTP cannot cancel confirmed booking as a queue request");
      http.DefaultRequestHeaders.Add("X-Tenant-Id", "unknown");
      check((await http.GetAsync(path)).StatusCode == HttpStatusCode.NotFound, "HTTP mismatched tenant selector rejected");
    } finally { await app.StopAsync(); }
 }
 private sealed class Mail : IGuestEmailSender { public Task<bool> SendCodeAsync(string email,string code,string purpose,string language,Guid id,CancellationToken ct) => Task.FromResult(true); }
}
