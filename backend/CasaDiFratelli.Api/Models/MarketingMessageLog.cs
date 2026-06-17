namespace CasaDiFratelli.Api.Models;

public class MarketingMessageLog
{
    public int Id { get; set; }

    public string CampaignKey { get; set; } = string.Empty;

    public string CustomerKey { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public DateOnly SentForDate { get; set; }

    public DateTime SentAtUtc { get; set; } = DateTime.UtcNow;

    public string Subject { get; set; } = string.Empty;

    public decimal DiscountPercent { get; set; }
}
