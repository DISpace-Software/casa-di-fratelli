using System.ComponentModel.DataAnnotations;
namespace SeatMap.Api.Services.Sommelier;

// Shared catalogue. Profiles must describe a specific wine, not a guessed grape stereotype.
public sealed class SommelierWine
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [Required, StringLength(200)] public string Name { get; set; } = "";
    [Required, StringLength(500)] public string Source { get; set; } = "";
    [RegularExpression("^(white|red|rose|sparkling|dessert)$")] public string Style { get; set; } = "white";
    [Range(0, 5)] public int Body { get; set; }
    [Range(0, 5)] public int Acidity { get; set; }
    [Range(0, 5)] public int Sweetness { get; set; }
    [Range(0, 5)] public int Tannin { get; set; }
    [Range(0, 25)] public decimal Alcohol { get; set; }
    public bool Verified { get; set; }
}
public sealed class SommelierRule
{
    [Key] public string Code { get; set; } = "";
    public int Weight { get; set; }
    public bool Enabled { get; set; } = true;
}
// Stored in the restaurant DB. No client-supplied restaurant ID or price is trusted.
public sealed class SommelierProfile
{
    [Key] public int MenuItemId { get; set; }
    [RegularExpression("^(dish|wine)$")] public string Kind { get; set; } = "dish";
    public Guid? WineId { get; set; }
    [RegularExpression("^(glass|bottle)$")] public string Serving { get; set; } = "bottle";
    public bool Available { get; set; }
    public bool Verified { get; set; }
    [Range(0, 5)] public int Body { get; set; }
    [Range(0, 5)] public int Acidity { get; set; }
    [Range(0, 5)] public int Sweetness { get; set; }
    [Range(0, 5)] public int Fat { get; set; }
    [Range(0, 5)] public int Heat { get; set; }
    [Range(0, 5)] public int Umami { get; set; }
    [StringLength(500)] public string Notes { get; set; } = "";
    public DateTime UpdatedAtUtc { get; set; }
}
public sealed class SommelierRequest
{
    [Range(1, int.MaxValue)] public int DishId { get; set; }
    [Range(1, 10000000)] public int? MaxPriceMinor { get; set; }
    [RegularExpression("^(glass|bottle)$")] public string? Serving { get; set; }
    [RegularExpression("^(white|red|rose|sparkling|dessert)$")] public string? Style { get; set; }
    [RegularExpression("^(bg|en|ru)$")] public string Language { get; set; } = "bg";
}
public static class SommelierScoring
{
    public static readonly IReadOnlyDictionary<string, int> Defaults = new Dictionary<string, int> {
        ["balance"] = 12, ["freshness"] = 8, ["sweetness"] = 15, ["spice"] = 12, ["umami"] = 8
    };
    public static (int Score, string[] Reasons)? Score(SommelierProfile dish, SommelierWine wine, IReadOnlyDictionary<string, int> rules)
    {
        if (!dish.Verified || !wine.Verified) return null;
        // Hard conflicts cannot be overridden by popularity, price or a restaurant preference.
        if (dish.Sweetness >= 3 && wine.Sweetness < dish.Sweetness ||
            dish.Acidity >= 4 && wine.Acidity < 3 ||
            dish.Heat >= 4 && (wine.Tannin >= 4 || wine.Alcohol >= 14)) return null;
        int W(string code) => rules.GetValueOrDefault(code);
        var score = 70 - Math.Abs(dish.Body - wine.Body) * W("balance");
        var reasons = new List<string>();
        if (Math.Abs(dish.Body - wine.Body) <= 1) reasons.Add("balance");
        if (dish.Fat >= 3 && wine.Acidity >= 3) { score += W("freshness"); reasons.Add("freshness"); }
        if (dish.Acidity > wine.Acidity) score -= (dish.Acidity - wine.Acidity) * W("freshness");
        if (dish.Sweetness > wine.Sweetness) score -= (dish.Sweetness - wine.Sweetness) * W("sweetness");
        if (dish.Sweetness >= 3 && wine.Sweetness >= dish.Sweetness) reasons.Add("sweetness");
        if (dish.Heat >= 2) {
            score -= Math.Max(0, wine.Tannin - 1) * W("spice");
            if (wine.Alcohol > 13) score -= W("spice");
            if (wine.Sweetness >= 1 && wine.Tannin <= 1 && wine.Alcohol <= 13) { score += W("spice"); reasons.Add("spice"); }
        }
        if (dish.Umami >= 3 && wine.Tannin >= 3) score -= (wine.Tannin - 2) * W("umami");
        if (score < 50 || reasons.Count == 0) return null;
        return (score, reasons.AsEnumerable().Reverse().Distinct().Take(2).ToArray());
    }
}
