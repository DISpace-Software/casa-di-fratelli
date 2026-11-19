using System.Net.Http.Headers;
using System.Net.Http.Json;

namespace SeatMap.Api.Platform.Auth;

// Platform mail deliberately bypasses restaurant-specific notification switches.
public interface IGuestEmailSender
{
    Task<bool> SendCodeAsync(string email, string code, string purpose, string language, Guid challengeId, CancellationToken ct);
}
public sealed class GuestEmailSender(HttpClient http, IConfiguration configuration, ILogger<GuestEmailSender> log) : IGuestEmailSender
{
    public async Task<bool> SendCodeAsync(string email, string code, string purpose, string language, Guid challengeId, CancellationToken ct)
    {
        var key = configuration["Platform:Email:ApiKey"] ?? configuration["RESEND_API_KEY"];
        var from = configuration["Platform:Email:From"] ?? configuration["FROM_EMAIL"] ?? "SeatMap <reservations@casadifratelli.bg>";
        if (string.IsNullOrWhiteSpace(key)) { log.LogError("Platform email transport is not configured."); return false; }
        var reset = purpose == "reset";
        var title = language switch {
            "bg" => reset ? "Възстановяване на парола" : "Потвърдете имейла си",
            "ru" => reset ? "Восстановление пароля" : "Подтвердите почту",
            _ => reset ? "Reset your password" : "Verify your email"
        };
        var help = language switch {
            "bg" => "Въведете кода в SeatMap. Валиден е 10 минути. Не го споделяйте. Ако не сте поискали този код, игнорирайте писмото.",
            "ru" => "Введите код в SeatMap. Он действует 10 минут. Никому не сообщайте код. Если вы его не запрашивали, проигнорируйте письмо.",
            _ => "Enter this code in SeatMap. It expires in 10 minutes. Never share it. If you did not request this code, ignore this email."
        };
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
        request.Headers.Add("Idempotency-Key", $"guest-email-{challengeId:N}");
        request.Content = JsonContent.Create(new { from, to = new[] { email }, subject = $"{title} · SeatMap",
            html = $"<div style='background:#10101f;color:#f5f1ff;padding:32px;font-family:Arial,sans-serif;border-radius:20px'><h2>SeatMap</h2><h3>{title}</h3><p style='font-size:34px;letter-spacing:10px;color:#c6afff'>{code}</p><p>{help}</p></div>",
            text = $"SeatMap\n{title}\n{code}\n{help}" });
        try {
            using var response = await http.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode) log.LogWarning("Platform email delivery failed: HTTP {Status}", (int)response.StatusCode);
            return response.IsSuccessStatusCode;
        } catch (Exception error) when (error is HttpRequestException or TaskCanceledException) {
            log.LogWarning("Platform email transport unavailable."); return false;
        }
    }
}
