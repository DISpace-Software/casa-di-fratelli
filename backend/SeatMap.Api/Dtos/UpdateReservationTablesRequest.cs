namespace SeatMap.Api.Dtos;

public class UpdateReservationTablesRequest
{
    public string? Area { get; set; }
    public int? GuestCount { get; set; }
    public DateOnly? ReservedDate { get; set; }
    public string? ReservedTime { get; set; }
    public List<string> TableIds { get; set; } = new();
}
