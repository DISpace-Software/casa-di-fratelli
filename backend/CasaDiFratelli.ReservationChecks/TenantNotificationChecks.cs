using System.Net;
using System.Text.Json;
using SeatMap.Api.Controllers;
using SeatMap.Api.Data;
using SeatMap.Api.Models;
using SeatMap.Api.Services;
using SeatMap.Api.Services.Reservations;
using SeatMap.Api.Services.Tenancy;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

internal static class TenantNotificationChecks
{
    private static void Check(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }

    public static async Task RunAsync()
    {
        var tenant = new TenantDefinition
        {
            Id = "cofein", Name = "Cofein", Slug = "cofein", Domain = "cofein.example.test",
            FrontendUrl = "https://cofein.example.test",
            ReservationConfirmationMode = ReservationConfirmationMode.Automatic,
            NotificationsEnabled = false
        };
        var defaults = new TenantDefinition();
        Check(defaults.NotificationsEnabled && defaults.ReservationConfirmationMode == ReservationConfirmationMode.EmailForFirstVisit,
            "Existing restaurant defaults must retain first-visit email confirmation and notifications");
        var options = new TenantResolutionOptions { DefaultTenant = tenant, Tenants = [tenant] };
        var validator = new TenantOptionsValidator();
        Check(validator.Validate(null, options).Succeeded, "Silent automatic configuration must be accepted");
        tenant.ReservationConfirmationMode = ReservationConfirmationMode.EmailForFirstVisit;
        Check(validator.Validate(null, options).Failed, "Disabling delivery while requiring email confirmation must fail configuration validation");
        tenant.ReservationConfirmationMode = (ReservationConfirmationMode)42;
        Check(validator.Validate(null, options).Failed, "Unknown confirmation modes must be rejected");
        tenant.ReservationConfirmationMode = ReservationConfirmationMode.Automatic;

        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Tenant:ReservationConfirmationMode"] = "Automatic",
            ["Tenant:NotificationsEnabled"] = "false",
            ["Tenancy:Email:cofein:RESEND_API_KEY"] = "fake-key-never-used",
            ["Tenancy:Email:cofein:FROM_EMAIL"] = "Cofein <booking@example.test>",
            ["Tenancy:Email:cofein:MARKETING_FROM_EMAIL"] = "Cofein <offers@example.test>"
        }).Build();
        var bound = new TenantDefinition(); config.GetSection("Tenant").Bind(bound);
        Check(bound.ReservationConfirmationMode == ReservationConfirmationMode.Automatic && !bound.NotificationsEnabled,
            "Deployment configuration must bind the named automatic mode and notification switch");

        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync();
        var current = new CurrentTenant(); current.Resolve(tenant);
        var brand = new TenantBrandingService(db, current, config, NullLogger<TenantBrandingService>.Instance);
        Check(!brand.NotificationsEnabled && brand.ReservationConfirmationMode == ReservationConfirmationMode.Automatic,
            "Resolved policy must belong to the current restaurant");
        using var capture = new CaptureTransport();
        using var http = new HttpClient(capture);
        var email = new EmailService(http, config, NullLogger<EmailService>.Instance, brand);
        await email.SendAsync("guest@example.test", "Booking/admin/password notice", "<p>Test</p>");
        await email.SendMarketingAsync("guest@example.test", "Marketing", "<p>Test</p>");
        Check(!await email.TrySendTransactionalAsync("guest@example.test", "Feedback", "Test", "test-transactional"),
            "Suppressed transactional message must not report delivery");
        Check(!await email.TrySendMarketingAsync("guest@example.test", "Birthday", "Test", "test-marketing"),
            "Suppressed marketing message must not report delivery");
        Check(capture.Calls == 0, "Every email entry point must stop before making an HTTP request, even with configured credentials");

        var reservation = new Reservation { Id = 17, GuestName = "Guest", Email = "guest@example.test", Phone = "123", GuestCount = 2 };
        var push = new PushNotificationService(db, config, NullLogger<PushNotificationService>.Instance, brand);
        await push.NotifyNewReservationAsync(reservation);
        Check(!await db.AppSettings.AnyAsync(), "Disabled push must not generate keys, load branding or touch persistence");
        var notices = new ReservationBookingNotifications(email, push, brand, current, config);
        await notices.NotifyConfirmedAsync(reservation);
        await notices.SendConfirmationAsync(reservation, "unused-token");

        var feedback = new VisitFeedbackEmailService(db, email, brand);
        Check(await feedback.QueueAsync(reservation, tenant.FrontendUrl!) == null, "Disabled feedback must not create a queued notification");
        db.VisitFeedbackEmails.Add(new() { ReservationId = 17, DeduplicationKey = "existing-before-disable", Email = reservation.Email, NextAttemptAtUtc = DateTime.UtcNow.AddMinutes(-1) });
        await db.SaveChangesAsync();
        Check(await feedback.DispatchForReservationAsync(17) == "disabled", "Existing queued feedback must stop when notifications are disabled");
        await feedback.RetryPendingAsync();
        Check(!await feedback.SendTestAsync("guest@example.test", tenant.FrontendUrl!), "Even test feedback must respect the tenant switch");
        var queued = await db.VisitFeedbackEmails.AsNoTracking().SingleAsync();
        Check(queued.Attempts == 0 && queued.SentAtUtc == null && queued.LastError == null, "Disabled feedback must not claim delivery or repeatedly retry existing messages");

        var marketing = new MarketingCampaignService(db, email, brand);
        await marketing.RunAsync(false);
        await marketing.RunAsync(true);
        var birthday = await marketing.SendBirthdayAsync(42);
        Check(!birthday.Sent && !await db.MarketingMessageLogs.AnyAsync(), "Disabled marketing must not record birthday or campaign deliveries");
        Check(capture.Calls == 0 && !await db.AppSettings.AnyAsync(), "Disabled tenant workflows must remain free of notification transport and side effects");
        await CheckAdminPushAsync(db, brand, push, config);
        Console.WriteLine("PASS: tenant policy defaults/config validation; all email/push transports and feedback/marketing queues suppressed for Cofein without network requests.");
    }

    private static async Task CheckAdminPushAsync(AppDbContext db, TenantBrandingService brand,
        PushNotificationService push, IConfiguration config)
    {
        db.AdminUsers.Add(new AdminUser { Id = 1, Name = "Owner", Email = "owner@example.test", Role = AdminRoleAccess.Owner });
        await db.SaveChangesAsync();
        var context = new ControllerContext { HttpContext = new DefaultHttpContext() };
        context.HttpContext.Items["AdminUser"] = new AdminPrincipal(1, "Owner", "owner@example.test", AdminRoleAccess.Owner);
        var controller = new AdminPushController(db, push, new AuditService(db), brand) { ControllerContext = context };
        var result = (OkObjectResult)await controller.GetConfig();
        var payload = JsonSerializer.SerializeToElement(result.Value);
        Check(!payload.GetProperty("enabled").GetBoolean() && payload.GetProperty("publicKey").ValueKind == JsonValueKind.Null,
            "Disabled push configuration must explicitly tell the shared admin not to request browser permission");
        var request = new AdminPushSubscriptionRequest
        {
            Endpoint = "https://push.example.test/tenant-policy-test",
            Keys = new() { P256Dh = "test-public-key", Auth = "test-auth" }
        };
        Check(await controller.SaveSubscription(request) is ConflictObjectResult,
            "Disabled notifications must reject subscription creation");
        Check(!await db.AppSettings.AnyAsync() && !await db.AdminPushSubscriptions.AnyAsync() && !await db.AuditLogs.AnyAsync(),
            "Disabled admin push requests must not create keys, subscriptions or success audit entries");

        // A tenant that disabled notifications can still remove a previously registered device.
        db.AdminPushSubscriptions.Add(new AdminPushSubscription
        {
            AdminUserId = 1, Endpoint = request.Endpoint, P256Dh = request.Keys.P256Dh, Auth = request.Keys.Auth, IsActive = true
        });
        await db.SaveChangesAsync();
        Check(await controller.SaveSubscription(request) is ConflictObjectResult,
            "Disabled notifications must not refresh an existing subscription");
        Check(await controller.DeleteSubscription(new() { Endpoint = request.Endpoint }) is NoContentResult &&
              !(await db.AdminPushSubscriptions.SingleAsync()).IsActive,
            "Disabling notifications must not prevent unsubscribing an existing device");

        var casa = new CurrentTenant(); casa.Resolve(new TenantDefinition());
        var casaBrand = new TenantBrandingService(db, casa, config, NullLogger<TenantBrandingService>.Instance);
        var casaPush = new PushNotificationService(db, config, NullLogger<PushNotificationService>.Instance, casaBrand);
        var enabledController = new AdminPushController(db, casaPush, new AuditService(db), casaBrand) { ControllerContext = context };
        var enabledPayload = JsonSerializer.SerializeToElement(((OkObjectResult)await enabledController.GetConfig()).Value);
        Check(enabledPayload.GetProperty("enabled").GetBoolean() && !string.IsNullOrWhiteSpace(enabledPayload.GetProperty("publicKey").GetString()),
            "Casa must retain enabled push configuration and its existing publicKey contract");
        Check(await enabledController.SaveSubscription(request) is OkObjectResult && (await db.AdminPushSubscriptions.SingleAsync()).IsActive,
            "Casa must retain subscription creation/reactivation");
        Console.WriteLine("PASS: disabled push config/subscription side effects blocked; unsubscribe and Casa enabled push contract preserved.");
    }

    private sealed class CaptureTransport : HttpMessageHandler
    {
        public int Calls { get; private set; }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls++;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK));
        }
    }
}
