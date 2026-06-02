using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace CasaDiFratelli.Api.Services;

public class EmailService
{
    private const string DefaultFromEmail = "Casa di Fratelli <noreply@mail.casadifratelli.bg>";
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly ILogger<EmailService> _logger;

    public EmailService(
        HttpClient httpClient,
        IConfiguration configuration,
        ILogger<EmailService> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task SendAsync(string to, string subject, string html)
    {
        try
        {
            var apiKey = _configuration["RESEND_API_KEY"];
            var fromEmail = _configuration["FROM_EMAIL"];

            if (string.IsNullOrWhiteSpace(fromEmail))
            {
                fromEmail = DefaultFromEmail;
            }

            if (string.IsNullOrWhiteSpace(apiKey))
            {
                _logger.LogWarning("Email was not sent because RESEND_API_KEY is missing.");
                return;
            }

            if (string.IsNullOrWhiteSpace(to))
            {
                _logger.LogWarning("Email was not sent because recipient is empty.");
                return;
            }

            var payload = new
            {
                from = fromEmail,
                to = new[] { to },
                subject,
                html
            };

            using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
            request.Content = new StringContent(
                JsonSerializer.Serialize(payload),
                Encoding.UTF8,
                "application/json"
            );

            var response = await _httpClient.SendAsync(request);

            if (!response.IsSuccessStatusCode)
            {
                var error = await response.Content.ReadAsStringAsync();
                _logger.LogError("Failed to send email via Resend. Status: {Status}. Body: {Body}", response.StatusCode, error);
                return;
            }

            _logger.LogInformation("Email sent via Resend to {Recipient} with subject {Subject}.", to, subject);
        }
        catch (Exception error)
        {
            _logger.LogError(error, "Email sending failed before the request could complete.");
        }
    }
}
