using System.Net;
using System.Text.Json;
using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Services;

public class MarketingCampaignService
{
    public const string SettingsKey = "marketing.campaigns";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly AppDbContext _db;
    private readonly EmailService _email;

    public MarketingCampaignService(AppDbContext db, EmailService email)
    {
        _db = db;
        _email = email;
    }

    public async Task<MarketingSettings> GetSettingsAsync()
    {
        var setting = await _db.AppSettings.AsNoTracking().FirstOrDefaultAsync(x => x.Key == SettingsKey);
        if (setting == null || string.IsNullOrWhiteSpace(setting.Value))
            return MarketingSettings.Default();

        try
        {
            return JsonSerializer.Deserialize<MarketingSettings>(setting.Value, JsonOptions) ?? MarketingSettings.Default();
        }
        catch
        {
            return MarketingSettings.Default();
        }
    }

    public async Task<MarketingSettings> SaveSettingsAsync(MarketingSettings settings)
    {
        var normalized = settings.Normalize();
        var json = JsonSerializer.Serialize(normalized, JsonOptions);
        var setting = await _db.AppSettings.FirstOrDefaultAsync(x => x.Key == SettingsKey);
        if (setting == null)
        {
            setting = new AppSetting { Key = SettingsKey, Value = json, UpdatedAtUtc = DateTime.UtcNow };
            _db.AppSettings.Add(setting);
        }
        else
        {
            setting.Value = json;
            setting.UpdatedAtUtc = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
        return normalized;
    }

    public async Task<MarketingRunResult> RunAsync(bool dryRun)
    {
        var settings = await GetSettingsAsync();
        var today = GetRestaurantToday();
        var customers = await _db.CustomerProfiles
            .Where(x => x.MarketingConsent && !string.IsNullOrWhiteSpace(x.Email))
            .ToListAsync();

        var candidates = new List<MarketingCandidate>();
        foreach (var customer in customers)
        {
            candidates.AddRange(await BuildCandidatesForCustomerAsync(customer, settings, today));
        }

        var sent = 0;
        var skipped = 0;
        foreach (var candidate in candidates)
        {
            var alreadySent = await _db.MarketingMessageLogs.AnyAsync(x =>
                x.CampaignKey == candidate.CampaignKey &&
                x.CustomerKey == candidate.CustomerKey &&
                x.SentForDate == candidate.SentForDate);

            if (alreadySent)
            {
                skipped++;
                continue;
            }

            if (dryRun) continue;

            await _email.SendAsync(candidate.Email, candidate.Subject, candidate.Html);
            _db.MarketingMessageLogs.Add(new MarketingMessageLog
            {
                CampaignKey = candidate.CampaignKey,
                CustomerKey = candidate.CustomerKey,
                Email = candidate.Email,
                SentForDate = candidate.SentForDate,
                SentAtUtc = DateTime.UtcNow,
                Subject = candidate.Subject,
                DiscountPercent = candidate.DiscountPercent
            });
            sent++;
        }

        if (!dryRun && sent > 0)
            await _db.SaveChangesAsync();

        return new MarketingRunResult(candidates.Count, sent, skipped, candidates.Take(100).ToList());
    }

    private async Task<List<MarketingCandidate>> BuildCandidatesForCustomerAsync(CustomerProfile customer, MarketingSettings settings, DateOnly today)
    {
        var result = new List<MarketingCandidate>();
        var customerKey = CustomerKey(customer);
        if (string.IsNullOrWhiteSpace(customer.Email) || string.IsNullOrWhiteSpace(customerKey))
            return result;

        var reservations = await _db.Reservations
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(x =>
                !x.IsDeleted &&
                x.Email == customer.Email &&
                x.Status != "Cancelled" &&
                x.Status != "AwaitingEmailConfirmation" &&
                !x.IsNoShow)
            .OrderBy(x => x.ReservedDate)
            .ToListAsync();

        if (settings.Birthday.Enabled && customer.BirthDate.HasValue)
        {
            var birthdayThisYear = new DateOnly(today.Year, customer.BirthDate.Value.Month, customer.BirthDate.Value.Day);
            if (birthdayThisYear < today.AddDays(-1))
                birthdayThisYear = birthdayThisYear.AddYears(1);

            var shouldSend = birthdayThisYear.AddDays(-settings.Birthday.DaysBefore) == today;
            var firstBirthdayReservation = reservations.Count <= 1 && reservations.Any(x =>
                x.ReservedDate.Month == customer.BirthDate.Value.Month &&
                x.ReservedDate.Day == customer.BirthDate.Value.Day);

            if (shouldSend && !firstBirthdayReservation && customer.ReservationCount > 1)
                result.Add(BuildCandidate(customer, settings.Birthday, "birthday", customerKey, birthdayThisYear));
        }

        var lastVisit = reservations.LastOrDefault()?.ReservedDate;

        if (settings.Loyalty.Enabled && lastVisit.HasValue)
        {
            var from = today.AddDays(-settings.Loyalty.WindowDays);
            var visits = reservations.Count(x => x.ReservedDate >= from && x.ReservedDate <= today);
            if (visits >= settings.Loyalty.RequiredVisits)
                result.Add(BuildCandidate(customer, settings.Loyalty, "loyalty", customerKey, lastVisit.Value));
        }

        if (settings.Winback.Enabled)
        {
            var recentVisits = reservations.Count(x => x.ReservedDate >= today.AddDays(-settings.Winback.HistoryDays) && x.ReservedDate <= today);
            if (lastVisit.HasValue &&
                today.DayNumber - lastVisit.Value.DayNumber >= settings.Winback.AbsenceDays &&
                recentVisits >= settings.Winback.MinVisitsInHistory)
            {
                result.Add(BuildCandidate(customer, settings.Winback, "winback", customerKey, lastVisit.Value));
            }
        }

        return result;
    }

    private static MarketingCandidate BuildCandidate(CustomerProfile customer, MarketingCampaignSettings campaign, string key, string customerKey, DateOnly date)
    {
        var subject = ApplyTemplate(campaign.Subject, customer, campaign, date, html: false);
        var html = ApplyTemplate(campaign.HtmlTemplate, customer, campaign, date, html: true);
        return new MarketingCandidate(
            key,
            customerKey,
            customer.Email ?? string.Empty,
            customer.GuestName ?? string.Empty,
            date,
            campaign.DiscountPercent,
            subject,
            html);
    }

    private static string ApplyTemplate(string template, CustomerProfile customer, MarketingCampaignSettings campaign, DateOnly date, bool html)
    {
        var guest = html ? WebUtility.HtmlEncode(customer.GuestName ?? "приятелю") : customer.GuestName ?? "приятелю";
        return (template ?? string.Empty)
            .Replace("{{guestName}}", guest)
            .Replace("{{discountPercent}}", campaign.DiscountPercent.ToString("0.##"))
            .Replace("{{date}}", date.ToString("dd.MM.yyyy"))
            .Replace("{{restaurantName}}", "Casa di Fratelli");
    }

    private static string CustomerKey(CustomerProfile customer)
    {
        return !string.IsNullOrWhiteSpace(customer.Email)
            ? customer.Email.Trim().ToLowerInvariant()
            : (customer.Phone ?? string.Empty).Trim().ToLowerInvariant();
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

public record MarketingRunResult(int Candidates, int Sent, int SkippedAlreadySent, List<MarketingCandidate> Preview);

public record MarketingCandidate(
    string CampaignKey,
    string CustomerKey,
    string Email,
    string GuestName,
    DateOnly SentForDate,
    decimal DiscountPercent,
    string Subject,
    string Html);

public class MarketingSettings
{
    public MarketingCampaignSettings Birthday { get; set; } = new();
    public MarketingCampaignSettings Loyalty { get; set; } = new();
    public MarketingCampaignSettings Winback { get; set; } = new();

    public MarketingSettings Normalize()
    {
        Birthday = Birthday.Normalize(Default().Birthday);
        Loyalty = Loyalty.Normalize(Default().Loyalty);
        Winback = Winback.Normalize(Default().Winback);
        return this;
    }

    public static MarketingSettings Default() => new()
    {
        Birthday = new MarketingCampaignSettings
        {
            Enabled = true,
            DiscountPercent = 5,
            DaysBefore = 5,
            Subject = "Подарък за рождения Ви ден · Casa di Fratelli",
            HtmlTemplate = """
                <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
                  <h2>{{restaurantName}} помни Вашия рожден ден</h2>
                  <p>Здравейте, {{guestName}},</p>
                  <p>Искаме да Ви поканим да отпразнувате рождения си ден при нас. Подготвили сме подаръчна отстъпка <strong>{{discountPercent}}%</strong> за Вашия празник.</p>
                  <p>Очакваме Ви с удоволствие в Casa di Fratelli.</p>
                </div>
                """
        },
        Loyalty = new MarketingCampaignSettings
        {
            Enabled = true,
            DiscountPercent = 5,
            WindowDays = 30,
            RequiredVisits = 4,
            Subject = "Вашият комплимент като редовен гост · Casa di Fratelli",
            HtmlTemplate = """
                <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
                  <h2>Благодарим Ви, {{guestName}}</h2>
                  <p>Забелязахме, че често избирате {{restaurantName}}. За нас това е чест.</p>
                  <p>При следващото Ви посещение Ви очаква комплимент: <strong>{{discountPercent}}% отстъпка</strong>.</p>
                </div>
                """
        },
        Winback = new MarketingCampaignSettings
        {
            Enabled = true,
            DiscountPercent = 5,
            AbsenceDays = 30,
            HistoryDays = 90,
            MinVisitsInHistory = 4,
            Subject = "Липсвате ни · Casa di Fratelli",
            HtmlTemplate = """
                <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">
                  <h2>Липсвате ни, {{guestName}}</h2>
                  <p>Отдавна не сме Ви посрещали в {{restaurantName}} и ще се радваме да Ви видим отново.</p>
                  <p>Като наш гост Ви предлагаме <strong>{{discountPercent}}% отстъпка</strong> при следващото посещение.</p>
                </div>
                """
        }
    };
}

public class MarketingCampaignSettings
{
    public bool Enabled { get; set; } = true;
    public decimal DiscountPercent { get; set; } = 5;
    public int DaysBefore { get; set; } = 5;
    public int WindowDays { get; set; } = 30;
    public int RequiredVisits { get; set; } = 4;
    public int AbsenceDays { get; set; } = 30;
    public int HistoryDays { get; set; } = 90;
    public int MinVisitsInHistory { get; set; } = 4;
    public string Subject { get; set; } = string.Empty;
    public string HtmlTemplate { get; set; } = string.Empty;

    public MarketingCampaignSettings Normalize(MarketingCampaignSettings fallback)
    {
        DiscountPercent = Math.Clamp(DiscountPercent, 0, 90);
        DaysBefore = Math.Clamp(DaysBefore, 0, 60);
        WindowDays = Math.Clamp(WindowDays, 1, 365);
        RequiredVisits = Math.Clamp(RequiredVisits, 1, 100);
        AbsenceDays = Math.Clamp(AbsenceDays, 1, 365);
        HistoryDays = Math.Clamp(HistoryDays, 1, 730);
        MinVisitsInHistory = Math.Clamp(MinVisitsInHistory, 1, 100);
        if (string.IsNullOrWhiteSpace(Subject)) Subject = fallback.Subject;
        if (string.IsNullOrWhiteSpace(HtmlTemplate)) HtmlTemplate = fallback.HtmlTemplate;
        return this;
    }
}
