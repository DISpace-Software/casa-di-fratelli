using CasaDiFratelli.Api.Services.Tenancy;
using Microsoft.Extensions.Options;

namespace CasaDiFratelli.Api.Services;

public class MarketingCampaignHostedService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<MarketingCampaignHostedService> _logger;
    private readonly TenantResolutionOptions _tenancy;

    public MarketingCampaignHostedService(
        IServiceProvider services,
        ILogger<MarketingCampaignHostedService> logger,
        IOptions<TenantResolutionOptions> tenancy)
    {
        _services = services;
        _logger = logger;
        _tenancy = tenancy.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            foreach (var tenant in _tenancy.Tenants.Where(item => item.IsActive))
            {
                try
                {
                    using var scope = _services.CreateScope();
                    scope.ServiceProvider.GetRequiredService<CurrentTenant>().Resolve(tenant);
                    var marketing = scope.ServiceProvider.GetRequiredService<MarketingCampaignService>();
                    var result = await marketing.RunAsync(dryRun: false);
                    if (result.Sent > 0 || result.Candidates > 0)
                        _logger.LogInformation(
                            "Marketing campaigns checked. TenantId={TenantId}, Candidates={Candidates}, Sent={Sent}, Skipped={Skipped}",
                            tenant.Id, result.Candidates, result.Sent, result.SkippedAlreadySent);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    return;
                }
                catch (Exception error)
                {
                    _logger.LogError(error, "Marketing campaign check failed. TenantId={TenantId}", tenant.Id);
                }
            }

            await Task.Delay(TimeSpan.FromHours(24), stoppingToken);
        }
    }
}
