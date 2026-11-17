using System.Text;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Net.Http.Headers;

namespace SeatMap.Api.Services.Reservations;

public sealed record ReservationSpeechAudio(byte[] Bytes, string ContentType, string Extension, string Language, string Field)
{
    public const int MaxAudioBytes = 5 * 1024 * 1024;
    public const int MaxRequestBytes = MaxAudioBytes + 16 * 1024;
    private static readonly HashSet<string> Fields = ["guestName", "phone", "reservedDate", "reservedTime", "guestCount", "email"];

    // Deliberately avoid Request.Form / IFormFile: ASP.NET buffers larger form
    // files to disk. This bounded reader runs only after admin authorization.
    public static async Task<ReservationSpeechAudio> ReadAsync(HttpRequest request, CancellationToken token)
    {
        if (request.ContentLength > MaxRequestBytes) throw Error("audio-too-large", 413);
        if (!MediaTypeHeaderValue.TryParse(request.ContentType, out var media) ||
            !media.MediaType.Equals("multipart/form-data", StringComparison.OrdinalIgnoreCase)) throw Error("invalid-audio");
        var boundary = HeaderUtilities.RemoveQuotes(media.Boundary).Value;
        if (string.IsNullOrWhiteSpace(boundary) || boundary.Length > 128) throw Error("invalid-audio");
        var reader = new MultipartReader(boundary, request.Body)
        { HeadersCountLimit = 8, HeadersLengthLimit = 4096, BodyLengthLimit = MaxRequestBytes };
        byte[]? audio = null;
        string? mime = null, language = null, field = null;
        var names = new HashSet<string>(StringComparer.Ordinal);
        try
        {
            while (await reader.ReadNextSectionAsync(token) is { } part)
            {
                if (!ContentDispositionHeaderValue.TryParse(part.ContentDisposition, out var disposition) ||
                    !disposition.DispositionType.Equals("form-data", StringComparison.OrdinalIgnoreCase)) throw Error("invalid-audio");
                var name = HeaderUtilities.RemoveQuotes(disposition.Name).Value ?? string.Empty;
                if (!names.Add(name) || names.Count > 3 || name is not ("audio" or "language" or "field")) throw Error("invalid-audio");
                if (name == "audio")
                {
                    if (!MediaTypeHeaderValue.TryParse(part.ContentType, out var audioType)) throw Error("invalid-audio");
                    mime = audioType.MediaType.Value?.ToLowerInvariant();
                    audio = await ReadBoundedAsync(part.Body, MaxAudioBytes, token);
                }
                else
                {
                    var value = Encoding.UTF8.GetString(await ReadBoundedAsync(part.Body, 80, token)).Trim();
                    if (name == "language") language = value; else field = value;
                }
            }
            language = language?.ToLowerInvariant() switch
            { "bg" or "bg-bg" => "bg", "ru" or "ru-ru" => "ru", "en" or "en-gb" or "en-us" => "en", _ => null };
            if (language is null) throw Error("invalid-language");
            if (field is null || !Fields.Contains(field)) throw Error("invalid-field");
            var extension = audio is null ? null : ExtensionFor(audio, mime);
            if (audio is null || extension is null) throw Error("invalid-audio");
            return new(audio, mime!, extension, language, field);
        }
        catch
        {
            if (audio is not null) Array.Clear(audio);
            throw;
        }
    }

    public static string? ExtensionFor(ReadOnlySpan<byte> data, string? mime)
    {
        if (data.Length < 12) return null;
        return mime switch
        {
            "audio/wav" or "audio/x-wav" or "audio/wave" when data[..4].SequenceEqual("RIFF"u8) && data.Slice(8, 4).SequenceEqual("WAVE"u8) => ".wav",
            "audio/mp4" or "audio/x-m4a" when data.Slice(4, 4).SequenceEqual("ftyp"u8) => ".m4a",
            "audio/webm" when data[..4].SequenceEqual(new byte[] { 0x1a, 0x45, 0xdf, 0xa3 }) => ".webm",
            "audio/ogg" when data[..4].SequenceEqual("OggS"u8) => ".ogg",
            _ => null
        };
    }

    public static async Task<byte[]> ReadBoundedAsync(Stream stream, int maximum, CancellationToken token)
    {
        using var memory = new MemoryStream();
        var buffer = new byte[16 * 1024];
        try
        {
            int count;
            while ((count = await stream.ReadAsync(buffer, token)) > 0)
            {
                if (memory.Length + count > maximum) throw Error("audio-too-large", 413);
                await memory.WriteAsync(buffer.AsMemory(0, count), token);
            }
            return memory.ToArray();
        }
        finally
        {
            Array.Clear(buffer);
            if (memory.TryGetBuffer(out var bytes)) Array.Clear(bytes.Array!);
        }
    }

    private static ReservationSpeechException Error(string code, int status = 400) => new(code, status);
}
