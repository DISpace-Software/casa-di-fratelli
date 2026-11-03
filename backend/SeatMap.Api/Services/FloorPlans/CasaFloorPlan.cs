using SeatMap.Api.Dtos;
namespace SeatMap.Api.Services.FloorPlans;

// Compatibility data for Casa only. Never used as a default for another tenant.
internal static class CasaFloorPlan
{
    internal static readonly List<TableLayoutItem> DefaultLayout = new()
    {
        new("42", "garden", 17, 22, 4, false, false, true),
        new("43", "garden", 17, 42, 4, false, false, true),
        new("44", "garden", 17, 62, 4, false, false, true),
        new("45", "garden", 17, 82, 4, false, false, true),
        new("38", "garden", 38, 24, 4, false, false, true),
        new("39", "garden", 38, 44, 4, false, false, true),
        new("40", "garden", 38, 64, 4, false, false, true),
        new("41", "garden", 38, 84, 4, false, false, true),
        new("34", "garden", 59, 24, 4, false, false, true),
        new("35", "garden", 59, 44, 4, false, false, true),
        new("36", "garden", 59, 64, 4, false, false, true),
        new("37", "garden", 59, 84, 4, false, false, true),
        new("30", "garden", 78, 22, 4, false, false, true),
        new("31", "garden", 78, 42, 4, false, false, true),
        new("32", "garden", 78, 62, 4, false, false, true),
        new("33", "garden", 78, 82, 4, false, false, true),
        new("1", "indoor", 83, 12, 4, false, true, true),
        new("2", "indoor", 83, 22, 4, false, true, true),
        new("3", "indoor", 83, 32, 4, false, true, true),
        new("4", "indoor", 83, 42, 4, false, true, true),
        new("5", "indoor", 51, 22, 6, false, true, true),
        new("6", "indoor", 51, 35, 6, false, true, true),
        new("7", "indoor", 16, 10, 4, false, true, true),
        new("8", "indoor", 16, 20, 6, false, true, true),
        new("9", "indoor", 16, 30, 6, false, true, true),
        new("10", "indoor", 16, 40, 6, false, true, true),
        new("11", "indoor", 16, 50, 6, false, true, true),
        new("20", "indoor", 82, 60, 4, false, true, true),
        new("21", "indoor", 82, 70, 4, false, true, true),
        new("22", "indoor", 82, 80, 4, false, true, true),
        new("23", "indoor", 82, 90, 4, false, true, true),
        new("24", "indoor", 53, 65, 6, false, true, true),
        new("25", "indoor", 54, 78, 6, false, false, true),
        new("26", "indoor", 55, 90, 4, false, true, true),
        new("27", "indoor", 35, 92, 4, false, true, true),
        new("28", "indoor", 16, 90, 6, false, true, true),
        new("29", "indoor", 16, 80, 6, false, true, true),

        new("46", "openTerrace", 34, 40, 4, false, false, true),
        new("47", "openTerrace", 66, 40, 4, false, false, true),
        new("48", "openTerrace", 34, 68, 2, true, false, true),
        new("49", "openTerrace", 66, 68, 2, true, false, true),
    };


    internal static FloorPlan Create(List<TableLayoutItem>? tables = null) => new()
    {
        Tables = (tables ?? DefaultLayout).Where(t => !new[] { "30A", "34A", "45A" }.Contains(t.Id, StringComparer.OrdinalIgnoreCase)).ToList(),
        Zones = [new("indoor", "Зала / Непушачи", "casa-indoor", Names: new() { ["bg"] = "Зала / Непушачи", ["en"] = "Hall / Non-smoking", ["ru"] = "Зал / Некурящие" }), new("garden", "Покрита тераса", "casa-garden", Names: new() { ["bg"] = "Покрита тераса", ["en"] = "Covered terrace", ["ru"] = "Крытая терраса" }), new("openTerrace", "Открита тераса", "casa-terrace", Names: new() { ["bg"] = "Открита тераса", ["en"] = "Open terrace", ["ru"] = "Открытая терраса" })],
        Combinations = Combinations()
    };

    private static List<List<string>> Combinations()
    {
        var result = new List<List<string>>();
        foreach (var group in new string[][] { ["42", "43", "44", "45"], ["38", "39", "40", "41"], ["34", "35", "36", "37"], ["30", "31", "32", "33"] })
            for (var start = 0; start < group.Length; start++)
                for (var count = 2; count <= group.Length - start; count++) result.Add(group.Skip(start).Take(count).ToList());
        foreach (var group in new string[][] { ["5", "6"], ["20", "21", "22", "23"], ["28", "29"], ["46", "47"], ["48", "49"] })
            for (var mask = 1; mask < (1 << group.Length); mask++)
            {
                var ids = group.Where((_, index) => (mask & (1 << index)) != 0).ToList();
                if (ids.Count > 1) result.Add(ids);
            }
        return result;
    }
}
