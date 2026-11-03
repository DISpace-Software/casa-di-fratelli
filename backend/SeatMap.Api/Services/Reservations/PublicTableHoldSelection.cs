using System.Text.Json;

namespace SeatMap.Api.Services.Reservations;

public static class PublicTableHoldSelection
{
    public static List<string> DeserializeTableIds(string? value)
    {
        try { return JsonSerializer.Deserialize<List<string>>(value ?? "[]") ?? new(); }
        catch (JsonException) { return new(); }
    }
}
