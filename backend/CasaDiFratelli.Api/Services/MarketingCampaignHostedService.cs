namespace CasaDiFratelli.Api.Services;

public class MarketingCampaignHostedService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<MarketingCampaignHostedService> _logger;

    public MarketingCampaignHostedService(IServiceProvider services, ILogger<MarketingCampaignHostedService> logger)
    {
        _services = services;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _services.CreateScope();
                var marketing = scope.ServiceProvider.GetRequiredService<MarketingCampaignService>();
                var result = await marketing.RunAsync(dryRun: false);
                if (result.Sent > 0 || result.Candidates > 0)
                    _logger.LogInformation("Marketing campaigns checked. Candidates={Candidates}, Sent={Sent}, Skipped={Skipped}", result.Candidates, result.Sent, result.SkippedAlreadySent);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception error)
            {
                _logger.LogError(error, "Marketing campaign check failed.");
            }

            await Task.Delay(TimeSpan.FromHours(24), stoppingToken);
        }
    }
}
