namespace SeatMap.Api.Models;

public class CustomerProfile
{
    public int Id { get; set; }

    public string? GuestName { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }

    public int ReservationCount { get; set; }
    public bool IsRegularCustomer { get; set; }

    public DateOnly? BirthDate { get; set; }
    public bool MarketingConsent { get; set; }

    public DateTime FirstReservationAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime LastReservationAtUtc { get; set; } = DateTime.UtcNow;
}