using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using SeatMap.Api.Platform.Auth;
using SeatMap.Api.Services.Waitlist;

internal static class EmailTransportChecks
{
    public static async Task RunAsync()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["RESEND_API_KEY"] = "isolated-test-key",
            ["FROM_EMAIL"] = "Casa <reservations@mail.casadifratelli.bg>",
            ["Platform:Email:From"] = "SeatMap <account@seatmap.bg>",
            ["Platform:Email:ReservationsFrom"] = "SeatMap <reservations@seatmap.bg>",
            ["Platform:Email:ReplyTo"] = "support@seatmap.bg"
        }).Build();
        using var handler = new CaptureHandler();
        using var http = new HttpClient(handler);
        var id = Guid.NewGuid();
        var guest = new GuestEmailSender(http, config, NullLogger<GuestEmailSender>.Instance);
        foreach (var purpose in new[] { "register", "reset" })
        {
            Require(await guest.SendCodeAsync("guest@example.test", "123456", purpose, "bg", id, default), "Account delivery accepted");
            Require(handler.Payload.GetProperty("from").GetString() == "SeatMap <account@seatmap.bg>", "Account uses SeatMap, not restaurant sender");
            Require(handler.Payload.GetProperty("reply_to").GetString() == "support@seatmap.bg", "Account replies go to support");
            Require(handler.Idempotency == $"guest-email-{id:N}", "Account retry preserves idempotency");
        }
        var waitlist = new WaitlistEmailSender(http, config, NullLogger<WaitlistEmailSender>.Instance);
        Require(await waitlist.SendAsync("guest@example.test", "Available", "<p>Available</p>", id, default), "Waitlist delivery accepted");
        Require(handler.Payload.GetProperty("from").GetString() == "SeatMap <reservations@seatmap.bg>", "Waitlist uses reservations sender");
        Require(handler.Payload.GetProperty("reply_to").GetString() == "support@seatmap.bg", "Waitlist replies go to support");
        Require(handler.Idempotency == $"waitlist-{id:N}", "Waitlist retry preserves idempotency");
        handler.Status = HttpStatusCode.UnprocessableEntity;
        Require(!await guest.SendCodeAsync("guest@example.test", "123456", "register", "bg", id, default), "Provider rejection is not reported as delivery");
    }

    private static void Require(bool result, string message)
    {
        if (!result) throw new InvalidOperationException(message);
        Console.WriteLine($"PASS {message}");
    }

    // Tests exercise the exact provider payload without sending external mail.
    private sealed class CaptureHandler : HttpMessageHandler
    {
        public JsonElement Payload { get; private set; }
        public string? Idempotency { get; private set; }
        public HttpStatusCode Status { get; set; } = HttpStatusCode.OK;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            using var document = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct));
            Payload = document.RootElement.Clone();
            Idempotency = request.Headers.GetValues("Idempotency-Key").Single();
            return new HttpResponseMessage(Status);
        }
    }
}
