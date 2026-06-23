namespace CasaDiFratelli.Api.Models;

public class CustomerFeedback
{
    public int Id { get; set; }
    public int? ReservationId { get; set; }
    public string GuestName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public int AtmosphereRating { get; set; }
    public string AtmosphereImpression { get; set; } = string.Empty;
    public string AtmosphereChange { get; set; } = string.Empty;
    public int FoodRating { get; set; }
    public string FoodImpression { get; set; } = string.Empty;
    public string FoodChange { get; set; } = string.Empty;
    public int ServiceRating { get; set; }
    public string ServiceImpression { get; set; } = string.Empty;
    public string ServiceChange { get; set; } = string.Empty;
    public int OnlineReservationRating { get; set; }
    public string OnlineReservationFeedback { get; set; } = string.Empty;
    public int SoftwareRating { get; set; }
    public string SoftwareFeedback { get; set; } = string.Empty;
    public string ClientCareFeedback { get; set; } = string.Empty;
    public string SmallDetailsFeedback { get; set; } = string.Empty;
    public bool GoogleReviewClicked { get; set; }
    public string DiscountCode { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
