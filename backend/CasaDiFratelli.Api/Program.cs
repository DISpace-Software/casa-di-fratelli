using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using CasaDiFratelli.Api.Services;
using CasaDiFratelli.Api.Services.Tenancy;
using System.Diagnostics;

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
builder.Services.AddHttpClient<EmailService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(5);
});
builder.Services.AddScoped<ReservationConflictService>();
builder.Services.AddScoped<AdminAuthService>();
builder.Services.AddScoped<AuditService>();
builder.Services.AddScoped<ProductTierService>();
builder.Services.AddScoped<PushNotificationService>();
builder.Services.AddScoped<InventoryConsumptionService>();
builder.Services.AddScoped<InventoryRecipeSeedService>();
builder.Services.AddScoped<MarketingCampaignService>();
builder.Services.AddScoped<BackupExportService>();
builder.Services.AddScoped<RestaurantClosureService>();
builder.Services.AddScoped<AutomaticTableReleaseService>();
builder.Services.AddHostedService<MarketingCampaignHostedService>();
builder.Services.AddHostedService<BackupHostedService>();
builder.Services.AddHostedService<AutomaticTableReleaseHostedService>();

builder.Services.AddDbContext<AppDbContext>((provider, options) =>
    options.UseNpgsql(provider.GetRequiredService<TenantDatabaseConnectionResolver>().Resolve()));

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

app.UseMiddleware<TenantResolutionMiddleware>();
app.UseCors("AllowFrontend");

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
foreach (var tenant in tenantOptions.Tenants.Where(item => item.IsActive))
{
    using var scope = app.Services.CreateScope();
    scope.ServiceProvider.GetRequiredService<CurrentTenant>().Resolve(tenant);
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
    await AdminSchemaBootstrapper.EnsureAsync(db);
    await scope.ServiceProvider.GetRequiredService<AdminAuthService>().EnsureDefaultAdminAsync();
    if (tenant.SeedDefaultMenu)
        _ = await MenuSeedData.SeedAsync(db);
    app.Logger.LogInformation("Tenant database initialized. TenantId={TenantId}", tenant.Id);
}

app.MapControllers();
app.MapMethods("{*path}", new[] { "OPTIONS" }, () => Results.Ok()).RequireCors("AllowFrontend");

app.Run();
