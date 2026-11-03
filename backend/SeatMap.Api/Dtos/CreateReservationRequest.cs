namespace SeatMap.Api.Dtos;

// Existing website/admin contract is retained for backwards compatibility.
public sealed class CreateReservationRequest : PublicCreateReservationRequest
{
    public bool CreatedByAdmin { get; set; }
    public string? InternalNote { get; set; }
}
