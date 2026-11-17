using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace SeatMap.Api.Services.Reservations;

public sealed class ReservationSpeechService(HttpClient http, IOptions<ReservationSpeechOptions> options, IHostEnvironment environment)
{
    public bool IsConfigured => options.Value.Endpoint(environment.IsDevelopment()) is not null;

    public async Task<string> TranscribeAsync(ReservationSpeechAudio audio, CancellationToken token)
    {
        var endpoint = options.Value.Endpoint(environment.IsDevelopment());
        if (endpoint is null) throw new ReservationSpeechException("unavailable", 503);
        // Only the explicitly configured private worker receives the recording.
        // Its token and internal address never become part of the client response.
        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.Value.ServiceToken);
        using var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(audio.Bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(audio.ContentType);
        content.Add(file, "file", $"reservation{audio.Extension}");
        content.Add(new StringContent(audio.Language), "language");
        content.Add(new StringContent(audio.Field), "field");
        request.Content = content;
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
        deadline.CancelAfter(TimeSpan.FromSeconds(20));
        try
        {
            using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, deadline.Token);
            if (!response.IsSuccessStatusCode)
            {
                // Never expose worker error bodies, URLs, transcripts or tokens.
                throw new ReservationSpeechException(response.StatusCode switch
                {
                    System.Net.HttpStatusCode.TooManyRequests => "busy",
                    System.Net.HttpStatusCode.UnprocessableEntity => "no-speech",
                    System.Net.HttpStatusCode.RequestEntityTooLarge => "audio-too-large",
                    _ => "recognition-unavailable"
                }, response.StatusCode switch
                { System.Net.HttpStatusCode.TooManyRequests => 429, System.Net.HttpStatusCode.UnprocessableEntity => 422,
                    System.Net.HttpStatusCode.RequestEntityTooLarge => 413, _ => 502 });
            }
            await using var stream = await response.Content.ReadAsStreamAsync(deadline.Token);
            byte[] bytes;
            try { bytes = await ReservationSpeechAudio.ReadBoundedAsync(stream, 16 * 1024, deadline.Token); }
            catch (ReservationSpeechException) { throw new ReservationSpeechException("recognition-unavailable", 502); }
            try
            {
                using var json = JsonDocument.Parse(bytes);
                if (json.RootElement.ValueKind != JsonValueKind.Object) throw new ReservationSpeechException("recognition-unavailable", 502);
                var text = json.RootElement.TryGetProperty("text", out var value) && value.ValueKind == JsonValueKind.String ? value.GetString()?.Trim() : null;
                if (string.IsNullOrWhiteSpace(text)) throw new ReservationSpeechException("no-speech", 422);
                if (text.Length > 2000) throw new ReservationSpeechException("recognition-unavailable", 502);
                return text;
            }
            finally { Array.Clear(bytes); }
        }
        catch (OperationCanceledException) when (!token.IsCancellationRequested) { throw new ReservationSpeechException("timeout", 504); }
        catch (HttpRequestException) { throw new ReservationSpeechException("recognition-unavailable", 502); }
        catch (IOException) { throw new ReservationSpeechException("recognition-unavailable", 502); }
        catch (JsonException) { throw new ReservationSpeechException("recognition-unavailable", 502); }
    }
}
