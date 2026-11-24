using System.ComponentModel.DataAnnotations;

namespace SeatMap.Api.Services.Waitlist;

public sealed class WaitlistEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GuestId { get; set; }
    [MaxLength(120)] public string GuestName { get; set; } = "";
    [MaxLength(254)] public string Email { get; set; } = "";
    [MaxLength(30)] public string Phone { get; set; } = "";
    [MaxLength(3)] public string Language { get; set; } = "bg";
    public DateOnly Date { get; set; }
    public int Guests { get; set; }
    [MaxLength(100)] public string Area { get; set; } = "";
    public string TimesJson { get; set; } = "[]";
    [MaxLength(20)] public string Status { get; set; } = "waiting";
    public DateTime CreatedAtUtc { get; set; }
    public DateTime QueueAtUtc { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
    public Guid? OfferId { get; set; }
    public string TableIdsJson { get; set; } = "[]";
    public string? OfferTime { get; set; }
    public DateTime? ExpiresAtUtc { get; set; }
    public int? ReservationId { get; set; }
    public DateTime? NotificationLeaseUntilUtc { get; set; }
    public DateTime? EmailSentAtUtc { get; set; }
    public DateTime? PushSentAtUtc { get; set; }
    public int NotificationAttempts { get; set; }
}
public sealed record WaitlistRequest(DateOnly Date, int Guests, string Area, List<string> Times);
public sealed record WaitlistSettings(bool Enabled = true, int OfferMinutes = 5);
public sealed record WaitlistAcceptance(Guid Id, Guid GuestId, Guid OfferId);
