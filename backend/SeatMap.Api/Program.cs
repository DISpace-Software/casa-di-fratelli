using SeatMap.Api.Data;
using SeatMap.Api.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SeatMap.Api.Services;
using SeatMap.Api.Services.Tenancy;
using System.Diagnostics;
using SeatMap.Api.Platform;
using SeatMap.Api.Platform.Data;
using SeatMap.Api.Platform.Services;
using SeatMap.Api.Services.Reservations;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.Converters.Add(new FlexibleDateOnlyJsonConverter());
});
builder.Services
    .AddOptions<TenantResolutionOptions>()
    .Bind(builder.Configuration.GetSection("Tenancy"))
    .ValidateOnStart();
builder.Services.AddSingleton<IValidateOptions<TenantResolutionOptions>, TenantOptionsValidator>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<CurrentTenant>();
builder.Services.AddScoped<ICurrentTenant>(provider => provider.GetRequiredService<CurrentTenant>());
builder.Services.AddScoped<TenantDatabaseConnectionResolver>();
builder.Services.AddScoped<TenantBrandingService>();
builder.Services.AddSingleton<RestaurantCatalog>();
var platformOptions = builder.Configuration.GetSection("Platform").Get<PlatformOptions>() ?? new();
builder.Services.AddOptions<PlatformOptions>().Bind(builder.Configuration.GetSection("Platform"))
    .Validate(options => options.FrontendOrigins.All(origin =>
        Uri.TryCreate(origin, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" &&
        uri.AbsolutePath == "/" && string.IsNullOrEmpty(uri.UserInfo) &&
        string.IsNullOrEmpty(uri.Query) && string.IsNullOrEmpty(uri.Fragment)),
        "Platform frontend origins must be HTTP(S) origins without credentials, paths, queries or fragments.")
    .ValidateOnStart();
if (platformOptions.Enabled && !EF.IsDesignTime)
{
    var platformConnection = PlatformDatabaseConfiguration.Resolve(builder.Configuration);
    builder.Services.AddDbContext<PlatformDbContext>(options => options.UseNpgsql(platformConnection));
}
builder.Services.AddHttpClient<EmailService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(5);
});
builder.Services.AddScoped<ReservationConflictService>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<ReservationBookingService>();
builder.Services.AddScoped<IReservationBookingNotifications, ReservationBookingNotifications>();
builder.Services.AddScoped<AdminAuthService>();
builder.Services.AddScoped<AuditService>();
builder.Services.AddScoped<ProductTierService>();
builder.Services.AddScoped<PushNotificationService>();
builder.Services.AddScoped<InventoryConsumptionService>();
builder.Services.AddScoped<InventoryRecipeSeedService>();
builder.Services.AddScoped<MarketingCampaignService>();
builder.Services.AddScoped<BackupExportService>();
builder.Services.AddScoped<RestaurantClosureService>();
builder.Services.AddScoped<SeatMap.Api.Services.FloorPlans.FloorPlanService>();
builder.Services.AddScoped<SeasonalZoneService>();
builder.Services.AddScoped<VisitFeedbackEmailService>();
builder.Services.AddHostedService<VisitFeedbackEmailHostedService>();
builder.Services.AddHostedService<MarketingCampaignHostedService>();
builder.Services.AddHostedService<BackupHostedService>();

// EF scans all registered contexts before choosing a factory. Its discovery
// context must match AppDbContextFactory and must never resolve a live tenant.
builder.Services.AddDbContext<AppDbContext>((provider, options) =>
{
    if (EF.IsDesignTime) options.UseSqlite("Data Source=casadifratelli.db");
    else options.UseNpgsql(provider.GetRequiredService<TenantDatabaseConnectionResolver>().Resolve());
});

builder.Services.AddCors(options =>
{
    var tenancy = builder.Configuration.GetSection("Tenancy").Get<TenantResolutionOptions>() ?? new();
    var allowedOrigins = tenancy.Tenants
        .Where(tenant => tenant.IsActive)
        .SelectMany(tenant => tenant.FrontendOrigins
            .Concat(string.IsNullOrWhiteSpace(tenant.Domain)
                ? Array.Empty<string>()
                : new[] { $"https://{tenant.Domain}" }))
        .Select(origin => origin.Trim().TrimEnd('/'))
        .Where(origin => !string.IsNullOrWhiteSpace(origin))
        .ToHashSet(StringComparer.OrdinalIgnoreCase);
    allowedOrigins.UnionWith(platformOptions.FrontendOrigins.Select(origin => origin.TrimEnd('/')));
    if (builder.Environment.IsDevelopment())
    {
        allowedOrigins.Add("http://localhost:5173");
        allowedOrigins.Add("http://localhost:4173");
    }

    options.AddPolicy("AllowFrontend", policy =>
    {
        policy
            .SetIsOriginAllowed(origin => allowedOrigins.Contains(origin.TrimEnd('/')))
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

// Endpoint metadata and restaurantId route values must exist before tenant resolution.
app.UseRouting();
app.UseCors("AllowFrontend");
app.UseMiddleware<TenantResolutionMiddleware>();

app.Use(async (context, next) =>
{
    var stopwatch = Stopwatch.StartNew();
    try
    {
        await next();
    }
    catch (Exception error)
    {
        app.Logger.LogError(error, "Unhandled error {Method} {Path}", context.Request.Method, context.Request.Path);
        if (!context.Response.HasStarted)
        {
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(new { message = "Internal server error." });
        }
    }
    finally
    {
        stopwatch.Stop();
        if (context.Response.StatusCode >= 500 || stopwatch.ElapsedMilliseconds > 1500)
        {
            app.Logger.LogWarning(
                "Request {Method} {Path} finished {StatusCode} in {Elapsed}ms",
                context.Request.Method,
                context.Request.Path,
                context.Response.StatusCode,
                stopwatch.ElapsedMilliseconds);
        }
    }
});

var tenantOptions = app.Services.GetRequiredService<IOptions<TenantResolutionOptions>>().Value;
// Validate every target before migrating or bootstrapping any restaurant.
using (var validationScope = app.Services.CreateScope())
{
    var resolver = validationScope.ServiceProvider.GetRequiredService<TenantDatabaseConnectionResolver>();
    resolver.ValidateDedicatedDatabaseTargets();
    if (platformOptions.Enabled)
        PlatformDatabaseConfiguration.ValidateIsolation(
            PlatformDatabaseConfiguration.Resolve(builder.Configuration),
            tenantOptions.Tenants.Where(item => item.IsActive).Select(resolver.ResolveFor));
}
var migratePlatform = builder.Configuration.GetValue<bool>("MigratePlatform");
var migrateRestaurants = builder.Configuration.GetValue<bool>("MigrateRestaurants");
if (migratePlatform && migrateRestaurants)
    throw new InvalidOperationException("Run platform and restaurant migrations as separate deployment commands.");
if (migratePlatform)
{
    if (!platformOptions.Enabled)
        throw new InvalidOperationException("Enable Platform:Enabled before migrating the platform database.");
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().Database.MigrateAsync();
    app.Logger.LogInformation("SeatMap platform database migrated. No restaurant schema was changed.");
    return;
}
if (tenantOptions.MigrateOnStartup || migrateRestaurants)
{
    foreach (var tenant in tenantOptions.Tenants.Where(item => item.IsActive))
    {
        using var scope = app.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<CurrentTenant>().Resolve(tenant);
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Database.Migrate();
        await AdminSchemaBootstrapper.EnsureAsync(db);
        await scope.ServiceProvider.GetRequiredService<AdminAuthService>().EnsureDefaultAdminAsync();
        if (tenant.SeedDefaultMenu)
            _ = await MenuSeedData.SeedIfEmptyAsync(db);
        app.Logger.LogInformation("Tenant database initialized. TenantId={TenantId}", tenant.Id);
    }
}
if (migrateRestaurants) return;

app.MapControllers();
app.MapMethods("{*path}", new[] { "OPTIONS" }, () => Results.Ok()).RequireCors("AllowFrontend");

app.Run();
