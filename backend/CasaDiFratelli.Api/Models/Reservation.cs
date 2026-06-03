using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CasaDiFratelli.Api.Models;

public class Reservation
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int Id { get; set; }

    public string GuestName { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string? Email { get; set; }

    public int GuestCount { get; set; }

    public string Area { get; set; } = string.Empty;

    public DateOnly ReservedDate { get; set; }

    public string ReservedTime { get; set; } = string.Empty;

    public string? Notes { get; set; }

    public string Status { get; set; } = "Pending";

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public List<ReservationTable> Tables { get; set; } = new();

    public DateOnly? BirthDate { get; set; }

    public bool MarketingConsent { get; set; } = false;

    public bool PrivacyConsent { get; set; } = false;

    public bool CreatedByAdmin { get; set; } = false;

    public int? CreatedByAdminUserId { get; set; }

    public string? CreatedByAdminName { get; set; }

    public bool IsWalkIn { get; set; } = false;

    public string? InternalNote { get; set; }

    public bool IsNoShow { get; set; } = false;

    public bool IsArrived { get; set; } = false;

    public bool IsBlacklisted { get; set; } = false;
    
    public bool IsRegularCustomer { get; set; } = false;

    public string? OrderAccessToken { get; set; }

    public string? EmailConfirmationTokenHash { get; set; }

    public DateTime? EmailConfirmationExpiresAtUtc { get; set; }

    public DateTime? EmailConfirmedAtUtc { get; set; }
}
