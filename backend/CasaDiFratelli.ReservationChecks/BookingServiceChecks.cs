using SeatMap.Api.Services.FloorPlans;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using SeatMap.Api.Controllers;
using SeatMap.Api.Data;
using SeatMap.Api.Dtos;
using SeatMap.Api.Models;
using SeatMap.Api.Services;
using SeatMap.Api.Services.Reservations;
using SeatMap.Api.Services.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

internal static class BookingServiceChecks
{
    private static void Check(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }
    private static JsonElement Json(ReservationBookingResult result) => JsonSerializer.SerializeToElement(result.Value);
    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();
    private static CreateReservationRequest Request(string email = "guest@example.test") => new()
    {
        GuestName = " Guest ", Phone = " +359 888 123 456 ", Email = email,
        GuestCount = 2, Area = "indoor", ReservedDate = new(2026, 11, 4), ReservedTime = "19:00",
        TableIds = ["1"], PrivacyConsent = true
    };
    public static async Task RunAsync()
    {
        await CreationAndConfirmationAsync();
        await AutomaticConfirmationAsync();
        await RulesAsync();
        await AdminCapacityOverrideAsync();
        await FailureAndAtomicityAsync();
        await ConfirmationTemplateAsync();
        await HttpAdaptersAsync();
    }

    private static async Task AdminCapacityOverrideAsync()
    {
        await using var restaurant = await Restaurant.CreateAsync("casa-di-fratelli");
        var current = new CurrentTenant(); current.Resolve(restaurant.Tenant);
        var plans = new FloorPlanService(restaurant.Db, current);
        var plan = await plans.GetAsync();
        await plans.SaveAsync(plan with { Tables = [.. plan.Tables, new("23", "indoor", 82, 90, 4, false, true, true)] });

        var request = Request();
        request.TableIds = ["23"]; request.GuestCount = 6;
        request.ReservedDate = new(2026, 11, 6); request.ReservedTime = "19:30";
        Check((await restaurant.Booking.CreateAsync(request)).Kind == ReservationBookingResultKind.Invalid,
            "Public six-person booking at four-seat Casa table 23 must remain rejected");
        request.CreatedByAdmin = true; request.Email = ""; request.PrivacyConsent = false;
        Check((await restaurant.Booking.CreateAsync(request)).Kind == ReservationBookingResultKind.Unauthorized,
            "A forged administrator flag must never gain a capacity override");
        Check(!await restaurant.Db.Reservations.AnyAsync(), "Rejected capacity or forged requests must not persist");

        var administrator = new AdminPrincipal(7, "Owner", "owner@example.test", "Owner");
        Check((await restaurant.Booking.CreateAsync(request, administrator)).Kind == ReservationBookingResultKind.Success,
            "Authenticated staff must retain legacy six-person booking at nominal four-seat table 23");
        var saved = await restaurant.Db.Reservations.Include(r => r.Tables).SingleAsync();
        Check(saved.GuestCount == 6 && saved.Tables.Single().TableCode == "23" && saved.Status == "Approved" && saved.CreatedByAdminUserId == administrator.Id,
            "Staff capacity override must preserve the requested guest count, table and authenticated attribution");
        Check((await plans.GetAsync()).Tables.Single(t => t.Id == "23").Seats == 4,
            "A staff booking must not rewrite the restaurant's nominal table capacity");
        Check((await plans.SelectAsync(["23"], "indoor", 6)).Error != null,
            "Capacity selection must remain strict unless a staff workflow explicitly requests the override");
        Check((await plans.SelectAsync(["23"], "indoor", 6, publicBooking: true, allowCapacityOverride: true)).Error != null,
            "Public selection must remain strict even if an internal caller mistakenly supplies the staff override");
        var currentPlan = await plans.GetAsync();
        foreach (var invalidPlan in new[] {
            currentPlan with { Tables = currentPlan.Tables.Select(t => t.Id == "23" ? t with { IsActive = false } : t).ToList() },
            currentPlan with { Tables = currentPlan.Tables.Select(t => t.Id == "23" ? t with { Id = "23A" } : t).ToList() }
        })
        {
            var rejected = false;
            try { await plans.SaveAsync(invalidPlan); } catch (ArgumentException) { rejected = true; }
            Check(rejected, "A future staff booking above nominal capacity must still block deactivating or renaming its table");
        }
        request.GuestName = "Another local guest"; request.Phone = "another-local-phone";
        Check((await restaurant.Booking.CreateAsync(request, administrator)).Kind == ReservationBookingResultKind.Conflict,
            "Staff capacity flexibility must not bypass occupied-table conflicts");
        Check(await restaurant.Db.Reservations.CountAsync() == 1 && restaurant.Notices.Confirmed == 0 && restaurant.Notices.Tokens.Count == 0,
            "The regression scenario must create exactly one manual reservation and send no public notices");
        var controller = new ReservationsController(restaurant.Db, null!, null!, new(restaurant.Db), null!,
            new AuditService(restaurant.Db), new ProductTierService(restaurant.Db), current, null!, restaurant.Booking)
        { ControllerContext = new() { HttpContext = new DefaultHttpContext() } };
        controller.HttpContext.Items["AdminUser"] = administrator;
        Check(await controller.UpdateReservation(saved.Id, new() {
            GuestName = "Edited staff booking", Phone = "local-test", Email = "", GuestCount = 7,
            Area = "indoor", ReservedDate = saved.ReservedDate, ReservedTime = saved.ReservedTime, TableIds = ["23"]
        }) is OkObjectResult, "Staff must be able to edit an above-nominal-capacity reservation");
        Check(saved.GuestCount == 7, "Staff edit must retain the requested guest count");
        Check(await controller.UpdateTables(saved.Id, new() { Area = "indoor", TableIds = ["1"], GuestCount = 7 }) is OkObjectResult,
            "Staff must be able to move an above-nominal-capacity reservation to another active table");
        Check(await controller.UpdateTables(saved.Id, new() { Area = "indoor", TableIds = ["23"], GuestCount = 6 }) is OkObjectResult,
            "Staff must be able to restore the selected table without rewriting its capacity");
        Check(await controller.Approve(saved.Id) is OkObjectResult,
            "Staff approval must accept the manually arranged guest count");
        Check(await controller.MarkArrived(saved.Id) is OkObjectResult && saved.IsArrived,
            "Staff arrival must accept the manually arranged guest count");
        Check((await plans.GetAsync()).Tables.Single(t => t.Id == "23").Seats == 4,
            "Staff lifecycle actions must not rewrite nominal table capacity");
        saved.Status = "Cancelled"; saved.IsDeleted = true;
        await restaurant.Db.SaveChangesAsync();
        var maintenance = new MaintenanceController(restaurant.Db, new AuditService(restaurant.Db), null!, new(restaurant.Db), plans)
        { ControllerContext = new() { HttpContext = new DefaultHttpContext() } };
        Check(await maintenance.RestoreReservation(saved.Id) is ForbidResult, "Unauthenticated restore must not gain staff capacity flexibility");
        maintenance.HttpContext.Items["AdminUser"] = administrator;
        Check(await maintenance.RestoreReservation(saved.Id) is OkObjectResult && !saved.IsDeleted && saved.Status == "Approved",
            "Authorized restore must retain a manually arranged reservation above nominal capacity");
        Console.WriteLine("PASS: Casa table 23 staff create/edit/move/approve/arrive/restore capacity override, strict public/default selection, authentication, unchanged capacity, protected table identity and overlap protection.");
    }

    private static async Task CreationAndConfirmationAsync()
    {
        await using var restaurant = await Restaurant.CreateAsync("alpha");
        var request = Request();
        request.TableIds = [" 1 ", "1"];
        request.InternalNote = "Must not be accepted from a public caller";
        var result = await restaurant.Booking.CreateAsync(request);
        Check(result.Kind == ReservationBookingResultKind.Success && Json(result).GetProperty("RequiresEmailConfirmation").GetBoolean(), "First booking must require confirmation");
        var saved = await restaurant.Db.Reservations.Include(x => x.Tables).SingleAsync();
        var token = restaurant.Notices.Tokens.Single();
        Check(saved.GuestName == "Guest" && saved.Phone == "+359 888 123 456" && saved.Tables.Single().TableCode == "1", "Booking normalization changed");
        Check(saved.Status == "AwaitingEmailConfirmation" && !saved.CreatedByAdmin && saved.InternalNote == null, "Public booking gained internal/admin fields");
        Check(saved.EmailConfirmationTokenHash == Hash(token) && saved.EmailConfirmationExpiresAtUtc == restaurant.Clock.Now.UtcDateTime.AddDays(2), "Confirmation token must be hashed with bounded expiry");
        Check(!await restaurant.Db.CustomerProfiles.AnyAsync() && restaurant.Notices.Confirmed == 0, "Unconfirmed booking must not update CRM or notify staff");
        restaurant.Db.BlacklistEntries.Add(new() { Email = request.Email });
        await restaurant.Db.SaveChangesAsync();
        result = await restaurant.Booking.ConfirmByEmailAsync(token);
        Check(result.Kind == ReservationBookingResultKind.Success && saved.Status == "Approved" && saved.IsBlacklisted, "Confirmation must approve and apply blacklist flag");
        Check(saved.EmailConfirmationTokenHash == null && saved.EmailConfirmationExpiresAtUtc == null && saved.EmailConfirmedAtUtc == restaurant.Clock.Now.UtcDateTime, "Confirmation must consume token");
        Check((await restaurant.Db.CustomerProfiles.SingleAsync()).ReservationCount == 1 && restaurant.Notices.Confirmed == 1, "Confirmation must update CRM and notify staff once");
        Check((await restaurant.Booking.ConfirmByEmailAsync(token)).Kind == ReservationBookingResultKind.NotFound, "Consumed token must not repeat confirmation side effects");
        Check((await restaurant.Db.CustomerProfiles.SingleAsync()).ReservationCount == 1 && restaurant.Notices.Confirmed == 1, "Token retry duplicated CRM or notifications");
        var returning = Request();
        returning.ReservedDate = returning.ReservedDate.AddDays(1);
        result = await restaurant.Booking.CreateAsync(returning);
        Check(result.Kind == ReservationBookingResultKind.Success && Json(result).GetProperty("IsReturningCustomer").GetBoolean(), "Returning customer behavior changed");
        Check((await restaurant.Db.CustomerProfiles.SingleAsync()).ReservationCount == 2 && restaurant.Notices.Confirmed == 2, "Returning booking must update CRM and notify staff");
        var conflict = await restaurant.Booking.CreateAsync(Request("different@example.test"));
        Check(conflict.Kind == ReservationBookingResultKind.Conflict && await restaurant.Db.Reservations.CountAsync() == 2, "Occupied table must reject without writes");
        Console.WriteLine("PASS: shared booking normalization, confirmation tokens, CRM, blacklist, returning guests, conflict checks and consumed-token protection.");

        await using var expired = await Restaurant.CreateAsync("expired");
        await expired.Booking.CreateAsync(Request());
        expired.Clock.Now = expired.Clock.Now.AddDays(3);
        Check((await expired.Booking.ConfirmByEmailAsync(expired.Notices.Tokens.Single())).Kind == ReservationBookingResultKind.Invalid, "Expired link must fail");
        Check(!await expired.Db.CustomerProfiles.AnyAsync() && expired.Notices.Confirmed == 0, "Expired link changed CRM or sent staff notices");
        var pending = await expired.Db.Reservations.SingleAsync();
        pending.Status = "Cancelled";
        await expired.Db.SaveChangesAsync();
        Check((await expired.Booking.ConfirmByEmailAsync(expired.Notices.Tokens.Single())).Kind == ReservationBookingResultKind.Invalid, "Cancelled booking must not be confirmed");
        Console.WriteLine("PASS: expired and cancelled confirmation links preserve booking state.");
    }

    private static async Task AutomaticConfirmationAsync()
    {
        static void SilentAutomatic(TenantDefinition tenant)
        {
            tenant.ReservationConfirmationMode = ReservationConfirmationMode.Automatic;
            tenant.NotificationsEnabled = false;
        }
        await using var cofein = await Restaurant.CreateAsync("cofein", SilentAutomatic);
        var result = await cofein.Booking.CreateAsync(Request());
        var saved = await cofein.Db.Reservations.Include(x => x.Tables).SingleAsync();
        Check(result.Kind == ReservationBookingResultKind.Success && !Json(result).GetProperty("RequiresEmailConfirmation").GetBoolean(), "Automatic first booking must not require an email step");
        Check(saved.Status == "Approved" && saved.Tables.Single().TableCode == "1", "Automatic booking must immediately occupy its selected table");
        Check(saved.EmailConfirmationTokenHash == null && saved.EmailConfirmationExpiresAtUtc == null && saved.EmailConfirmedAtUtc == null, "Automatic approval must not generate a token or claim email verification");
        Check(!Json(result).GetProperty("IsReturningCustomer").GetBoolean() && (await cofein.Db.CustomerProfiles.SingleAsync()).ReservationCount == 1, "New automatic guest must update CRM without being called a returning guest");
        Check(cofein.Notices.Confirmed == 0 && cofein.Notices.Tokens.Count == 0, "Silent tenant must not invoke booking notification callbacks");
        var overlap = Request("other@example.test"); overlap.Phone = "another-phone";
        Check((await cofein.Booking.CreateAsync(overlap)).Kind == ReservationBookingResultKind.Conflict && await cofein.Db.Reservations.CountAsync() == 1, "Automatic booking must block the next conflicting request immediately");
        var badTime = Request(); badTime.ReservedTime = "22:00";
        Check((await cofein.Booking.CreateAsync(badTime)).Kind == ReservationBookingResultKind.Invalid, "Automatic mode must preserve normal public time rules");
        var overCapacity = Request(); overCapacity.TableIds = ["2"]; overCapacity.GuestCount = 9;
        Check((await cofein.Booking.CreateAsync(overCapacity)).Kind == ReservationBookingResultKind.Invalid, "Automatic mode must preserve guest limits");

        await using var atomic = await Restaurant.CreateAsync("cofein-atomic", SilentAutomatic);
        await atomic.Db.Database.ExecuteSqlRawAsync("CREATE TRIGGER fail_customer_insert BEFORE INSERT ON CustomerProfiles BEGIN SELECT RAISE(ABORT, 'simulated CRM failure'); END;");
        try { await atomic.Booking.CreateAsync(Request()); throw new Exception("Automatic persistence failure was ignored"); }
        catch (DbUpdateException) { }
        Check(!await atomic.Db.Reservations.AsNoTracking().AnyAsync() && !await atomic.Db.ReservationTables.AnyAsync() && !await atomic.Db.CustomerProfiles.AnyAsync(), "Automatic booking, table occupancy and CRM must roll back together");
        Check(atomic.Notices.Confirmed == 0 && atomic.Notices.Tokens.Count == 0, "Failed automatic booking must never notify");
        Console.WriteLine("PASS: Cofein automatic approval immediately occupies tables, retains rules and atomic writes, does not claim verified email and sends no notifications.");
    }

    private static async Task RulesAsync()
    {
        await using var restaurant = await Restaurant.CreateAsync("rules");
        var invalidCases = new Action<CreateReservationRequest>[]
        {
            r => r.GuestName = " ", r => r.Phone = "", r => r.Email = "", r => r.GuestCount = 0,
            r => r.TableIds = [], r => r.PrivacyConsent = false,
            r => r.ReservedDate = new(2026, 11, 2), r => r.ReservedTime = "22:00",
            r => { r.ReservedDate = new(2026, 11, 3); r.ReservedTime = "12:05"; },
            r => r.ReservedDate = new(2026, 12, 1), r => r.GuestCount = 9,
            r => r.TableIds = ["1", "2"], r => r.GuestCount = 5
        };
        foreach (var change in invalidCases)
        {
            var request = Request(); change(request);
            Check((await restaurant.Booking.CreateAsync(request)).Kind == ReservationBookingResultKind.Invalid, "Public validation changed");
        }
        Check(!await restaurant.Db.Reservations.AnyAsync() && restaurant.Notices.Tokens.Count == 0, "Invalid requests must not persist or notify");
        var largeGroup = Request(); largeGroup.GuestCount = 9;
        Check(Json(await restaurant.Booking.CreateAsync(largeGroup)).GetString()!.Contains("+359-restaurant-rules"), "Validation must use selected restaurant contact, not Casa phone");
        var forged = Request(); forged.CreatedByAdmin = true;
        Check((await restaurant.Booking.CreateAsync(forged)).Kind == ReservationBookingResultKind.Unauthorized, "Admin flag alone must not grant admin permissions");
        var administrator = new AdminPrincipal(7, "Owner", "owner@example.test", "Owner");
        forged.Email = ""; forged.PrivacyConsent = false; forged.GuestCount = 12; forged.TableIds = ["1", "2"]; forged.InternalNote = "Staff only";
        var adminResult = await restaurant.Booking.CreateAsync(forged, administrator);
        Check(adminResult.Kind == ReservationBookingResultKind.Success, "Authenticated admin booking behavior changed");
        var saved = await restaurant.Db.Reservations.SingleAsync();
        Check(saved.CreatedByAdminUserId == 7 && saved.CreatedByAdminName == "Owner" && saved.InternalNote == "Staff only" && saved.Status == "Approved", "Admin attribution must come from authenticated principal");
        Check(restaurant.Notices.Confirmed == 0 && restaurant.Notices.Tokens.Count == 0, "Manual admin booking must not send new public booking notices");
        Console.WriteLine("PASS: validation, lead time, booking window, group limits, tenant contact and trusted admin attribution.");

        await using var closed = await Restaurant.CreateAsync("closed");
        await closed.Closures.SaveAsync(new(true, new(2026, 11, 4), new(2026, 11, 5), "Closed"));
        Check((await closed.Booking.CreateAsync(Request())).Kind == ReservationBookingResultKind.Conflict && !await closed.Db.Reservations.AnyAsync(), "Restaurant closure must reject bookings");
        await closed.Closures.SaveAsync(new(false, new(2026, 11, 4), new(2026, 11, 5), "Open"));
        await closed.Zones.SetClosedAsync("garden", true);
        var stale = Request(); stale.TableIds = ["30"]; stale.Area = "indoor";
        Check((await closed.Booking.CreateAsync(stale)).Kind == ReservationBookingResultKind.Conflict, "False Area must not bypass actual table zone closure");
        closed.Db.PublicTableHolds.Add(new() { ReservedDate = Request().ReservedDate, TableIdsJson = "[\"1\"]" });
        await closed.Db.SaveChangesAsync();
        Check((await closed.Booking.CreateAsync(Request())).Kind == ReservationBookingResultKind.Conflict && !await closed.Db.Reservations.AnyAsync(), "Held table must reject without creating a booking");
        Console.WriteLine("PASS: shared booking respects restaurant closures, actual table zones and public table holds.");

        await using var limited = await Restaurant.CreateAsync("limited");
        limited.Db.Reservations.AddRange(
            new Reservation { GuestName = "Previous", Phone = "+359888123456", Email = "other@example.test", Area = "indoor", ReservedDate = Request().ReservedDate, ReservedTime = "14:00", Status = "Approved", EmailConfirmedAtUtc = limited.Clock.Now.UtcDateTime },
            new Reservation { GuestName = "Previous", Phone = "different", Email = "GUEST@EXAMPLE.TEST", Area = "indoor", ReservedDate = Request().ReservedDate, ReservedTime = "16:00", Status = "Released" });
        await limited.Db.SaveChangesAsync();
        Check((await limited.Booking.CreateAsync(Request())).Kind == ReservationBookingResultKind.Success, "Released booking must not consume the contact limit");
        var overLimit = Request(); overLimit.TableIds = ["2"];
        Check((await limited.Booking.CreateAsync(overLimit)).Kind == ReservationBookingResultKind.RateLimited && await limited.Db.Reservations.CountAsync() == 3, "Daily contact limit must count normalized active contacts only");
        Console.WriteLine("PASS: contact daily limit preserves normalization, status filtering and no-write rejection.");
    }

    private static async Task FailureAndAtomicityAsync()
    {
        await using var failure = await Restaurant.CreateAsync("failure");
        failure.Notices.ThrowOnSend = true;
        Check((await failure.Booking.CreateAsync(Request())).Kind == ReservationBookingResultKind.Success && await failure.Db.Reservations.CountAsync() == 1, "Delivery failure must not turn a persisted booking into failure");
        Console.WriteLine("PASS: notification failure preserves successful persisted booking response.");

        await using var awaited = await Restaurant.CreateAsync("awaited");
        awaited.Notices.SendGate = new(TaskCreationOptions.RunContinuationsAsynchronously);
        var pending = awaited.Booking.CreateAsync(Request());
        await awaited.Notices.SendStarted.Task.WaitAsync(TimeSpan.FromSeconds(5));
        Check(!pending.IsCompleted && await awaited.Db.Reservations.CountAsync() == 1, "Confirmation delivery must be awaited after persistence, inside the request scope");
        awaited.Notices.SendGate.SetResult(true);
        Check((await pending).Kind == ReservationBookingResultKind.Success, "Awaited delivery did not finish booking");
        Console.WriteLine("PASS: confirmation delivery is awaited after commit instead of using a disposed request scope.");

        await using var atomic = await Restaurant.CreateAsync("atomic");
        atomic.Db.Reservations.Add(new() { GuestName = "Returning", Phone = "old", Email = Request().Email, Area = "indoor", ReservedDate = new(2026, 11, 1), ReservedTime = "19:00", Status = "Approved", EmailConfirmedAtUtc = atomic.Clock.Now.UtcDateTime });
        await atomic.Db.SaveChangesAsync();
        await atomic.Db.Database.ExecuteSqlRawAsync("CREATE TRIGGER fail_customer_insert BEFORE INSERT ON CustomerProfiles BEGIN SELECT RAISE(ABORT, 'simulated CRM failure'); END;");
        try { await atomic.Booking.CreateAsync(Request()); throw new Exception("Simulated persistence failure was ignored"); }
        catch (DbUpdateException) { }
        Check(await atomic.Db.Reservations.AsNoTracking().CountAsync() == 1 && !await atomic.Db.ReservationTables.AnyAsync() && !await atomic.Db.CustomerProfiles.AnyAsync(), "CRM failure left a partially saved booking");
        Check(atomic.Notices.Confirmed == 0 && atomic.Notices.Tokens.Count == 0, "Persistence failure sent notifications");
        Console.WriteLine("PASS: booking, table assignments and CRM changes roll back together on database failure.");
    }

    private static async Task ConfirmationTemplateAsync()
    {
        await using var restaurant = await Restaurant.CreateAsync("template");
        var current = new CurrentTenant(); current.Resolve(restaurant.Tenant);
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Tenancy:Email:template:RESEND_API_KEY"] = "local-test-key",
            ["Tenancy:Email:template:FROM_EMAIL"] = "Template <booking@template.example.test>"
        }).Build();
        var brand = new TenantBrandingService(restaurant.Db, current, config, NullLogger<TenantBrandingService>.Instance);
        var capture = new CaptureEmailHandler();
        var email = new EmailService(new HttpClient(capture), config, NullLogger<EmailService>.Instance, brand);
        var notifications = new ReservationBookingNotifications(email, null!, brand, current, config);
        await notifications.SendConfirmationAsync(new Reservation { GuestName = "Guest <Test>", Email = "guest@example.test", ReservedDate = Request().ReservedDate, ReservedTime = "19:00" }, "local-test-token");
        var message = capture.Messages.Single();
        var html = message.GetProperty("html").GetString()!;
        Check(message.GetProperty("from").GetString() == "Template <booking@template.example.test>" && message.GetProperty("subject").GetString()!.Contains("template"), "Shared confirmation must use the selected restaurant sender and brand");
        Check(html.Contains("https://template.example.test/reservation-confirm?token=local-test-token") && html.Contains("Guest &lt;Test&gt;"), "Shared confirmation must preserve restaurant links and guest escaping");
        Console.WriteLine("PASS: extracted confirmation template preserves tenant sender, brand, website link and HTML escaping; no real email sent.");
    }

    private static async Task HttpAdaptersAsync()
    {
        await using var alpha = await Restaurant.CreateAsync("alpha");
        await using var beta = await Restaurant.CreateAsync("beta");
        var restaurants = new Dictionary<string, Restaurant> { ["alpha"] = alpha, ["beta"] = beta };
        var options = new TenantResolutionOptions { RequireKnownTenant = true, DefaultTenant = alpha.Tenant, Tenants = [alpha.Tenant, beta.Tenant] };
        var builder = WebApplication.CreateBuilder();
        builder.Logging.ClearProviders();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Services.AddSingleton<IOptions<TenantResolutionOptions>>(Options.Create(options));
        builder.Services.AddSingleton<TimeProvider>(alpha.Clock);
        builder.Services.AddScoped<CurrentTenant>();
        builder.Services.AddScoped<ICurrentTenant>(p => p.GetRequiredService<CurrentTenant>());
        builder.Services.AddScoped(p => new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(restaurants[p.GetRequiredService<CurrentTenant>().TenantId].Connection).Options));
        builder.Services.AddScoped<TenantBrandingService>();
        builder.Services.AddScoped<ReservationConflictService>();
        builder.Services.AddScoped<RestaurantClosureService>();
        builder.Services.AddScoped<FloorPlanService>();
        builder.Services.AddScoped<SeasonalZoneService>();
        builder.Services.AddScoped<ReservationBookingService>();
        builder.Services.AddScoped<AdminAuthService>();
        builder.Services.AddScoped<AuditService>();
        builder.Services.AddScoped<ProductTierService>();
        builder.Services.AddScoped<IReservationBookingNotifications>(p => restaurants[p.GetRequiredService<CurrentTenant>().TenantId].Notices);
        builder.Services.AddHttpClient<EmailService>().ConfigurePrimaryHttpMessageHandler(() => new NeverSendHandler());
        builder.Services.AddControllers().AddApplicationPart(typeof(ReservationsController).Assembly);
        await using var app = builder.Build();
        app.UseRouting();
        app.UseMiddleware<TenantResolutionMiddleware>();
        app.MapControllers();
        await app.StartAsync();
        try
        {
            using var client = new HttpClient { BaseAddress = new Uri(app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single()) };
            using var legacy = new HttpRequestMessage(HttpMethod.Post, "/api/reservations") { Content = JsonContent.Create(Request()) };
            legacy.Headers.Add("X-Tenant-Id", "alpha");
            var legacyResponse = await client.SendAsync(legacy);
            var mobileResponse = await client.PostAsJsonAsync("/api/v1/restaurants/beta/reservations", Request());
            var oldJson = await legacyResponse.Content.ReadAsStringAsync();
            var newJson = await mobileResponse.Content.ReadAsStringAsync();
            Check(legacyResponse.IsSuccessStatusCode && mobileResponse.IsSuccessStatusCode, $"Both booking adapters must work: {oldJson} / {newJson}");
            Check(JsonNode.DeepEquals(JsonNode.Parse(oldJson), JsonNode.Parse(newJson)), "Legacy and v1 booking responses diverged");
            Check(await alpha.Db.Reservations.CountAsync() == 1 && await beta.Db.Reservations.CountAsync() == 1, "Booking crossed restaurant database boundary");
            Check((await client.GetAsync($"/api/v1/restaurants/beta/reservations/confirm?token={alpha.Notices.Tokens.Single()}")).StatusCode == HttpStatusCode.NotFound, "Confirmation token crossed restaurant boundary");
            Check((await client.GetAsync($"/api/v1/restaurants/beta/reservations/confirm?token={beta.Notices.Tokens.Single()}")).IsSuccessStatusCode, "Versioned confirmation failed");
            using var legacyConfirm = new HttpRequestMessage(HttpMethod.Get, $"/api/reservations/confirm?token={alpha.Notices.Tokens.Single()}");
            legacyConfirm.Headers.Add("X-Tenant-Id", "alpha");
            Check((await client.SendAsync(legacyConfirm)).IsSuccessStatusCode, "Legacy confirmation failed");
            foreach (var (legacyPath, resource) in new[] { ("/api/reservations/blocked-slots", "reservations/blocked-slots"), ("/api/restaurant-closure", "closure") })
            {
                using var legacyRead = new HttpRequestMessage(HttpMethod.Get, legacyPath);
                legacyRead.Headers.Add("X-Tenant-Id", "beta");
                var legacyReadResponse = await client.SendAsync(legacyRead);
                var versionedReadResponse = await client.GetAsync($"/api/v1/restaurants/beta/{resource}");
                Check(legacyReadResponse.IsSuccessStatusCode && versionedReadResponse.IsSuccessStatusCode, $"Both {resource} read adapters must execute successfully");
                Check(JsonNode.DeepEquals(JsonNode.Parse(await legacyReadResponse.Content.ReadAsStringAsync()), JsonNode.Parse(await versionedReadResponse.Content.ReadAsStringAsync())), $"{resource} alias must preserve actual API response shape and data");
            }
            var forged = Request("forged@example.test"); forged.CreatedByAdmin = true; forged.InternalNote = "Admin secret"; forged.TableIds = ["2"]; forged.PrivacyConsent = false;
            Check((await client.PostAsJsonAsync("/api/v1/restaurants/beta/reservations", forged)).StatusCode == HttpStatusCode.BadRequest, "Public v1 caller bypassed consent with admin flag");
            forged.PrivacyConsent = true;
            Check((await client.PostAsJsonAsync("/api/v1/restaurants/beta/reservations", forged)).IsSuccessStatusCode, "Public v1 booking should accept public fields while ignoring forged admin fields");
            var forgedSaved = await beta.Db.Reservations.AsNoTracking().SingleAsync(x => x.Email == forged.Email);
            Check(!forgedSaved.CreatedByAdmin && forgedSaved.InternalNote == null && forgedSaved.Status == "AwaitingEmailConfirmation", "Public v1 caller gained admin fields or auto-approval");
            using var forgedLegacy = new HttpRequestMessage(HttpMethod.Post, "/api/reservations") { Content = JsonContent.Create(forged) };
            forgedLegacy.Headers.Add("X-Tenant-Id", "alpha");
            Check((await client.SendAsync(forgedLegacy)).StatusCode == HttpStatusCode.Unauthorized, "Legacy admin creation must still authenticate");
            Check(await alpha.Db.Reservations.CountAsync() == 1 && await beta.Db.Reservations.CountAsync() == 2, "Rejected HTTP requests changed bookings");
            var conflict = await client.PostAsJsonAsync("/api/v1/restaurants/beta/reservations", Request("conflict@example.test"));
            Check(conflict.StatusCode == HttpStatusCode.Conflict, "Versioned booking must share occupied-table rules");
            Check((await client.PostAsJsonAsync("/api/v1/restaurants/unknown/reservations", Request())).StatusCode == HttpStatusCode.NotFound, "Unknown restaurant must fail before booking service");
        }
        finally { await app.StopAsync(); }
        Console.WriteLine("PASS: real legacy/v1 HTTP booking and confirmation share responses and rules, isolate databases, and reject forged admin fields.");
    }

    private sealed class FixedClock : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = new(2026, 11, 3, 10, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
    }
    private sealed class Notices : IReservationBookingNotifications
    {
        public List<string> Tokens { get; } = [];
        public int Confirmed { get; private set; }
        public bool ThrowOnSend { get; set; }
        public TaskCompletionSource<bool>? SendGate { get; set; }
        public TaskCompletionSource<bool> SendStarted { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public async Task SendConfirmationAsync(Reservation reservation, string token)
        {
            if (ThrowOnSend) throw new HttpRequestException("Simulated transport failure");
            Tokens.Add(token);
            SendStarted.TrySetResult(true);
            if (SendGate != null) await SendGate.Task;
        }
        public Task NotifyConfirmedAsync(Reservation reservation)
        {
            if (ThrowOnSend) throw new HttpRequestException("Simulated transport failure");
            Confirmed++; return Task.CompletedTask;
        }
    }
    private sealed class NeverSendHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            throw new Exception("Booking checks must never send email over the network");
    }
    private sealed class Restaurant : IAsyncDisposable
    {
        public SqliteConnection Connection { get; } = new("Data Source=:memory:");
        public AppDbContext Db { get; private set; } = null!;
        public TenantDefinition Tenant { get; private set; } = null!;
        public FixedClock Clock { get; } = new();
        public Notices Notices { get; } = new();
        public RestaurantClosureService Closures { get; private set; } = null!;
        public SeasonalZoneService Zones { get; private set; } = null!;
        public ReservationBookingService Booking { get; private set; } = null!;
        public static async Task<Restaurant> CreateAsync(string id, Action<TenantDefinition>? configure = null)
        {
            var restaurant = new Restaurant();
            await restaurant.Connection.OpenAsync();
            restaurant.Db = new(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(restaurant.Connection).Options);
            await restaurant.Db.Database.EnsureCreatedAsync();
            restaurant.Tenant = new() { Id = id, Name = id, Slug = id, FrontendUrl = $"https://{id}.example.test", Domain = $"{id}.example.test", FrontendOrigins = [$"https://{id}.example.test"] };
            configure?.Invoke(restaurant.Tenant);
            var current = new CurrentTenant(); current.Resolve(restaurant.Tenant);
            var brand = new TenantBrandingService(restaurant.Db, current, new ConfigurationBuilder().Build(), NullLogger<TenantBrandingService>.Instance);
            await brand.SaveAsync(new() { Name = id, Phone = $"+359-restaurant-{id}" });
            restaurant.Closures = new(restaurant.Db, current);
            var plans = new FloorPlanService(restaurant.Db, current);
            var initial = await plans.GetAsync();
            await plans.SaveAsync(initial with {
                Zones = [new("indoor", "Hall"), new("garden", "Garden")],
                Tables = [new("1", "indoor", 20, 20, 4, false, false, true), new("2", "indoor", 50, 20, 8, false, false, true), new("30", "garden", 20, 20, 4, false, false, true)],
                Combinations = [["1", "2"]]
            });
            restaurant.Zones = new(restaurant.Db, plans);
            restaurant.Booking = new(restaurant.Db, new(restaurant.Db), restaurant.Closures, restaurant.Zones, brand, restaurant.Notices, restaurant.Clock, NullLogger<ReservationBookingService>.Instance);
            return restaurant;
        }
        public async ValueTask DisposeAsync() { await Db.DisposeAsync(); await Connection.DisposeAsync(); }
    }
}
