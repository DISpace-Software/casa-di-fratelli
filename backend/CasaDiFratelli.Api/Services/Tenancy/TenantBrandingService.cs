using System.Text.Json;
using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Services.Tenancy;

public sealed class TenantBrandingService
{
    public const string SettingsKey = "tenant.branding.v1";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly AppDbContext _db;
    private readonly ICurrentTenant _tenant;
    private readonly IConfiguration _configuration;
    private readonly ILogger<TenantBrandingService> _logger;
    private TenantBrandingSettings? _cached;

    public TenantBrandingService(AppDbContext db, ICurrentTenant tenant, IConfiguration configuration,
        ILogger<TenantBrandingService> logger)
    {
        _db = db;
        _tenant = tenant;
        _configuration = configuration;
        _logger = logger;
    }

    public bool IsCasa => _tenant.TenantId.Equals("casa-di-fratelli", StringComparison.OrdinalIgnoreCase);
    public string TenantId => _tenant.TenantId;

    public string? GetEmailConfiguration(string key)
    {
        var scoped = _configuration[$"Tenancy:Email:{_tenant.TenantId}:{key}"];
        return !string.IsNullOrWhiteSpace(scoped) ? scoped : IsCasa ? _configuration[key] : null;
    }

    public async Task<TenantBrandingSettings> GetAsync()
    {
        if (_cached != null) return _cached;
        var json = await _db.AppSettings.AsNoTracking().Where(x => x.Key == SettingsKey)
            .Select(x => x.Value).FirstOrDefaultAsync();
        if (!string.IsNullOrWhiteSpace(json))
        {
            try
            {
                var saved = JsonSerializer.Deserialize<TenantBrandingSettings>(json, JsonOptions);
                if (saved != null && Validate(saved) == null) return _cached = saved;
            }
            catch (JsonException error)
            {
                _logger.LogWarning(error, "Invalid branding JSON. TenantId={TenantId}", _tenant.TenantId);
            }
        }
        return _cached = CreateDefaults();
    }

    public async Task SaveAsync(TenantBrandingSettings settings)
    {
        var error = Validate(settings);
        if (error != null) throw new ArgumentException(error);
        settings.Name = settings.Name.Trim();
        var row = await _db.AppSettings.FirstOrDefaultAsync(x => x.Key == SettingsKey);
        if (row == null)
        {
            row = new AppSetting { Key = SettingsKey };
            _db.AppSettings.Add(row);
        }
        row.Value = JsonSerializer.Serialize(settings, JsonOptions);
        row.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        _cached = settings;
    }

    public static string? Validate(TenantBrandingSettings settings)
    {
        var validation = new List<System.ComponentModel.DataAnnotations.ValidationResult>();
        if (!System.ComponentModel.DataAnnotations.Validator.TryValidateObject(settings,
                new System.ComponentModel.DataAnnotations.ValidationContext(settings), validation, true))
            return validation[0].ErrorMessage;
        if (string.IsNullOrWhiteSpace(settings.Name)) return "Restaurant name is required.";
        if (string.IsNullOrWhiteSpace(settings.TimeZoneId)) return "Time zone is required.";
        try { _ = TimeZoneInfo.FindSystemTimeZoneById(settings.TimeZoneId); }
        catch (Exception error) when (error is TimeZoneNotFoundException or InvalidTimeZoneException)
        { return "Unknown time zone."; }
        foreach (var time in new[] { settings.PublicLatestReservationTime, settings.AdminLatestReservationTime,
                     settings.WalkInOpeningTime, settings.WalkInLatestTime })
            if (!TimeOnly.TryParseExact(time, "HH:mm", System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.None, out _)) return "Reservation times must use HH:mm.";
        if (TimeOnly.Parse(settings.WalkInOpeningTime) > TimeOnly.Parse(settings.WalkInLatestTime))
            return "Walk-in opening time must not follow the last seating time.";
        foreach (var url in new[] { settings.LogoUrl, settings.GoogleReviewUrl, settings.FacebookUrl, settings.InstagramUrl })
        {
            if (string.IsNullOrWhiteSpace(url)) continue;
            if (url.StartsWith('/') && !url.StartsWith("//") && !url.Contains('\\')) continue;
            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
                (uri.Scheme != "https" && uri.Scheme != "http")) return "URLs must use HTTP(S) or a local absolute path.";
        }
        return null;
    }

    private TenantBrandingSettings CreateDefaults() => new()
    {
        Name = string.IsNullOrWhiteSpace(_tenant.TenantName) ? "Restaurant" : _tenant.TenantName,
        Phone = IsCasa ? "+359888218318" : "",
        AddressBg = IsCasa ? "ул. Вечерница 9, Пловдив" : "",
        AddressEn = IsCasa ? "9 Vechernitsa St, Plovdiv" : "",
        AddressRu = IsCasa ? "ул. Вечерница 9, Пловдив" : "",
        OpeningHoursBg = IsCasa ? "Пон–Нед, 10:00 – 00:00" : "",
        OpeningHoursEn = IsCasa ? "Mon–Sun, 10:00 – 00:00" : "",
        OpeningHoursRu = IsCasa ? "Пн–Вс, 10:00 – 00:00" : "",
        LogoUrl = IsCasa ? "/casa-di-fratelli-logo.svg" : "",
        GoogleReviewUrl = IsCasa ? (_configuration["REVIEW_URL"] ?? "https://www.google.com/maps/search/?api=1&query=Casa%20di%20Fratelli%20Vechernitsa%209%20Plovdiv") : "",
        FacebookUrl = IsCasa ? "https://www.facebook.com/CassadiFratelli" : "",
        InstagramUrl = IsCasa ? "https://www.instagram.com/casadifratelli.plovdiv/" : ""
    };
}
