using System.Text.Json;
using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Models;
using CasaDiFratelli.Api.Services.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Services;

public sealed record BackupFileInfo(
    string FileName,
    long SizeBytes,
    DateTime CreatedAtUtc,
    string DownloadUrl
);

public sealed record BackupScheduleSettings(
    bool Enabled,
    int IntervalDays,
    string RunAtLocalTime,
    string TimeZoneId
);

public class BackupExportService
{
    private const string BackupFilePrefix = "casa-data-backup";
    private const string BackupSettingsKey = "BackupScheduleSettings";
    private static readonly BackupScheduleSettings DefaultSchedule = new(true, 7, "03:00", "Europe/Sofia");
    private readonly AppDbContext _db;
    private readonly IConfiguration _configuration;
    private readonly IWebHostEnvironment _environment;
    private readonly ICurrentTenant _tenant;

    public BackupExportService(
        AppDbContext db,
        IConfiguration configuration,
        IWebHostEnvironment environment,
        ICurrentTenant tenant)
    {
        _db = db;
        _configuration = configuration;
        _environment = environment;
        _tenant = tenant;
    }

    public async Task<BackupFileInfo> CreateBackupFileAsync(string source, CancellationToken cancellationToken = default)
    {
        var directory = EnsureBackupDirectory();
        var createdAtUtc = DateTime.UtcNow;
        var fileName = $"{BackupFilePrefix}-{createdAtUtc:yyyyMMdd-HHmmss}-{NormalizeSource(source)}.json";
        var path = Path.Combine(directory, fileName);
        var payload = await BuildPayloadAsync(source, createdAtUtc, cancellationToken);
        var options = new JsonSerializerOptions { WriteIndented = true };
        var json = JsonSerializer.Serialize(payload, options);

        await File.WriteAllTextAsync(path, json, cancellationToken);
        return ToInfo(new FileInfo(path));
    }

    public async Task<BackupScheduleSettings> GetScheduleSettingsAsync(CancellationToken cancellationToken = default)
    {
        var setting = await _db.AppSettings.FirstOrDefaultAsync(x => x.Key == BackupSettingsKey, cancellationToken);
        if (setting == null || string.IsNullOrWhiteSpace(setting.Value))
            return DefaultSchedule;

        try
        {
            var parsed = JsonSerializer.Deserialize<BackupScheduleSettings>(setting.Value);
            return NormalizeSettings(parsed);
        }
        catch
        {
            return DefaultSchedule;
        }
    }

    public async Task<BackupScheduleSettings> SaveScheduleSettingsAsync(
        BackupScheduleSettings settings,
        CancellationToken cancellationToken = default)
    {
        var normalized = NormalizeSettings(settings);
        var json = JsonSerializer.Serialize(normalized);
        var setting = await _db.AppSettings.FirstOrDefaultAsync(x => x.Key == BackupSettingsKey, cancellationToken);

        if (setting == null)
        {
            _db.AppSettings.Add(new AppSetting
            {
                Key = BackupSettingsKey,
                Value = json,
                UpdatedAtUtc = DateTime.UtcNow
            });
        }
        else
        {
            setting.Value = json;
            setting.UpdatedAtUtc = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync(cancellationToken);
        return normalized;
    }

    public Task<List<BackupFileInfo>> ListBackupsAsync()
    {
        var directory = EnsureBackupDirectory();
        var files = Directory
            .EnumerateFiles(directory, $"{BackupFilePrefix}-*.json")
            .Select(path => ToInfo(new FileInfo(path)))
            .OrderByDescending(file => file.CreatedAtUtc)
            .Take(30)
            .ToList();

        return Task.FromResult(files);
    }

    public string? GetBackupPath(string fileName)
    {
        var safeFileName = Path.GetFileName(fileName);
        if (string.IsNullOrWhiteSpace(safeFileName) ||
            !safeFileName.StartsWith($"{BackupFilePrefix}-", StringComparison.OrdinalIgnoreCase) ||
            !safeFileName.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var path = Path.Combine(EnsureBackupDirectory(), safeFileName);
        return File.Exists(path) ? path : null;
    }

    public async Task EnsureScheduledBackupAsync(CancellationToken cancellationToken = default)
    {
        var settings = await GetScheduleSettingsAsync(cancellationToken);
        if (!settings.Enabled)
            return;

        var nowUtc = DateTime.UtcNow;
        var nowLocal = ConvertUtcToLocal(nowUtc, settings.TimeZoneId);
        var runAt = ParseRunAt(settings.RunAtLocalTime);
        if (nowLocal.TimeOfDay < runAt)
            return;

        var latestBackup = (await ListBackupsAsync())
            .Where(file => file.FileName.Contains("-auto", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(file => file.CreatedAtUtc)
            .FirstOrDefault();

        if (latestBackup != null)
        {
            var latestLocal = ConvertUtcToLocal(latestBackup.CreatedAtUtc, settings.TimeZoneId);
            if (latestLocal.Date == nowLocal.Date ||
                latestBackup.CreatedAtUtc > nowUtc.AddDays(-settings.IntervalDays))
            {
                return;
            }
        }

        await CreateBackupFileAsync($"auto-{settings.IntervalDays}d", cancellationToken);
    }

    private static BackupScheduleSettings NormalizeSettings(BackupScheduleSettings? settings)
    {
        if (settings == null)
            return DefaultSchedule;

        var intervalDays = Math.Clamp(settings.IntervalDays, 1, 30);
        var runAt = ParseRunAt(settings.RunAtLocalTime);
        var timeZoneId = string.IsNullOrWhiteSpace(settings.TimeZoneId)
            ? DefaultSchedule.TimeZoneId
            : settings.TimeZoneId.Trim();

        return new BackupScheduleSettings(
            settings.Enabled,
            intervalDays,
            $"{runAt.Hours:00}:{runAt.Minutes:00}",
            timeZoneId
        );
    }

    private static TimeSpan ParseRunAt(string? value)
    {
        if (TimeSpan.TryParse(value, out var parsed) &&
            parsed >= TimeSpan.Zero &&
            parsed < TimeSpan.FromDays(1))
        {
            return new TimeSpan(parsed.Hours, parsed.Minutes, 0);
        }

        return TimeSpan.FromHours(3);
    }

    private static DateTime ConvertUtcToLocal(DateTime utc, string timeZoneId)
    {
        try
        {
            var timezone = TimeZoneInfo.FindSystemTimeZoneById(timeZoneId);
            return TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), timezone);
        }
        catch
        {
            return utc;
        }
    }

    private async Task<object> BuildPayloadAsync(string source, DateTime createdAtUtc, CancellationToken cancellationToken)
    {
        var reservations = await _db.Reservations
            .IgnoreQueryFilters()
            .Include(x => x.Tables)
            .OrderByDescending(x => x.ReservedDate)
            .ThenBy(x => x.ReservedTime)
            .Select(x => new
            {
                x.Id,
                x.GuestName,
                x.Phone,
                x.Email,
                x.GuestCount,
                x.Area,
                x.ReservedDate,
                x.ReservedTime,
                x.Notes,
                x.InternalNote,
                x.Status,
                x.CreatedAtUtc,
                x.BirthDate,
                x.MarketingConsent,
                x.PrivacyConsent,
                x.CreatedByAdmin,
                x.CreatedByAdminName,
                x.IsWalkIn,
                x.IsNoShow,
                x.IsArrived,
                x.IsBlacklisted,
                x.IsRegularCustomer,
                x.EmailConfirmedAtUtc,
                x.IsDeleted,
                x.DeletedAtUtc,
                x.DeletedByAdminName,
                x.DeleteReason,
                TableIds = x.Tables.Select(table => table.TableCode).OrderBy(code => code).ToList()
            })
            .ToListAsync(cancellationToken);

        var customers = await _db.CustomerProfiles
            .OrderBy(x => x.GuestName)
            .ThenBy(x => x.Phone)
            .Select(x => new
            {
                x.Id,
                x.GuestName,
                x.Phone,
                x.Email,
                x.ReservationCount,
                x.IsRegularCustomer,
                x.BirthDate,
                x.MarketingConsent,
                x.FirstReservationAtUtc,
                x.LastReservationAtUtc
            })
            .ToListAsync(cancellationToken);

        return new
        {
            Meta = new
            {
                Source = source,
                TenantId = _tenant.TenantId,
                CreatedAtUtc = createdAtUtc,
                Format = "CasaDiFratelli.ClientsAndReservations.v1",
                ReservationCount = reservations.Count,
                CustomerCount = customers.Count,
                Note = "Readable operational backup. Keep PostgreSQL provider backups enabled as the primary disaster recovery layer."
            },
            Reservations = reservations,
            Customers = customers
        };
    }

    private string EnsureBackupDirectory()
    {
        var configuredDirectory = _configuration["BACKUP_DIRECTORY"];
        var directory = string.IsNullOrWhiteSpace(configuredDirectory)
            ? Path.Combine(_environment.ContentRootPath, "DataBackups")
            : configuredDirectory;
        directory = Path.Combine(directory, NormalizeSource(_tenant.TenantId));

        Directory.CreateDirectory(directory);
        return directory;
    }

    private static BackupFileInfo ToInfo(FileInfo file)
    {
        return new BackupFileInfo(
            file.Name,
            file.Length,
            file.CreationTimeUtc,
            $"/api/maintenance/backups/{Uri.EscapeDataString(file.Name)}"
        );
    }

    private static string NormalizeSource(string source)
    {
        var normalized = new string((source ?? string.Empty)
            .Trim()
            .ToLowerInvariant()
            .Where(character => char.IsLetterOrDigit(character) || character == '-')
            .ToArray());

        return string.IsNullOrWhiteSpace(normalized) ? "manual" : normalized;
    }
}
