namespace SeatMap.Api.Models;

// An unpaid draft is deliberately separate from operational kitchen/bar orders.
public sealed class ReservationPreorder
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public int ReservationId { get; set; }
    public Reservation Reservation { get; set; } = null!;
    public Guid IdempotencyKey { get; set; }
    public string RequestHash { get; set; } = "";
    public string Status { get; set; } = "Draft";
    public string Currency { get; set; } = "EUR";
    public long TotalMinor { get; set; }
    public int CommissionBasisPoints { get; set; }
    public long CommissionMinor { get; set; }
    public long RestaurantNetMinor { get; set; }
    public string ItemsJson { get; set; } = "[]";
    public string Notes { get; set; } = "";
    public DateTime ServeAtUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}

// Future PSP capture adapter must write this only after verified capture, together
// with the order's paid transition. No public/admin endpoint can manufacture payments.
public sealed class PreorderPayment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ReservationPreorderId { get; set; }
    public ReservationPreorder Preorder { get; set; } = null!;
    public string Provider { get; set; } = "";
    public string ProviderPaymentId { get; set; } = "";
    public string Currency { get; set; } = "EUR";
    public long GrossMinor { get; set; }
    public long CommissionMinor { get; set; }
    public long RestaurantNetMinor { get; set; }
    public DateTime PaidAtUtc { get; set; }
}
