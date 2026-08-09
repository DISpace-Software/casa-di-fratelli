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
        while (!stoppingToken.IsCancellationRequested)
        {
            await ReleaseExpiredTablesForAllTenantsAsync(stoppingToken);
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }
    }

    private async Task ReleaseExpiredTablesForAllTenantsAsync(CancellationToken cancellationToken)
    {
        var restaurantNow = GetRestaurantNow();
        var today = DateOnly.FromDateTime(restaurantNow);

        foreach (var tenant in _tenancy.Tenants.Where(item => item.IsActive))
        {
            try
            {
                using var scope = _services.CreateScope();
                scope.ServiceProvider.GetRequiredService<CurrentTenant>().Resolve(tenant);
                var releaseService = scope.ServiceProvider.GetRequiredService<AutomaticTableReleaseService>();
                var releasedPreviousDays = await releaseService.ReleasePreviousDayTablesAsync(today, cancellationToken);
                var releasedWalkIns = await releaseService.ReleaseWalkInsForUpcomingReservationsAsync(restaurantNow, cancellationToken);

                if (releasedPreviousDays > 0 || releasedWalkIns > 0)
                {
                    _logger.LogInformation(
                        "Automatically released tables. TenantId={TenantId}, PreviousDays={PreviousDays}, WalkIns={WalkIns}, RestaurantDate={RestaurantDate}",
                        tenant.Id,
                        releasedPreviousDays,
                        releasedWalkIns,
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

    private static DateTime GetRestaurantNow()
    {
        var timeZone = GetRestaurantTimeZone();
        return TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, timeZone);
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
