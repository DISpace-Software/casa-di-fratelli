using System.Reflection;
using System.Text.Json;
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
using SeatMap.Api.Controllers;
using SeatMap.Api.Data;
using SeatMap.Api.Filters;
using SeatMap.Api.Models;
using SeatMap.Api.Services;
using SeatMap.Api.Services.Tenancy;

internal static class AdminManagementChecks
{
    public static async Task RunAsync()
    {
        var count = 0;
        void Check(bool condition, string message)
        {
            count++;
            if (!condition) throw new Exception(message);
        }

        foreach (var actor in new string?[] { null, "", "unexpected-role" })
            Check(!AdminRoleAccess.CanManageAdmins(actor) &&
                !AdminRoleAccess.CanCreateRole(actor, "Administrator") &&
                !AdminRoleAccess.CanModifyRole(actor, "Administrator"),
                "Missing or unknown actors must never inherit manager permissions");
        foreach (var actor in new[] { "Administrator", "admin", "manager" })
            Check(AdminRoleAccess.CanManageAdmins(actor) && AdminRoleAccess.CanCreateRole(actor, "Waiter") &&
                !AdminRoleAccess.CanCreateRole(actor, "Owner") && !AdminRoleAccess.CanCreateRole(actor, "Developer", false) &&
                !AdminRoleAccess.CanModifyRole(actor, "Owner") && !AdminRoleAccess.CanModifyRole(actor, "Developer"),
                "All supported manager aliases must share the same staff-only permissions");

        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var optionsBuilder = new DbContextOptionsBuilder<AppDbContext>();
        var postgres = Environment.GetEnvironmentVariable("ADMIN_MANAGEMENT_CHECKS_POSTGRES");
        if (postgres == null) optionsBuilder.UseSqlite(connection); else optionsBuilder.UseNpgsql(postgres);
        await using var db = new AppDbContext(optionsBuilder.Options);
        await db.Database.EnsureCreatedAsync();
        var tenant = new CurrentTenant();
        var tenantDefinition = new TenantDefinition { Id = "management-checks", Slug = "management-checks", Name = "Management checks", NotificationsEnabled = false };
        tenant.Resolve(tenantDefinition);
        var config = new ConfigurationBuilder().Build();
        var tenancy = Options.Create(new TenantResolutionOptions { DefaultTenant = tenantDefinition });
        var users = new Dictionary<string, AdminUser>();
        var (hash, salt) = AdminAuthService.HashPassword("ManagementChecks!2026");
        foreach (var role in new[] { "Owner", "Administrator", "Manager", "Waiter", "Kitchen", "Bar", "unexpected-role" })
        {
            var user = new AdminUser { Name = role, Email = role.ToLowerInvariant() + "@checks.test", Role = role, PasswordHash = hash, PasswordSalt = salt };
            users.Add(role, user);
            db.AdminUsers.Add(user);
        }
        await db.SaveChangesAsync();
        foreach (var (role, user) in users)
            db.AdminSessions.Add(new AdminSession { AdminUserId = user.Id, TokenHash = AdminAuthService.HashToken(role), ExpiresAtUtc = DateTime.UtcNow.AddHours(1) });
        await new ProductTierService(db).UnlockProAsync();

        async Task<IActionResult> Invoke(string actionName, string? token, Func<AdminAuthController, Task<IActionResult>> action)
        {
            await using var requestDb = new AppDbContext(optionsBuilder.Options);
            var auth = new AdminAuthService(requestDb, config, tenant, tenancy);
            using var services = new ServiceCollection().AddSingleton(auth).BuildServiceProvider();
            var http = new DefaultHttpContext { RequestServices = services };
            if (token != null) http.Request.Headers["X-Admin-Token"] = token;
            var controller = new AdminAuthController(requestDb, auth, new AuditService(requestDb), null!, config,
                new ProductTierService(requestDb), tenant, null!) { ControllerContext = new ControllerContext { HttpContext = http } };
            var actionContext = new ActionContext(http, new RouteData(), new ActionDescriptor());
            var executing = new ActionExecutingContext(actionContext, [], new Dictionary<string, object?>(), controller);
            IActionResult? result = null;
            var attribute = typeof(AdminAuthController).GetMethod(actionName)!.GetCustomAttribute<AdminAuthorizeAttribute>()!;
            await attribute.OnActionExecutionAsync(executing, async () =>
            {
                result = await action(controller);
                return new ActionExecutedContext(actionContext, [], controller) { Result = result };
            });
            return executing.Result ?? result ?? throw new Exception("Controller did not return a response");
        }
        static int Status(IActionResult result) => result switch
        {
            ForbidResult => 403,
            StatusCodeResult code => code.StatusCode,
            ObjectResult value => value.StatusCode ?? 200,
            _ => 500
        };
        static JsonElement Payload(IActionResult result) => JsonSerializer.SerializeToElement(((ObjectResult)result).Value);
        Task<IActionResult> Create(string? token, string role, string email) => Invoke(nameof(AdminAuthController.CreateUser), token,
            c => c.CreateUser(new("Created staff", email, "NewStaffPassword!", role)));
        Task<IActionResult> Update(string? token, int id, string role, bool active = true) => Invoke(nameof(AdminAuthController.UpdateUser), token,
            c => c.UpdateUser(id, new("Updated staff", $"updated-{id}@checks.test", "UpdatedPassword!", role, active)));
        Task<IActionResult> Delete(string? token, int id) => Invoke(nameof(AdminAuthController.DeleteUser), token, c => c.DeleteUser(id));
        async Task<string> Snapshot()
        {
            await using var snapshotDb = new AppDbContext(optionsBuilder.Options);
            return JsonSerializer.Serialize(new
            {
                Users = await snapshotDb.AdminUsers.AsNoTracking().OrderBy(x => x.Id).ToListAsync(),
                Sessions = await snapshotDb.AdminSessions.AsNoTracking().OrderBy(x => x.Id).ToListAsync(),
                Devices = await snapshotDb.AdminDeviceCredentials.AsNoTracking().OrderBy(x => x.Id).ToListAsync(),
                AuditCount = await snapshotDb.AuditLogs.CountAsync()
            });
        }

        Check(Status(await Create("Administrator", "Developer", "manager-bootstrap@checks.test")) == 403,
            "Manager must not bootstrap a Developer even when none exists");
        var bootstrap = await Create("Owner", "Developer", "developer@checks.test");
        Check(Status(bootstrap) == 200, "Owner must retain permission to create the first Developer");
        var developerId = Payload(bootstrap).GetProperty("Id").GetInt32();
        db.AdminSessions.Add(new AdminSession { AdminUserId = developerId, TokenHash = AdminAuthService.HashToken("Developer"), ExpiresAtUtc = DateTime.UtcNow.AddHours(1) });
        await db.SaveChangesAsync();
        Check(Status(await Create("Owner", "Developer", "second-developer@checks.test")) == 403,
            "Owner must not create another Developer once one exists");

        foreach (var token in new string?[] { null, "Waiter", "Kitchen", "Bar", "unexpected-role" })
        {
            var expected = token == null || token == "unexpected-role" ? 401 : 403;
            var before = await Snapshot();
            Check(Status(await Invoke(nameof(AdminAuthController.Users), token, c => c.Users())) == expected &&
                Status(await Invoke(nameof(AdminAuthController.Audit), token, c => c.Audit())) == expected &&
                Status(await Create(token, "Administrator", "forbidden@checks.test")) == expected &&
                Status(await Update(token, users["Waiter"].Id, "Administrator")) == expected &&
                Status(await Delete(token, users["Waiter"].Id)) == expected,
                "Anonymous, invalid-role and operational staff sessions must not access staff management");
            Check(await Snapshot() == before, "Rejected management requests must not mutate users, sessions, devices or audit history");
        }
        foreach (var token in new[] { "Administrator", "Manager", "Owner", "Developer" })
        {
            var list = await Invoke(nameof(AdminAuthController.Users), token, c => c.Users());
            var json = Payload(list).GetRawText();
            Check(Status(list) == 200 && !json.Contains("Password") && !json.Contains("Token") && !json.Contains("Salt") &&
                Status(await Invoke(nameof(AdminAuthController.Audit), token, c => c.Audit())) == 200,
                "Managers, Owner and Developer must list users and audit without exposing authentication secrets");
        }

        foreach (var role in new[] { "Owner", "Developer", "owner", "dev", "programmer" })
        {
            var before = await Snapshot();
            Check(Status(await Create("Administrator", role, "privileged@checks.test")) == 403 &&
                Status(await Update("Administrator", users["Waiter"].Id, role, false)) == 403 &&
                Status(await Update("Administrator", users["Administrator"].Id, role)) == 403,
                "Manager must not create privileged roles or promote staff or self to privileged aliases");
            Check(await Snapshot() == before, "Rejected privilege changes must preserve all persisted state");
        }
        foreach (var id in new[] { users["Owner"].Id, developerId })
        {
            var before = await Snapshot();
            Check(Status(await Update("Administrator", id, "Administrator", false)) == 403 &&
                Status(await Delete("Administrator", id)) == 403,
                "Manager must not edit passwords, disable, demote or delete Owner and Developer accounts");
            Check(await Snapshot() == before, "Protected account operations must leave users and credentials untouched");
        }

        foreach (var role in new[] { "Administrator", "Waiter", "Kitchen", "Bar" })
        {
            var created = await Create("Manager", role, $"created-{role.ToLowerInvariant()}@checks.test");
            Check(Status(created) == 200 && Payload(created).GetProperty("Role").GetString() == role,
                "Recognized legacy Manager sessions must create every supported staff role");
            var id = Payload(created).GetProperty("Id").GetInt32();
            db.AdminSessions.Add(new AdminSession { AdminUserId = id, TokenHash = AdminAuthService.HashToken("temporary-" + id), ExpiresAtUtc = DateTime.UtcNow.AddHours(1) });
            db.AdminDeviceCredentials.Add(new AdminDeviceCredential { AdminUserId = id, Label = "fixture", CredentialHash = AdminAuthService.HashToken("device-" + id) });
            await db.SaveChangesAsync();
            Check(Status(await Update("Administrator", id, role, false)) == 200,
                "Manager must update staff details/passwords and deactivate staff");
            await using (var inspection = new AppDbContext(optionsBuilder.Options))
            {
                var updated = await inspection.AdminUsers.SingleAsync(x => x.Id == id);
                Check(updated.Name == "Updated staff" && !updated.IsActive &&
                    AdminAuthService.VerifyPassword("UpdatedPassword!", updated.PasswordHash, updated.PasswordSalt) &&
                    await inspection.AdminSessions.AnyAsync(x => x.AdminUserId == id && x.RevokedAtUtc != null),
                    "Staff updates must persist valid details and revoke sessions when deactivated");
            }
            Check(Status(await Invoke(nameof(AdminAuthController.Users), "temporary-" + id, c => c.Users())) == 401,
                "Deactivated staff sessions must immediately stop authenticating");
            Check(Status(await Update("Administrator", id, "Administrator")) == 200,
                "Manager must reactivate and change roles within the staff set");
            Check(Status(await Delete("Administrator", id)) == 200,
                "Manager must delete allowed staff accounts");
            await using var remaining = new AppDbContext(optionsBuilder.Options);
            Check(!await remaining.AdminUsers.AnyAsync(x => x.Id == id) && !await remaining.AdminSessions.AnyAsync(x => x.AdminUserId == id) &&
                !await remaining.AdminDeviceCredentials.AnyAsync(x => x.AdminUserId == id),
                "Staff deletion must also remove sessions and device credentials");
        }

        Check(Status(await Create("Owner", "Owner", "second-owner@checks.test")) == 200,
            "Owner must retain permission to create another Owner");
        Check(Status(await Update("Owner", developerId, "Administrator")) == 403 && Status(await Delete("Owner", developerId)) == 403,
            "Owner must remain unable to modify or delete Developer");
        var elevated = await Create("Developer", "Developer", "developer-managed@checks.test");
        var elevatedId = Payload(elevated).GetProperty("Id").GetInt32();
        Check(Status(elevated) == 200 && Status(await Update("Developer", elevatedId, "Owner")) == 200 &&
            Status(await Delete("Developer", elevatedId)) == 200,
            "Developer must retain create, modify and delete rights across privileged roles");

        await new ProductTierService(db).LockBasicAsync();
        Check(Status(await Create("Administrator", "Waiter", "basic-waiter@checks.test")) == 400 &&
            Status(await Update("Administrator", users["Administrator"].Id, "Kitchen")) == 400 &&
            Status(await Create("Administrator", "Administrator", "basic-manager@checks.test")) == 200,
            "Existing Basic/Pro restrictions must continue to apply to manager staff operations");

        // Login also runs the production PostgreSQL bootstrap SQL; exercise it on
        // PostgreSQL while the session/filter/controller checks above run on both providers.
        if (db.Database.IsNpgsql())
        {
            var sessionsBeforeInvalidLogin = await db.AdminSessions.CountAsync();
            var authService = new AdminAuthService(db, config, tenant, tenancy);
            db.AdminDeviceCredentials.Add(new AdminDeviceCredential { AdminUserId = users["unexpected-role"].Id, Label = "invalid-role", CredentialHash = AdminAuthService.HashToken("invalid-device") });
            await db.SaveChangesAsync();
            Check(await authService.LoginAsync("unexpected-role@checks.test", "ManagementChecks!2026", new DefaultHttpContext().Request) == null &&
                await authService.LoginWithDeviceAsync("invalid-device", new DefaultHttpContext().Request) == null &&
                await db.AdminSessions.CountAsync() == sessionsBeforeInvalidLogin,
                "Invalid stored roles must fail password and device login without creating sessions");
        }
        Console.WriteLine($"PASS: {count} admin-management checks: real session/filter/controller CRUD, staff-only manager scope, protected roles, bootstrap, invalid roles, session revocation and Basic/Pro rules.");
    }
}
