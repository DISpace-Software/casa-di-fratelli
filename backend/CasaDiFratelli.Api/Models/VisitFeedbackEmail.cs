namespace CasaDiFratelli.Api.Models;

public class VisitFeedbackEmail
{
    public int Id { get; set; }
    // Snapshot identifiers deliberately survive reservation archiving/deletion.
    public int ReservationId { get; set; }
    public string DeduplicationKey { get; set; } = "";
    public string Email { get; set; } = "";
    public string GuestName { get; set; } = "";
    public bool IsFirstVisitInvitation { get; set; }
    public string Subject { get; set; } = "";
    public string Html { get; set; } = "";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime NextAttemptAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? SentAtUtc { get; set; }
    public int Attempts { get; set; }
    public string? LastError { get; set; }
}
