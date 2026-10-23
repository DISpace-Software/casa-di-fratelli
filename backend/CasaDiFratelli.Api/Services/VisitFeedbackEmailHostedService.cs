using CasaDiFratelli.Api.Services.Tenancy;
using Microsoft.Extensions.Options;

namespace CasaDiFratelli.Api.Services;

public sealed class VisitFeedbackEmailHostedService(IServiceProvider services, IOptions<TenantResolutionOptions> tenancy,
    ILogger<VisitFeedbackEmailHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            while (!stoppingToken.IsCancellationRequested)
            {
                foreach (var tenant in tenancy.Value.Tenants.Where(x => x.IsActive))
                {
                    if (stoppingToken.IsCancellationRequested) return;
                    try
                    {
                        using var scope = services.CreateScope();
                        scope.ServiceProvider.GetRequiredService<CurrentTenant>().Resolve(tenant);
                        await scope.ServiceProvider.GetRequiredService<VisitFeedbackEmailService>().RetryPendingAsync();
                    }
                    catch (Exception error) { logger.LogError(error, "Visit feedback retry failed. TenantId={TenantId}", tenant.Id); }
                }
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }
}
