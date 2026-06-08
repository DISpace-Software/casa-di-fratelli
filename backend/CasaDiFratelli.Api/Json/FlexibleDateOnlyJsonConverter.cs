using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace CasaDiFratelli.Api.Json;

public class FlexibleDateOnlyJsonConverter : JsonConverter<DateOnly>
{
    private static readonly string[] Formats =
    {
        "yyyy-MM-dd",
        "yyyy-MM-ddTHH:mm:ss",
        "yyyy-MM-ddTHH:mm:ss.FFFFFFF",
        "yyyy-MM-ddTHH:mm:ssK",
        "yyyy-MM-ddTHH:mm:ss.FFFFFFFK"
    };

    public override DateOnly Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.String)
            throw new JsonException("Date must be a string.");

        var value = reader.GetString()?.Trim();
        if (string.IsNullOrWhiteSpace(value))
            throw new JsonException("Date is required.");

        if (DateOnly.TryParseExact(value, Formats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
            return date;

        if (value.Length >= 10 &&
            DateOnly.TryParseExact(value[..10], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date))
        {
            return date;
        }

        if (DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var dateTime))
            return DateOnly.FromDateTime(dateTime);

        throw new JsonException("Date must be in yyyy-MM-dd format.");
    }

    public override void Write(Utf8JsonWriter writer, DateOnly value, JsonSerializerOptions options)
    {
        writer.WriteStringValue(value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
    }
}
