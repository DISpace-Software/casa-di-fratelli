namespace CasaDiFratelli.Api.Dtos;

public class UpdateReservationRequest
{
    public string GuestName { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public int GuestCount { get; set; }
    public string Area { get; set; } = string.Empty;
    public DateOnly ReservedDate { get; set; }
    public string ReservedTime { get; set; } = string.Empty;
    public List<string> TableIds { get; set; } = new();
    public string? Notes { get; set; }
    public string? InternalNote { get; set; }
}
