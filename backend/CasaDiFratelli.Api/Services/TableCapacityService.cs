namespace CasaDiFratelli.Api.Services;

public static class TableCapacityService
{
    private static readonly HashSet<string> RetiredTableIds = new(StringComparer.OrdinalIgnoreCase)
    {
        "30A", "34A", "45A"
    };

    private static readonly Dictionary<string, int> Capacities = new(StringComparer.OrdinalIgnoreCase)
    {
        ["1"] = 4, ["2"] = 4, ["3"] = 4, ["4"] = 4,
        ["5"] = 6, ["6"] = 6,
        ["7"] = 4, ["8"] = 6, ["9"] = 6, ["10"] = 6, ["11"] = 6,
        ["20"] = 4, ["21"] = 4, ["22"] = 4, ["23"] = 4,
        ["24"] = 6, ["25"] = 6, ["26"] = 4, ["27"] = 4, ["28"] = 6, ["29"] = 6,
        ["30"] = 4, ["31"] = 4, ["32"] = 4, ["33"] = 4,
        ["34"] = 4, ["35"] = 4, ["36"] = 4, ["37"] = 4,
        ["38"] = 4, ["39"] = 4, ["40"] = 4, ["41"] = 4,
        ["42"] = 4, ["43"] = 4, ["44"] = 4, ["45"] = 4,
        ["46"] = 4, ["47"] = 4, ["48"] = 2, ["49"] = 2,
    };

    public static bool IsRetired(string? tableId)
    {
        return !string.IsNullOrWhiteSpace(tableId) && RetiredTableIds.Contains(tableId.Trim());
    }

    public static int GetCapacity(IEnumerable<string> tableIds)
    {
        return tableIds.Sum(tableId => Capacities.TryGetValue(tableId, out var capacity) ? capacity : 0);
    }

    public static bool HasEnoughSeats(IEnumerable<string> tableIds, int guestCount)
    {
        return guestCount <= 0 || GetCapacity(tableIds) >= guestCount;
    }
}
