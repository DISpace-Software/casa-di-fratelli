using CasaDiFratelli.Api.Services.Tenancy;
using Microsoft.Extensions.Options;

namespace CasaDiFratelli.Api.Services;

public class BackupHostedService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<BackupHostedService> _logger;
    private readonly TenantResolutionOptions _tenancy;

    public BackupHostedService(
        IServiceProvider services,
        ILogger<BackupHostedService> logger,
        IOptions<TenantResolutionOptions> tenancy)
    {
        _services = services;
        _logger = logger;
        _tenancy = tenancy.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            foreach (var tenant in _tenancy.Tenants.Where(item => item.IsActive))
            {
                try
                {
                    using var scope = _services.CreateScope();
                    scope.ServiceProvider.GetRequiredService<CurrentTenant>().Resolve(tenant);
                    var backups = scope.ServiceProvider.GetRequiredService<BackupExportService>();
                    await backups.EnsureScheduledBackupAsync(stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    return;
                }
                catch (Exception error)
                {
                    _logger.LogError(error, "Scheduled backup check failed. TenantId={TenantId}", tenant.Id);
                }
            }

            await Task.Delay(TimeSpan.FromMinutes(15), stoppingToken);
        }
    }
}
