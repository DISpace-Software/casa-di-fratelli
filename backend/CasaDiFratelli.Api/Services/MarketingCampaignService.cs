using CasaDiFratelli.Api.Services.Tenancy;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
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
    private readonly TenantBrandingService _branding;
    private TenantBrandingSettings _brand = new();

    public MarketingCampaignService(AppDbContext db, EmailService email, TenantBrandingService branding)
    {
        _db = db;
        _email = email;
        _branding = branding;
    }

    public async Task<MarketingSettings> GetSettingsAsync()
    {
        var setting = await _db.AppSettings.AsNoTracking().FirstOrDefaultAsync(x => x.Key == SettingsKey);
        if (setting == null || string.IsNullOrWhiteSpace(setting.Value))
            return MarketingSettings.Default();

        try
        {
            return (JsonSerializer.Deserialize<MarketingSettings>(setting.Value, JsonOptions) ?? MarketingSettings.Default()).Normalize();
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
        _brand = await _branding.GetAsync();
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

            var delivered = await _email.TrySendMarketingAsync(
                candidate.Email,
                candidate.Subject,
                candidate.Html,
                BuildIdempotencyKey(candidate));
            if (!delivered)
            {
                skipped++;
                continue;
            }
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

    public async Task<BirthdaySendResult> SendBirthdayAsync(int customerId)
    {
        var customer = await _db.CustomerProfiles.FirstOrDefaultAsync(x => x.Id == customerId);
        if (customer == null) return new BirthdaySendResult(false, false, "Customer not found.", null, null);
        if (!customer.BirthDate.HasValue) return new BirthdaySendResult(false, false, "Customer birthday is missing.", null, null);
        if (!customer.MarketingConsent) return new BirthdaySendResult(false, false, "Customer has not consented to marketing emails.", null, null);
        if (string.IsNullOrWhiteSpace(customer.Email)) return new BirthdaySendResult(false, false, "Customer email is missing.", null, null);

        var today = GetRestaurantToday();
        var birthday = MarketingBirthdayRules.NextBirthday(customer.BirthDate.Value, today);
        var settings = await GetSettingsAsync();
        var candidate = BuildBirthdayCandidate(customer, settings.Birthday, CustomerKey(customer), birthday, today);
        var existing = await _db.MarketingMessageLogs
            .Where(x => x.CampaignKey == "birthday" && x.CustomerKey == candidate.CustomerKey && x.SentForDate == birthday)
            .OrderByDescending(x => x.SentAtUtc)
            .FirstOrDefaultAsync();
        if (existing != null)
            return new BirthdaySendResult(false, true, "Birthday email was already sent for this birthday.", existing.SentAtUtc, birthday);

        var delivered = await _email.TrySendMarketingAsync(candidate.Email, candidate.Subject, candidate.Html, BuildIdempotencyKey(candidate));
        if (!delivered)
            return new BirthdaySendResult(false, false, "Resend did not confirm delivery.", null, birthday);

        var sentAt = DateTime.UtcNow;
        _db.MarketingMessageLogs.Add(new MarketingMessageLog
        {
            CampaignKey = candidate.CampaignKey,
            CustomerKey = candidate.CustomerKey,
            Email = candidate.Email,
            SentForDate = candidate.SentForDate,
            SentAtUtc = sentAt,
            Subject = candidate.Subject,
            DiscountPercent = candidate.DiscountPercent
        });
        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            var loggedAt = await _db.MarketingMessageLogs.AsNoTracking()
                .Where(x => x.CampaignKey == "birthday" && x.CustomerKey == candidate.CustomerKey && x.SentForDate == birthday)
                .Select(x => (DateTime?)x.SentAtUtc)
                .FirstOrDefaultAsync();
            return new BirthdaySendResult(false, true, "Birthday email was already sent for this birthday.", loggedAt, birthday);
        }

        return new BirthdaySendResult(true, false, "Birthday email sent.", sentAt, birthday);
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
            var birthday = MarketingBirthdayRules.NextBirthday(customer.BirthDate.Value, today);
            if (MarketingBirthdayRules.IsWithinSendingWindow(birthday, today, settings.Birthday.DaysBefore))
                result.Add(BuildBirthdayCandidate(customer, settings.Birthday, customerKey, birthday, today));
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

    private MarketingCandidate BuildCandidate(CustomerProfile customer, MarketingCampaignSettings campaign, string key, string customerKey, DateOnly date)
    {
        var subject = ApplyTemplate(campaign.Subject, customer, campaign, date);
        var message = ApplyTemplate(campaign.HtmlTemplate, customer, campaign, date);
        var html = BuildEmailHtml(message);
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

    private MarketingCandidate BuildBirthdayCandidate(
        CustomerProfile customer,
        MarketingCampaignSettings campaign,
        string customerKey,
        DateOnly birthday,
        DateOnly today)
    {
        var days = birthday.DayNumber - today.DayNumber;
        var timing = days == 0
            ? $"днес, {birthday:dd.MM.yyyy}"
            : $"след {days} {(days == 1 ? "ден" : "дни")}, на {birthday:dd.MM.yyyy}";
        var subject = ApplyTemplate(campaign.Subject, customer, campaign, birthday)
            .Replace("{{birthdayTiming}}", timing);
        var configuredMessage = ApplyTemplate(campaign.HtmlTemplate, customer, campaign, birthday)
            .Replace("{{birthdayTiming}}", timing);
        configuredMessage = Regex.Replace(configuredMessage, @"след\s+\d+\s+дни", timing, RegexOptions.IgnoreCase);
        configuredMessage = Regex.Replace(configuredMessage, @"через\s+\d+\s+д(?:ень|ня|ней)", timing, RegexOptions.IgnoreCase);
        configuredMessage = Regex.Replace(configuredMessage, @"in\s+\d+\s+days?", timing, RegexOptions.IgnoreCase);
        var message = $"Вашият рожден ден е {timing}.\n\n{configuredMessage}";
        return new MarketingCandidate("birthday", customerKey, customer.Email ?? string.Empty,
            customer.GuestName ?? string.Empty, birthday, campaign.DiscountPercent, subject, BuildEmailHtml(message));
    }

    private string BuildIdempotencyKey(MarketingCandidate candidate)
    {
        var identity = $"{candidate.CampaignKey}|{candidate.CustomerKey}|{candidate.SentForDate:yyyy-MM-dd}";
        if (!_branding.IsCasa) identity = $"{_branding.TenantId}|{identity}";
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity))).ToLowerInvariant();
        return $"casa-marketing-{hash}";
    }

    private string ApplyTemplate(string template, CustomerProfile customer, MarketingCampaignSettings campaign, DateOnly date)
    {
        var guest = customer.GuestName ?? "приятелю";
        return (template ?? string.Empty)
            .Replace("{{guestName}}", guest)
            .Replace("{{discountPercent}}", campaign.DiscountPercent.ToString("0.##"))
            .Replace("{{date}}", date.ToString("dd.MM.yyyy"))
            .Replace("{{restaurantName}}", _brand.Name)
            .Replace("Casa di Fratelli", _brand.Name);
    }

    private string BuildEmailHtml(string message)
    {
        var paragraphs = (message ?? string.Empty)
            .Replace("\r\n", "\n")
            .Split("\n\n", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(paragraph => WebUtility.HtmlEncode(paragraph).Replace("\n", "<br>"))
            .ToList();

        if (paragraphs.Count == 0)
            paragraphs.Add(WebUtility.HtmlEncode($"Очакваме Ви в {_brand.Name}."));

        var body = string.Join("\n", paragraphs.Select(paragraph => $"<p>{paragraph}</p>"));

        return $$"""
            <div style="font-family:Arial,sans-serif;line-height:1.65;color:#1f2937;background:#fffaf1;padding:28px;border-radius:18px">
              <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#a87328;font-weight:700;margin-bottom:14px">{{WebUtility.HtmlEncode(_brand.Name)}}</div>
              <div style="font-size:16px">{{body}}</div>
              <div style="margin-top:24px;padding-top:18px;border-top:1px solid #eadcc6;color:#7a6b5c;font-size:13px">С уважение,<br>екипът на {{WebUtility.HtmlEncode(_brand.Name)}}</div>
            </div>
            """;
    }

    private static string CustomerKey(CustomerProfile customer)
    {
        return !string.IsNullOrWhiteSpace(customer.Email)
            ? customer.Email.Trim().ToLowerInvariant()
            : (customer.Phone ?? string.Empty).Trim().ToLowerInvariant();
    }

    private DateOnly GetRestaurantToday()
    {
        try
        {
            var timezone = TimeZoneInfo.FindSystemTimeZoneById(_brand.TimeZoneId);
            return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, timezone));
        }
        catch
        {
            return DateOnly.FromDateTime(DateTime.Now);
        }
    }
}

public record MarketingRunResult(int Candidates, int Sent, int SkippedAlreadySent, List<MarketingCandidate> Preview);

public record BirthdaySendResult(bool Sent, bool AlreadySent, string Message, DateTime? SentAtUtc, DateOnly? BirthdayDate);

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
                Здравейте, {{guestName}},

                {{restaurantName}} помни Вашия рожден ден и с удоволствие Ви кани да отпразнувате този специален момент при нас.

                Подготвили сме подаръчна отстъпка {{discountPercent}}% за Вашия празник. Очакваме Ви с топла атмосфера, хубава храна и внимание към всеки детайл.
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
                Здравейте, {{guestName}},

                Благодарим Ви, че често избирате {{restaurantName}}. За нас е истинско удоволствие да Ви посрещаме отново.

                Като наш редовен гост Ви очаква комплимент: {{discountPercent}}% отстъпка при следващото Ви посещение.
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
                Здравейте, {{guestName}},

                Отдавна не сме Ви посрещали в {{restaurantName}} и ще се радваме да Ви видим отново.

                Подготвили сме за Вас {{discountPercent}}% отстъпка като малък жест от нашия екип. Заповядайте, когато Ви е удобно.
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
        HtmlTemplate = NormalizeMessageTemplate(HtmlTemplate, fallback.HtmlTemplate);
        return this;
    }

    private static string NormalizeMessageTemplate(string value, string fallback)
    {
        var text = StripLegacyHtml(value);
        return string.IsNullOrWhiteSpace(text) ? fallback : text.Trim();
    }

    private static string StripLegacyHtml(string value)
    {
        if (string.IsNullOrWhiteSpace(value) || !value.Contains('<'))
            return value ?? string.Empty;

        var text = value
            .Replace("<br>", "\n", StringComparison.OrdinalIgnoreCase)
            .Replace("<br/>", "\n", StringComparison.OrdinalIgnoreCase)
            .Replace("<br />", "\n", StringComparison.OrdinalIgnoreCase)
            .Replace("</p>", "\n\n", StringComparison.OrdinalIgnoreCase)
            .Replace("</h2>", "\n\n", StringComparison.OrdinalIgnoreCase);

        var result = new System.Text.StringBuilder();
        var insideTag = false;
        foreach (var character in text)
        {
            if (character == '<')
            {
                insideTag = true;
                continue;
            }

            if (character == '>')
            {
                insideTag = false;
                continue;
            }

            if (!insideTag)
                result.Append(character);
        }

        return WebUtility.HtmlDecode(result.ToString())
            .Replace("\n\n\n", "\n\n")
            .Trim();
    }
}
