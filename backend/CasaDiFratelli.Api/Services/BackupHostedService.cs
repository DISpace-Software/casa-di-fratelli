namespace CasaDiFratelli.Api.Services;

public class BackupHostedService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<BackupHostedService> _logger;

    public BackupHostedService(IServiceProvider services, ILogger<BackupHostedService> logger)
    {
        _services = services;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _services.CreateScope();
                var backups = scope.ServiceProvider.GetRequiredService<BackupExportService>();
                await backups.EnsureScheduledBackupAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception error)
            {
                _logger.LogError(error, "Scheduled backup check failed.");
            }

            await Task.Delay(TimeSpan.FromMinutes(15), stoppingToken);
        }
    }
}
