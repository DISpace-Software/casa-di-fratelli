using CasaDiFratelli.Api.Services.Tenancy;
using System.Net.Http.Headers;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace CasaDiFratelli.Api.Services;

public class EmailService
{
    private const string DefaultFromEmail = "Casa di Fratelli <reservations@mail.casadifratelli.bg>";
    private const string DefaultMarketingFromEmail = "Casa di Fratelli <offers@mail.casadifratelli.bg>";
    private readonly TenantBrandingService _branding;
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<EmailService> _logger;

    public EmailService(
        HttpClient httpClient,
        IConfiguration configuration,
        ILogger<EmailService> logger,
        TenantBrandingService branding)
    {
        _branding = branding;
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task SendAsync(string to, string subject, string html)
    {
        await SendInternalAsync(to, subject, html, isMarketing: false);
    }

    public async Task SendMarketingAsync(string to, string subject, string html)
    {
        await SendInternalAsync(to, subject, html, isMarketing: true);
    }

    public Task<bool> TrySendMarketingAsync(string to, string subject, string html, string idempotencyKey)
    {
        return SendInternalAsync(to, subject, html, isMarketing: true, idempotencyKey);
    }

    private async Task<bool> SendInternalAsync(string to, string subject, string html, bool isMarketing, string? idempotencyKey = null)
    {
        try
        {
            var apiKey = _branding.GetEmailConfiguration("RESEND_API_KEY");
            var fromEmail = isMarketing
                ? _branding.GetEmailConfiguration("MARKETING_FROM_EMAIL")
                : _branding.GetEmailConfiguration("FROM_EMAIL");

            if (string.IsNullOrWhiteSpace(fromEmail))
            {
                fromEmail = _branding.IsCasa ? (isMarketing ? DefaultMarketingFromEmail : DefaultFromEmail) : null;
                if (string.IsNullOrWhiteSpace(fromEmail))
                {
                    _logger.LogError("Email sender is not configured for the current tenant.");
                    return false;
                }
            }

            if (string.IsNullOrWhiteSpace(apiKey))
            {
                _logger.LogWarning("Email was not sent because RESEND_API_KEY is missing.");
                return false;
            }

            if (string.IsNullOrWhiteSpace(to))
            {
                _logger.LogWarning("Email was not sent because recipient is empty.");
                return false;
            }

            var replyTo = _branding.GetEmailConfiguration("REPLY_TO_EMAIL");
            var unsubscribeEmail = _branding.GetEmailConfiguration("UNSUBSCRIBE_EMAIL");
            if (string.IsNullOrWhiteSpace(unsubscribeEmail))
                unsubscribeEmail = replyTo;

            var finalHtml = html;
            var headers = new Dictionary<string, string>();

            if (isMarketing && !string.IsNullOrWhiteSpace(unsubscribeEmail))
            {
                var encodedEmail = WebUtility.HtmlEncode(unsubscribeEmail);
                finalHtml += $"""
                    <div style="max-width:640px;margin:16px auto 0;color:#6b7280;font-family:Arial,sans-serif;font-size:12px;text-align:center">
                      Получавате това писмо, защото сте дали съгласие за маркетингови съобщения.
                      <a href="mailto:{encodedEmail}?subject=unsubscribe" style="color:#6b7280">Отписване</a>
                    </div>
                    """;
                headers["List-Unsubscribe"] = $"<mailto:{unsubscribeEmail}?subject=unsubscribe>";
            }

            var payload = new Dictionary<string, object?>
            {
                ["from"] = fromEmail,
                ["to"] = new[] { to },
                ["subject"] = subject,
                ["html"] = finalHtml,
                ["text"] = ToPlainText(finalHtml)
            };

            if (!string.IsNullOrWhiteSpace(replyTo))
                payload["reply_to"] = replyTo;

            if (headers.Count > 0)
                payload["headers"] = headers;

            using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
            if (!string.IsNullOrWhiteSpace(idempotencyKey))
                request.Headers.Add("Idempotency-Key", idempotencyKey);
            request.Content = new StringContent(
                JsonSerializer.Serialize(payload),
                Encoding.UTF8,
                "application/json"
            );

            using var response = await _httpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync();
                _logger.LogError("Failed to send email via Resend. Status: {Status}. Body: {Body}", response.StatusCode, error);
                return false;
            }

            _logger.LogInformation("Email sent via Resend to {Recipient} with subject {Subject}.", to, subject);
            return true;
        }
        catch (Exception error)
        {
            _logger.LogError(error, "Email sending failed before the request could complete.");
            return false;
        }
    }

    private static string ToPlainText(string html)
    {
        var withVisibleLinks = Regex.Replace(
            html ?? string.Empty,
            """<a\b[^>]*\bhref\s*=\s*["'](?<url>[^"']+)["'][^>]*>(?<label>.*?)</a>""",
            match =>
            {
                var label = Regex.Replace(match.Groups["label"].Value, "<[^>]+>", " ").Trim();
                var url = WebUtility.HtmlDecode(match.Groups["url"].Value);
                return $"{label} ({url})";
            },
            RegexOptions.IgnoreCase | RegexOptions.Singleline);
        var withLineBreaks = Regex.Replace(
            withVisibleLinks,
            @"<(br\s*/?|/p|/div|/h[1-6]|/li)>",
            "\n",
            RegexOptions.IgnoreCase);
        var withoutTags = Regex.Replace(withLineBreaks, "<[^>]+>", " ");
        var decoded = WebUtility.HtmlDecode(withoutTags);
        var normalizedLines = decoded
            .Replace("\r\n", "\n")
            .Split('\n')
            .Select(line => Regex.Replace(line, @"\s+", " ").Trim())
            .Where(line => line.Length > 0);

        return string.Join("\n\n", normalizedLines);
    }
}
