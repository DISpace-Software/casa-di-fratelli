using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Json;
using Microsoft.EntityFrameworkCore;
using CasaDiFratelli.Api.Services;
using CasaDiFratelli.Api.Services.Tenancy;
using Npgsql;
using System.Diagnostics;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.Converters.Add(new FlexibleDateOnlyJsonConverter());
});
builder.Services.Configure<TenantResolutionOptions>(builder.Configuration.GetSection("Tenancy"));
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<CurrentTenant>();
builder.Services.AddScoped<ICurrentTenant>(provider => provider.GetRequiredService<CurrentTenant>());
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
builder.Services.AddHostedService<MarketingCampaignHostedService>();
builder.Services.AddHostedService<BackupHostedService>();

var databaseConnectionString = ResolveDatabaseConnectionString(builder.Configuration);
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(databaseConnectionString));

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy
            .SetIsOriginAllowed(origin =>
            {
                if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri))
                {
                    return false;
                }

                return uri.Host.Equals("casa-di-fratelli.vercel.app", StringComparison.OrdinalIgnoreCase) ||
                    uri.Host.Equals("casadifratelli.bg", StringComparison.OrdinalIgnoreCase) ||
                    uri.Host.Equals("www.casadifratelli.bg", StringComparison.OrdinalIgnoreCase);
            })
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

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
    await AdminSchemaBootstrapper.EnsureAsync(db);
    await scope.ServiceProvider.GetRequiredService<AdminAuthService>().EnsureDefaultAdminAsync();
    _ = await MenuSeedData.SeedAsync(db);
}

app.MapControllers();
app.MapMethods("{*path}", new[] { "OPTIONS" }, () => Results.Ok()).RequireCors("AllowFrontend");

app.Run();

static string ResolveDatabaseConnectionString(IConfiguration configuration)
{
    var connectionString = configuration.GetConnectionString("DefaultConnection");
    if (!string.IsNullOrWhiteSpace(connectionString))
    {
        return connectionString;
    }

    var databaseUrl =
        configuration["DATABASE_URL"] ??
        configuration["POSTGRES_URL"] ??
        configuration["POSTGRESQL_URL"];

    if (string.IsNullOrWhiteSpace(databaseUrl))
    {
        throw new InvalidOperationException(
            "Database connection is not configured. Set ConnectionStrings__DefaultConnection or DATABASE_URL.");
    }

    return ConvertPostgresUrl(databaseUrl);
}

static string ConvertPostgresUrl(string databaseUrl)
{
    if (!Uri.TryCreate(databaseUrl, UriKind.Absolute, out var uri))
    {
        return databaseUrl;
    }

    var credentials = uri.UserInfo.Split(':', 2);

    return new NpgsqlConnectionStringBuilder
    {
        Host = uri.Host,
        Port = uri.IsDefaultPort ? 5432 : uri.Port,
        Database = uri.AbsolutePath.TrimStart('/'),
        Username = credentials.Length > 0 ? Uri.UnescapeDataString(credentials[0]) : string.Empty,
        Password = credentials.Length > 1 ? Uri.UnescapeDataString(credentials[1]) : string.Empty,
        SslMode = SslMode.Require,
        TrustServerCertificate = true
    }.ConnectionString;
}
