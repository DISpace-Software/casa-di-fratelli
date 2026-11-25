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
    builder.Services.AddScoped<SeatMap.Api.Application.Waitlist.ConfirmWaitlistOffer>();
    builder.Services.AddScoped<SeatMap.Api.Application.Waitlist.AdministerWaitlist>();
    builder.Services.AddScoped<AuditService>();
    builder.Services.AddScoped<SeatMap.Api.Application.Waitlist.GetGuestWaitlistInbox>();
    builder.Services.AddScoped<CurrentTenant>(); builder.Services.AddScoped<ICurrentTenant>(s => s.GetRequiredService<CurrentTenant>());
    builder.Services.AddSingleton(TimeProvider.System); builder.Services.AddSingleton<GuestPasswordHasher>(); builder.Services.AddScoped<GuestAuthService>();
    builder.Services.AddSingleton<IGuestEmailSender, Mail>();
    builder.Services.AddScoped<TenantBrandingService>(); builder.Services.AddScoped<FloorPlanService>(); builder.Services.AddScoped<SeasonalZoneService>();
    builder.Services.AddScoped<RestaurantClosureService>(); builder.Services.AddScoped<ReservationConflictService>(); builder.Services.AddScoped<WaitlistService>(); builder.Services.AddScoped<ReservationBookingService>();
    builder.Services.AddScoped<IReservationBookingNotifications, NoNotifications>();
    builder.Services.AddScoped<GuestReservationService>();
    builder.Services.AddControllers().AddApplicationPart(typeof(WaitlistController).Assembly);
    builder.Services.AddRateLimiter(o => { foreach (var key in new[] { "guest-auth", "guest-reservations" }) o.AddPolicy(key, _ => System.Threading.RateLimiting.RateLimitPartition.GetNoLimiter("tests")); });
    await using var app = builder.Build(); app.UseRouting(); app.UseRateLimiter(); app.UseMiddleware<TenantResolutionMiddleware>(); app.MapControllers();
    const string token = "waitlist-http-isolated-test-session-token";
    const string otherToken = "waitlist-http-other-guest-session-token";
    using (var scope = app.Services.CreateScope()) {
        var p = scope.ServiceProvider.GetRequiredService<PlatformDbContext>(); await p.Database.EnsureCreatedAsync();
        p.GuestProfiles.Add(guest); p.GuestSessions.Add(new() { GuestProfileId = guest.Id, TokenHash = GuestAuthService.HashToken(token), CreatedAtUtc = DateTime.UtcNow, ExpiresAtUtc = DateTime.UtcNow.AddHours(1) }); await p.SaveChangesAsync();
        var other = new GuestProfile { IdentityIssuer = "test", IdentitySubject = "other", DisplayName = "Other", Email = "other-http@example.test", Phone = "+359888765432", EmailVerifiedAtUtc = DateTime.UtcNow };
        p.GuestProfiles.Add(other); p.GuestSessions.Add(new() { GuestProfileId = other.Id, TokenHash = GuestAuthService.HashToken(otherToken), CreatedAtUtc = DateTime.UtcNow, ExpiresAtUtc = DateTime.UtcNow.AddHours(1) }); await p.SaveChangesAsync();
    }
    await app.StartAsync();
    try {
      using var http = new HttpClient { BaseAddress = new(app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single()) };
      const string path = "/api/v1/restaurants/test/waitlist";
      check((await http.GetAsync(path)).StatusCode == HttpStatusCode.Unauthorized, "HTTP guest queue rejects anonymous access");
      http.DefaultRequestHeaders.Authorization = new("Bearer", token);
      var existingCapability = GuestReservationService.CreateToken();
      int existingId;
      using (var scope = app.Services.CreateScope()) {
          var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
          var occupied = new SeatMap.Api.Models.Reservation { GuestName = "Earlier guest", Phone = "+359888999999", Email = "earlier@example.test", GuestCount = 4, ReservedDate = date, ReservedTime = "19:00", Area = "inside", Status = "Approved", GuestManagementTokenHash = GuestReservationService.HashToken(existingCapability), Tables = [new() { TableCode = "T1" }] };
          db.Reservations.Add(occupied); await db.SaveChangesAsync(); existingId = occupied.Id;
      }
      var joined = await http.PostAsJsonAsync(path, new WaitlistRequest(date, 4, "inside", ["19:00"]));
      check(joined.IsSuccessStatusCode, "HTTP authenticated join succeeds");
      var entry = await joined.Content.ReadFromJsonAsync<JsonElement>(); var id = entry.GetProperty("id").GetGuid();
      using (var scope = app.Services.CreateScope()) { scope.ServiceProvider.GetRequiredService<CurrentTenant>().Resolve(tenant); await scope.ServiceProvider.GetRequiredService<WaitlistService>().TickAsync(); }
      var waitingInbox = await http.GetFromJsonAsync<JsonElement>("/api/v1/guest/waitlist");
      check(waitingInbox.GetProperty("entries").EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == id).GetProperty("status").GetString() == "waiting", "HTTP occupied table leaves guest waiting");
      using (var earlier = new HttpClient { BaseAddress = http.BaseAddress }) {
          earlier.DefaultRequestHeaders.Add("X-Reservation-Token", existingCapability);
          check((await earlier.PostAsync($"/api/v1/restaurants/test/reservations/{existingId}/cancel", null)).IsSuccessStatusCode, "HTTP existing guest cancels and releases table");
      }
      using (var scope = app.Services.CreateScope()) { scope.ServiceProvider.GetRequiredService<CurrentTenant>().Resolve(tenant); await scope.ServiceProvider.GetRequiredService<WaitlistService>().TickAsync(); }
      var inbox = await http.GetFromJsonAsync<JsonElement>("/api/v1/guest/waitlist");
      var offered = inbox.GetProperty("entries").EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == id);
      check(offered.GetProperty("status").GetString() == "offered" && offered.GetProperty("restaurantId").GetString() == "test", "HTTP inbox restores personal offer across restaurants");
      http.DefaultRequestHeaders.Authorization = new("Bearer", otherToken);
      check((await http.PostAsJsonAsync($"{path}/{id}/confirm", new { offerId = offered.GetProperty("offerId").GetGuid() })).StatusCode == HttpStatusCode.NotFound, "HTTP another guest cannot accept the offer");
      check((await http.PostAsync($"{path}/{id}/cancel", null)).StatusCode == HttpStatusCode.NotFound, "HTTP another guest cannot cancel the request");
      http.DefaultRequestHeaders.Authorization = new("Bearer", token);
      var accepted = await http.PostAsJsonAsync($"{path}/{id}/confirm", new { offerId = offered.GetProperty("offerId").GetGuid() });
      check(accepted.IsSuccessStatusCode, "HTTP confirmation succeeds");
      var confirmed = await accepted.Content.ReadFromJsonAsync<JsonElement>();
      var bookingId = confirmed.GetProperty("id").GetInt32();
      var capability = confirmed.GetProperty("managementToken").GetString()!;
      var guestPath = $"/api/v1/restaurants/test/reservations/{bookingId}/guest";
      using var guestHttp = new HttpClient { BaseAddress = http.BaseAddress };
      check((await guestHttp.GetAsync(guestPath)).StatusCode == HttpStatusCode.NotFound, "HTTP booking status rejects a missing capability");
      guestHttp.DefaultRequestHeaders.Add("X-Reservation-Token", capability);
      var status = await guestHttp.GetAsync(guestPath);
      check(status.IsSuccessStatusCode && (await status.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString() == "Approved", "HTTP returned capability reads the approved reservation");
      var recovered = await http.PostAsJsonAsync($"{path}/{id}/confirm", new { offerId = offered.GetProperty("offerId").GetGuid() });
      var recovery = await recovered.Content.ReadFromJsonAsync<JsonElement>();
      check(recovered.IsSuccessStatusCode && recovery.GetProperty("id").GetInt32() == bookingId, "HTTP lost confirmation response recovers same reservation");
      check((await guestHttp.GetAsync(guestPath)).StatusCode == HttpStatusCode.NotFound, "HTTP recovery revokes previous capability");
      guestHttp.DefaultRequestHeaders.Remove("X-Reservation-Token");
      guestHttp.DefaultRequestHeaders.Add("X-Reservation-Token", recovery.GetProperty("managementToken").GetString());
      check((await guestHttp.GetAsync(guestPath)).IsSuccessStatusCode, "HTTP recovered capability manages the reservation");
      using (var scope = app.Services.CreateScope()) {
          var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
          check(await db.Reservations.CountAsync(x => x.ReservedDate == date && x.Email == guest.Email) == 1, "HTTP confirmation retry creates exactly one reservation");
      }
      using (var scope = app.Services.CreateScope()) {
          scope.ServiceProvider.GetRequiredService<CurrentTenant>().Resolve(tenant);
          var staff = scope.ServiceProvider.GetRequiredService<SeatMap.Api.Application.Waitlist.AdministerWaitlist>();
          var actor = new Microsoft.AspNetCore.Http.DefaultHttpContext();
          var invalidSettings = await staff.UpdateSettingsAsync(new(true, 1), actor);
          check(invalidSettings.Kind == ReservationBookingResultKind.Invalid, "Staff workflow preserves offer-duration validation");
          var changedSettings = await staff.UpdateSettingsAsync(new(true, 5), actor);
          var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
          check(changedSettings.Kind == ReservationBookingResultKind.Success &&
              await db.AuditLogs.AnyAsync(x => x.Action == "waitlist.settings"), "Staff settings and audit persist together");
          var platformDisabled = new SeatMap.Api.Application.Waitlist.AdministerWaitlist(
              db, scope.ServiceProvider.GetRequiredService<WaitlistService>(),
              scope.ServiceProvider.GetRequiredService<AuditService>(), scope.ServiceProvider.GetRequiredService<FloorPlanService>());
          var unavailable = await platformDisabled.JoinAsync(new(guest.Email, new(date, 4, "inside", ["19:00"]), true), actor);
          check(unavailable.Kind == ReservationBookingResultKind.Unavailable &&
              unavailable.ToActionResult() is Microsoft.AspNetCore.Mvc.StatusCodeResult { StatusCode: 503 },
              "Disabled platform is an explicit unavailable outcome mapped to legacy 503");
          check(ReservationBookingResult.Invalid(null).ToActionResult() is Microsoft.AspNetCore.Mvc.BadRequestResult &&
              ReservationBookingResult.NotFound(null).ToActionResult() is Microsoft.AspNetCore.Mvc.NotFoundResult,
              "Empty application failures preserve legacy status-only HTTP results");
          var closeBooked = await staff.CancelAsync(id, new("test"), actor);
          check(closeBooked.Kind == ReservationBookingResultKind.Conflict, "Staff workflow cannot cancel a converted queue entry");
      }
      var cancelled = await http.PostAsync($"{path}/{id}/cancel", null);
      check(cancelled.StatusCode == HttpStatusCode.Conflict, "HTTP cannot cancel confirmed booking as a queue request");
      http.DefaultRequestHeaders.Add("X-Tenant-Id", "unknown");
      check((await http.GetAsync(path)).StatusCode == HttpStatusCode.NotFound, "HTTP mismatched tenant selector rejected");
    } finally { await app.StopAsync(); }
 }
 private sealed class Mail : IGuestEmailSender { public Task<bool> SendCodeAsync(string email,string code,string purpose,string language,Guid id,CancellationToken ct) => Task.FromResult(true); }
}
