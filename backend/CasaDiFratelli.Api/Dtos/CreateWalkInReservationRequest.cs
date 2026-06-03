namespace CasaDiFratelli.Api.Dtos;

public class CreateWalkInReservationRequest
{
    public string Area { get; set; } = string.Empty;

    public List<string> TableIds { get; set; } = new();

    public int GuestCount { get; set; } = 2;

    public string? InternalNote { get; set; }
}
