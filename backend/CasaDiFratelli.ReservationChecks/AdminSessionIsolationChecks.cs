using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using System.Text.Json;
using SeatMap.Api.Controllers;
using SeatMap.Api.Data;
using SeatMap.Api.Filters;
using SeatMap.Api.Models;
using SeatMap.Api.Services;
using SeatMap.Api.Services.Tenancy;

internal static class AdminSessionIsolationChecks
{
    private static void Check(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }

    public static async Task RunAsync()
    {
        await using var casaConnection = new SqliteConnection("Data Source=:memory:");
        await using var cofeinConnection = new SqliteConnection("Data Source=:memory:");
        await casaConnection.OpenAsync();
        await cofeinConnection.OpenAsync();
        await using var casaDb = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(casaConnection).Options);
        await using var cofeinDb = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(cofeinConnection).Options);
        await casaDb.Database.EnsureCreatedAsync();
        await cofeinDb.Database.EnsureCreatedAsync();

        var casa = new TenantDefinition { Id = "casa-di-fratelli", Name = "Casa di Fratelli", Slug = "casa-di-fratelli", Domain = "casa.example.test" };
        var cofein = new TenantDefinition { Id = "cofein", Name = "Cofein", Slug = "cofein", Domain = "cofein.example.test" };
        var options = Options.Create(new TenantResolutionOptions { RequireKnownTenant = true, DefaultTenant = casa, Tenants = [casa, cofein] });

        var unresolved = new CurrentTenant();
        var unresolvedController = new AdminAuthController(null!, null!, null!, null!, null!, null!, unresolved, null!);
        Check(unresolvedController.GetContext() is NotFoundObjectResult, "Admin context must not fall back to Casa when no tenant is resolved");
        cofein.IsListed = false;
        cofein.FrontendUrl = "https://cofein.example.test";
        cofein.NotificationsEnabled = false;
        var currentCofein = new CurrentTenant(); currentCofein.Resolve(cofein);
        var contextController = new AdminAuthController(null!, null!, null!, null!, null!, null!, currentCofein, null!);
        var contextPayload = JsonSerializer.SerializeToElement(((OkObjectResult)contextController.GetContext()).Value);
        Check(contextPayload.EnumerateObject().Count() == 4 && contextPayload.GetProperty("tenantId").GetString() == cofein.Id &&
              contextPayload.GetProperty("name").GetString() == cofein.Name &&
              contextPayload.GetProperty("frontendUrl").GetString() == cofein.FrontendUrl &&
              !contextPayload.GetProperty("notificationsEnabled").GetBoolean(),
            "Unlisted restaurant login context must expose only resolved public identity and notification policy without DB/auth dependencies");

        // Numeric IDs and owner emails may legitimately coincide across separate restaurant databases.
        // A matching ID/email must never turn a session for one restaurant into access to another.
        async Task SeedAsync(AppDbContext db, string name, string token)
        {
            db.AdminUsers.Add(new AdminUser { Id = 1, Email = "owner@example.test", Name = name, Role = AdminRoleAccess.Owner });
            db.AdminSessions.Add(new AdminSession { AdminUserId = 1, TokenHash = AdminAuthService.HashToken(token), ExpiresAtUtc = DateTime.UtcNow.AddHours(1) });
            await db.SaveChangesAsync();
        }
        await SeedAsync(casaDb, "Casa owner", "casa-session-fixture");
        await SeedAsync(cofeinDb, "Cofein owner", "cofein-session-fixture");

        async Task<(int Status, string? Name)> RequestAsync(string tenantId, string token, bool bearer = false)
        {
            var http = new DefaultHttpContext();
            http.Request.Host = new HostString("api.example.test");
            http.Request.Headers.Origin = "https://admin.example.test";
            http.Request.Headers["X-Tenant-Id"] = tenantId;
            http.Request.Headers[bearer ? "Authorization" : "X-Admin-Token"] = bearer ? $"Bearer {token}" : token;
            http.Response.Body = new MemoryStream();
            var current = new CurrentTenant();
            var invoked = false;
            async Task AuthorizeAsync(HttpContext context)
            {
                var db = current.TenantId == casa.Id ? casaDb : cofeinDb;
                var auth = new AdminAuthService(db, new ConfigurationBuilder().Build(), current, options);
                using var services = new ServiceCollection().AddSingleton(auth).BuildServiceProvider();
                context.RequestServices = services;
                var action = new ActionContext(context, new RouteData(), new ActionDescriptor());
                var executing = new ActionExecutingContext(action, [], new Dictionary<string, object?>(), new object());
                Task<ActionExecutedContext> ExecuteActionAsync()
                {
                    invoked = true;
                    return Task.FromResult(new ActionExecutedContext(action, [], new object()));
                }
                await new AdminAuthorizeAttribute(AdminRoleAccess.Owner).OnActionExecutionAsync(executing, ExecuteActionAsync);
                if (executing.Result is ObjectResult result) context.Response.StatusCode = result.StatusCode ?? 200;
                else if (executing.Result is StatusCodeResult status) context.Response.StatusCode = status.StatusCode;
            }
            var middleware = new TenantResolutionMiddleware(AuthorizeAsync, options);
            await middleware.InvokeAsync(http, current);
            if (!invoked) Check(AdminAuthService.Current(http) == null, "Rejected session must not populate an admin principal");
            return (http.Response.StatusCode, AdminAuthService.Current(http)?.Name);
        }

        Check(await RequestAsync(casa.Id, "casa-session-fixture") == (200, "Casa owner"), "Casa session must retain access to Casa");
        Check(await RequestAsync(cofein.Id, "cofein-session-fixture", bearer: true) == (200, "Cofein owner"), "Cofein bearer session must retain access to Cofein");
        Check((await RequestAsync(cofein.Id, "casa-session-fixture")).Status == 401, "Casa session must not authenticate in Cofein despite matching owner email/ID");
        Check((await RequestAsync(casa.Id, "cofein-session-fixture", bearer: true)).Status == 401, "Cofein bearer session must not authenticate in Casa despite matching owner email/ID");
        Check((await RequestAsync("unknown", "casa-session-fixture")).Status == 404, "Unknown tenant must fail before authenticated action execution");

        var session = await cofeinDb.AdminSessions.SingleAsync();
        session.RevokedAtUtc = DateTime.UtcNow;
        await cofeinDb.SaveChangesAsync();
        Check((await RequestAsync(cofein.Id, "cofein-session-fixture")).Status == 401, "Revoked stored sessions must fail the shared admin authorization filter");
        Check(await RequestAsync(casa.Id, "casa-session-fixture") == (200, "Casa owner"), "Revoking Cofein access must not change Casa access");
        Check(await casaDb.AdminSessions.CountAsync() == 1 && await cofeinDb.AdminSessions.CountAsync() == 1,
            "Cross-tenant authorization attempts must not copy or create sessions");
        Console.WriteLine("PASS: common-origin tenant routing and real authorization filter preserve isolated sessions, overlapping owner IDs/emails, revocation and bearer/header compatibility.");
    }
}
