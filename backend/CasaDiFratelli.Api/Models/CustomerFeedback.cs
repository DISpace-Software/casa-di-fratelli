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
    public string OnlineReservationEase { get; set; } = string.Empty;
    public int TableMapRating { get; set; }
    public int TableMapUsefulnessRating { get; set; }
    public string TableMapFavoriteFeature { get; set; } = string.Empty;
    public string TableMapReuseIntent { get; set; } = string.Empty;
    public string TableChoiceImportance { get; set; } = string.Empty;
    public int SoftwareRating { get; set; }
    public string SoftwareFeedback { get; set; } = string.Empty;
    public string MostUsefulDigitalFeature { get; set; } = string.Empty;
    public string ClientCareFeedback { get; set; } = string.Empty;
    public string SmallDetailsFeedback { get; set; } = string.Empty;
    public int ReturnLikelihood { get; set; }
    public int RecommendLikelihood { get; set; }
    public string OneThingToChange { get; set; } = string.Empty;
    public bool GoogleReviewClicked { get; set; }
    public string DiscountCode { get; set; } = string.Empty;
    public bool DiscountCodeUsed { get; set; }
    public DateTime? DiscountCodeUsedAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
