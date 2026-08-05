using CasaDiFratelli.Api.Services.Tenancy;
using Microsoft.Extensions.Options;

namespace CasaDiFratelli.Api.Services;

public class AutomaticTableReleaseHostedService : BackgroundService
{
    private const string RestaurantTimeZoneId = "Europe/Sofia";
    private readonly IServiceProvider _services;
    private readonly ILogger<AutomaticTableReleaseHostedService> _logger;
    private readonly TenantResolutionOptions _tenancy;

    public AutomaticTableReleaseHostedService(
        IServiceProvider services,
        ILogger<AutomaticTableReleaseHostedService> logger,
        IOptions<TenantResolutionOptions> tenancy)
    {
        _services = services;
        _logger = logger;
        _tenancy = tenancy.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await ReleaseExpiredTablesForAllTenantsAsync(stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(GetDelayUntilNextRestaurantMidnight(), stoppingToken);
            await ReleaseExpiredTablesForAllTenantsAsync(stoppingToken);
        }
    }

    private async Task ReleaseExpiredTablesForAllTenantsAsync(CancellationToken cancellationToken)
    {
        var today = GetRestaurantToday();

        foreach (var tenant in _tenancy.Tenants.Where(item => item.IsActive))
        {
            try
            {
                using var scope = _services.CreateScope();
                scope.ServiceProvider.GetRequiredService<CurrentTenant>().Resolve(tenant);
                var releaseService = scope.ServiceProvider.GetRequiredService<AutomaticTableReleaseService>();
                var released = await releaseService.ReleasePreviousDayTablesAsync(today, cancellationToken);

                if (released > 0)
                {
                    _logger.LogInformation(
                        "Automatically released tables after midnight. TenantId={TenantId}, Reservations={Reservations}, RestaurantDate={RestaurantDate}",
                        tenant.Id,
                        released,
                        today);
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception error)
            {
                _logger.LogError(error, "Automatic table release failed. TenantId={TenantId}", tenant.Id);
            }
        }
    }

    private static DateOnly GetRestaurantToday()
    {
        var timeZone = GetRestaurantTimeZone();
        var localNow = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, timeZone);
        return DateOnly.FromDateTime(localNow);
    }

    private static TimeSpan GetDelayUntilNextRestaurantMidnight()
    {
        var timeZone = GetRestaurantTimeZone();
        var nowUtc = DateTime.UtcNow;
        var localNow = TimeZoneInfo.ConvertTimeFromUtc(nowUtc, timeZone);
        var nextLocalMidnight = DateTime.SpecifyKind(localNow.Date.AddDays(1), DateTimeKind.Unspecified);
        var nextMidnightUtc = TimeZoneInfo.ConvertTimeToUtc(nextLocalMidnight, timeZone);
        var delay = nextMidnightUtc - nowUtc + TimeSpan.FromSeconds(1);
        return delay > TimeSpan.Zero ? delay : TimeSpan.FromMinutes(1);
    }

    private static TimeZoneInfo GetRestaurantTimeZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(RestaurantTimeZoneId);
        }
        catch (TimeZoneNotFoundException)
        {
            return TimeZoneInfo.Local;
        }
        catch (InvalidTimeZoneException)
        {
            return TimeZoneInfo.Local;
        }
    }
}
