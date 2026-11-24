using System.Net.Http.Headers;

namespace SeatMap.Api.Services.Waitlist;

// Guest-requested availability alerts use the existing SeatMap account sender,
// independently of restaurant staff/marketing notification settings.
public sealed class WaitlistEmailSender(HttpClient http, IConfiguration configuration, ILogger<WaitlistEmailSender> logger)
{
    public async Task<bool> SendAsync(string email, string subject, string html, Guid offerId, CancellationToken ct)
    {
        var key = configuration["Platform:Email:ApiKey"] ?? configuration["RESEND_API_KEY"];
        var from = configuration["Platform:Email:From"] ?? configuration["FROM_EMAIL"] ?? "SeatMap <reservations@casadifratelli.bg>";
        if (string.IsNullOrWhiteSpace(key)) { logger.LogWarning("Waitlist account email transport is not configured."); return false; }
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
        request.Headers.Add("Idempotency-Key", $"waitlist-{offerId:N}");
        request.Content = JsonContent.Create(new { from, to = new[] { email }, subject, html });
        try
        {
            using var response = await http.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode) logger.LogWarning("Waitlist email delivery failed: HTTP {Status}", (int)response.StatusCode);
            return response.IsSuccessStatusCode;
        }
        catch (Exception error) when (error is HttpRequestException or TaskCanceledException)
        { logger.LogWarning("Waitlist email transport unavailable."); return false; }
    }
}
