using System.Text.Json;
using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Services;

public sealed record RestaurantClosureSettings(
    bool Enabled,
    DateOnly StartDate,
    DateOnly EndDate,
    string Message)
{
    public DateOnly ReopenDate => EndDate.AddDays(1);
}

public sealed class RestaurantClosureService
{
    private const string SettingsKey = "restaurant-closure";
    public const string DefaultMessage =
        "Уважаеми клиенти и приятели,\n" +
        "От 27.07.2026г. до 02.08.2026г.\n" +
        "Ресторантът ще бъде в\n" +
        "ГОДИШЕН ОТПУСК.\n" +
        "Очакваме ви отново на\n" +
        "03.08.2026г.\n" +
        "Благодарим ви за разбирането!";

    private readonly AppDbContext _db;

    public RestaurantClosureService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<RestaurantClosureSettings> GetAsync()
    {
        var value = await _db.AppSettings.AsNoTracking()
            .Where(x => x.Key == SettingsKey)
            .Select(x => x.Value)
            .FirstOrDefaultAsync();

        if (!string.IsNullOrWhiteSpace(value))
        {
            try
            {
                var saved = JsonSerializer.Deserialize<RestaurantClosureSettings>(
                    value,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                if (saved != null)
                    return Normalize(saved);
            }
            catch (JsonException)
            {
                // Invalid legacy data falls back to the initial closure below.
            }
        }

        return new RestaurantClosureSettings(
            true,
            new DateOnly(2026, 7, 27),
            new DateOnly(2026, 8, 2),
            DefaultMessage);
    }

    public async Task<RestaurantClosureSettings> SaveAsync(RestaurantClosureSettings settings)
    {
        var normalized = Normalize(settings);
        var entity = await _db.AppSettings.FirstOrDefaultAsync(x => x.Key == SettingsKey);
        var json = JsonSerializer.Serialize(normalized);

        if (entity == null)
        {
            entity = new AppSetting { Key = SettingsKey };
            _db.AppSettings.Add(entity);
        }

        entity.Value = json;
        entity.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return normalized;
    }

    public static bool Contains(RestaurantClosureSettings settings, DateOnly date) =>
        settings.Enabled && date >= settings.StartDate && date <= settings.EndDate;

    public static bool IsCurrentlyActive(RestaurantClosureSettings settings)
    {
        var today = GetRestaurantToday();
        return Contains(settings, today);
    }

    private static RestaurantClosureSettings Normalize(RestaurantClosureSettings settings)
    {
        var start = settings.StartDate;
        var end = settings.EndDate < start ? start : settings.EndDate;
        var message = string.IsNullOrWhiteSpace(settings.Message)
            ? DefaultMessage
            : settings.Message.Trim();
        return settings with { StartDate = start, EndDate = end, Message = message };
    }

    private static DateOnly GetRestaurantToday()
    {
        try
        {
            var timezone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Sofia");
            return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, timezone));
        }
        catch
        {
            return DateOnly.FromDateTime(DateTime.Now);
        }
    }
}
