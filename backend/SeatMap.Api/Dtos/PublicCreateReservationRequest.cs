namespace SeatMap.Api.Dtos;

public class PublicCreateReservationRequest
{
    public string GuestName { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;

    public int GuestCount { get; set; }

    public string Area { get; set; } = string.Empty;
    public string ReservedTime { get; set; } = string.Empty;
    public DateOnly ReservedDate { get; set; }

    public string? Notes { get; set; }

    public List<string> TableIds { get; set; } = new List<string>();

    public DateOnly? BirthDate { get; set; }
    public bool MarketingConsent { get; set; }
    public bool PrivacyConsent { get; set; }

    // Server mapping deliberately omits administrator-only fields.
    internal CreateReservationRequest ToBookingRequest() => new()
    {
        GuestName = GuestName, Phone = Phone, Email = Email, GuestCount = GuestCount,
        Area = Area, ReservedTime = ReservedTime, ReservedDate = ReservedDate,
        Notes = Notes, TableIds = TableIds, BirthDate = BirthDate,
        MarketingConsent = MarketingConsent, PrivacyConsent = PrivacyConsent
    };
}
