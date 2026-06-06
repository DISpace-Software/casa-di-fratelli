namespace CasaDiFratelli.Api.Models;

public class RestaurantEvent
{
    public int Id { get; set; }

    public string TitleBg { get; set; } = string.Empty;

    public string TitleEn { get; set; } = string.Empty;

    public string TextBg { get; set; } = string.Empty;

    public string TextEn { get; set; } = string.Empty;

    public string Badge { get; set; } = string.Empty;

    public string ImageUrlsJson { get; set; } = "[]";

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAtUtc { get; set; }
}
