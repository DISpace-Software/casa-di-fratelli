using System.Net;
using System.Net.Http.Json;
using SeatMap.Api.Controllers;
using SeatMap.Api.Platform.Data;
using SeatMap.Api.Platform.Models;
using SeatMap.Api.Platform.Services;
using SeatMap.Api.Services.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

static void Check(bool condition, string scenario)
{
    if (!condition) throw new Exception(scenario);
    Console.WriteLine($"PASS {scenario}");
}
static TenantDefinition Tenant(string id, bool listed = true) => new()
{
    Id = id, Slug = id, Name = id, Domain = $"{id}.example.test", IsListed = listed,
    FrontendUrl = $"https://{id}.example.test", FrontendOrigins = [$"https://{id}.example.test"]
};
var alpha = Tenant("alpha");
var beta = Tenant("beta");
var hidden = Tenant("hidden", false);
var inactive = Tenant("inactive");
inactive.IsActive = false;
var tenants = new TenantResolutionOptions
{
    RequireKnownTenant = true, DefaultTenant = alpha, Tenants = [alpha, beta, hidden, inactive]
};
var catalog = new RestaurantCatalog(Options.Create(tenants));
Check(catalog.List().Select(x => x.Id).SequenceEqual(["alpha", "beta"]), "Catalog excludes unlisted and inactive restaurants");
Check(catalog.Find("ALPHA")?.Id == "alpha" && catalog.Find("hidden") == null, "Catalog detail respects publication and canonical IDs");
var json = System.Text.Json.JsonSerializer.Serialize(catalog.List());
Check(!json.Contains("ConnectionString") && !json.Contains("AdminPassword"), "Catalog DTO exposes no infrastructure secrets");
try
{
    PlatformDatabaseConfiguration.ValidateIsolation("Host=LOCALHOST.;Database=alpha;Username=platform", ["Host=localhost;Database=alpha;Username=restaurant"]);
    throw new Exception("Platform accepted a restaurant database");
}
catch (InvalidOperationException) { Console.WriteLine("PASS Platform cannot use a restaurant database, including different credentials"); }
PlatformDatabaseConfiguration.ValidateIsolation("Host=localhost;Database=platform;Username=test", ["Host=localhost;Database=alpha;Username=test"]);
try
{
    PlatformDatabaseConfiguration.Resolve(new ConfigurationBuilder().Build());
    throw new Exception("Missing platform connection silently fell back");
}
catch (InvalidOperationException) { Console.WriteLine("PASS Platform requires its own explicit connection"); }

await using (var connection = new SqliteConnection("Data Source=:memory:"))
{
    await connection.OpenAsync();
    var dbOptions = new DbContextOptionsBuilder<PlatformDbContext>().UseSqlite(connection).Options;
    await using var db = new PlatformDbContext(dbOptions);
    await db.Database.EnsureCreatedAsync();
    var guest = new GuestProfile { IdentityIssuer = "https://identity.example.test", IdentitySubject = "subject-a", DisplayName = "Guest" };
    db.GuestProfiles.Add(guest);
    await db.SaveChangesAsync();
    db.GuestFavorites.Add(new() { GuestProfileId = guest.Id, RestaurantId = "alpha" });
    db.GuestReservationReferences.AddRange(
        new() { RestaurantId = "alpha", ReservationId = 1, GuestProfileId = guest.Id, Status = "Pending", ReservedTime = "19:00" },
        new() { RestaurantId = "beta", ReservationId = 1, GuestProfileId = guest.Id, Status = "Pending", ReservedTime = "20:00" });
    await db.SaveChangesAsync();
    Check(await db.GuestReservationReferences.CountAsync() == 2, "Equal reservation IDs in two restaurants do not collide");
    db.GuestProfiles.Add(new() { IdentityIssuer = guest.IdentityIssuer, IdentitySubject = guest.IdentitySubject });
    try { await db.SaveChangesAsync(); throw new Exception("Duplicate identity accepted"); }
    catch (DbUpdateException) { Console.WriteLine("PASS Database enforces global identity uniqueness"); db.ChangeTracker.Clear(); }
    db.GuestFavorites.Add(new() { GuestProfileId = guest.Id, RestaurantId = "alpha" });
    try { await db.SaveChangesAsync(); throw new Exception("Duplicate favorite accepted"); }
    catch (DbUpdateException) { Console.WriteLine("PASS Database enforces favorite uniqueness"); db.ChangeTracker.Clear(); }
    db.GuestProfiles.Remove(await db.GuestProfiles.SingleAsync());
    await db.SaveChangesAsync();
    Check(!await db.GuestFavorites.AnyAsync() && !await db.GuestReservationReferences.AnyAsync(), "Profile deletion removes platform favorites and booking projections");
}
await using (var db = new PlatformDbContextFactory().CreateDbContext([]))
{
    var script = db.GetService<IMigrator>().GenerateScript(options: MigrationsSqlGenerationOptions.Idempotent);
    Check(script.Contains("CREATE TABLE \"GuestProfiles\"") && !script.Contains("CREATE TABLE \"Reservations\""), "PostgreSQL platform migration is separate from restaurant schema");
}

// Real HTTP routing and real tenant middleware; restaurant actions stop at a
// probe after resolution, so this test never connects to restaurant databases.
var builder = WebApplication.CreateBuilder();
builder.Logging.ClearProviders();
builder.WebHost.UseUrls("http://127.0.0.1:0");
builder.Services.AddSingleton<IOptions<TenantResolutionOptions>>(Options.Create(tenants));
builder.Services.AddSingleton<RestaurantCatalog>();
builder.Services.AddScoped<CurrentTenant>();
builder.Services.AddControllers().AddApplicationPart(typeof(RestaurantCatalogController).Assembly);
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy.WithOrigins("https://seatmap.example.test", "https://alpha.example.test").AllowAnyHeader().AllowAnyMethod()));
await using var app = builder.Build();
app.UseRouting();
app.UseCors();
app.UseMiddleware<TenantResolutionMiddleware>();
app.Use(async (context, next) =>
{
    var action = context.GetEndpoint()?.Metadata.GetMetadata<ControllerActionDescriptor>();
    if (action != null && action.ControllerTypeInfo.AsType() != typeof(RestaurantCatalogController))
    {
        await context.Response.WriteAsJsonAsync(new { tenantId = context.RequestServices.GetRequiredService<CurrentTenant>().TenantId, action = action.ActionName });
        return;
    }
    await next();
});
app.MapControllers();
await app.StartAsync();
try
{
    using var client = new HttpClient { BaseAddress = new Uri(app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single()) };
    var response = await client.GetAsync("/api/v1/restaurants");
    Check(response.IsSuccessStatusCode && !response.Headers.Contains("X-Tenant-Id"), "Global catalog works in strict mode without selecting Casa");
    Check((await client.GetAsync("/api/v1/restaurants/hidden")).StatusCode == HttpStatusCode.NotFound, "Unpublished restaurant is absent from public directory");
    foreach (var resource in new[] { "menu", "layout", "zones", "branding" })
    {
        var probe = await client.GetFromJsonAsync<Dictionary<string, string>>($"/api/v1/restaurants/beta/{resource}");
        Check(probe?["tenantId"] == "beta", $"Versioned {resource} route selects beta through real routing");
    }
    Check((await client.GetAsync("/api/v1/restaurants/unknown/menu")).StatusCode == HttpStatusCode.NotFound, "Unknown route restaurant never falls back");
    Check((await client.GetAsync("/api/v1/restaurants/inactive/menu")).StatusCode == HttpStatusCode.NotFound, "Inactive restaurant cannot be selected by route");
    using var hostConflict = new HttpRequestMessage(HttpMethod.Get, "/api/v1/restaurants/beta/menu");
    hostConflict.Headers.Host = "alpha.example.test";
    Check((await client.SendAsync(hostConflict)).StatusCode == HttpStatusCode.NotFound, "Restaurant host cannot be overridden by route");
    using var conflict = new HttpRequestMessage(HttpMethod.Get, "/api/v1/restaurants/beta/menu");
    conflict.Headers.Add("X-Tenant-Id", "alpha");
    Check((await client.SendAsync(conflict)).StatusCode == HttpStatusCode.NotFound, "Route and header mismatch rejected");
    using var originConflict = new HttpRequestMessage(HttpMethod.Get, "/api/v1/restaurants/beta/layout");
    originConflict.Headers.Add("Origin", "https://alpha.example.test");
    Check((await client.SendAsync(originConflict)).StatusCode == HttpStatusCode.NotFound, "Restaurant website cannot select another restaurant by route");
    using var platformOrigin = new HttpRequestMessage(HttpMethod.Get, "/api/v1/restaurants/beta/menu");
    platformOrigin.Headers.Add("Origin", "https://seatmap.example.test");
    Check((await client.SendAsync(platformOrigin)).IsSuccessStatusCode, "Shared SeatMap frontend can select a restaurant explicitly");
    using var preflight = new HttpRequestMessage(HttpMethod.Options, "/api/v1/restaurants/beta/menu");
    preflight.Headers.Add("Origin", "https://seatmap.example.test");
    preflight.Headers.Add("Access-Control-Request-Method", "GET");
    Check((await client.SendAsync(preflight)).StatusCode == HttpStatusCode.NoContent, "CORS preflight completes before strict tenant middleware");
    using var adminWrite = new HttpRequestMessage(HttpMethod.Put, "/api/v1/restaurants/beta/layout") { Content = JsonContent.Create(new { }) };
    adminWrite.Headers.Add("X-Tenant-Id", "beta");
    Check((await client.SendAsync(adminWrite)).StatusCode == HttpStatusCode.MethodNotAllowed, "Public v1 aliases do not expose admin writes");
    using var legacy = new HttpRequestMessage(HttpMethod.Get, "/api/menu");
    legacy.Headers.Add("X-Tenant-Id", "alpha");
    Check((await client.SendAsync(legacy)).IsSuccessStatusCode, "Legacy website menu route remains available");
    tenants.RequireKnownTenant = false;
    Check((await client.GetAsync("/api/menu")).IsSuccessStatusCode, "Existing non-strict website default is preserved");
    Check((await client.GetAsync("/api/v1/restaurants/unknown/menu")).StatusCode == HttpStatusCode.NotFound, "Unknown explicit restaurant fails even when legacy fallback is enabled");
}
finally { await app.StopAsync(); }
