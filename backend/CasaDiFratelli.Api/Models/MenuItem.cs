namespace CasaDiFratelli.Api.Models;

public class MenuItem
{
    public int Id { get; set; }

    public string NameBg { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;

    public string DescriptionBg { get; set; } = string.Empty;
    public string DescriptionEn { get; set; } = string.Empty;
    public string ImageUrl { get; set; } = string.Empty;

    public string Weight { get; set; } = string.Empty;
    public decimal Price { get; set; }

    public string Category { get; set; } = "Main";
    public bool IsActive { get; set; } = true;
    public bool NotifySubscribers { get; set; } = false;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAtUtc { get; set; }
}
