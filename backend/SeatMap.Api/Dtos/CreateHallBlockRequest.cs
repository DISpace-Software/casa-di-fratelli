namespace SeatMap.Api.Dtos;

public class CreateHallBlockRequest
{
    public DateOnly ReservedDate { get; set; }
    public string Area { get; set; } = string.Empty;
    public List<string> Times { get; set; } = new();
    public List<string> TableIds { get; set; } = new();
    public string? Note { get; set; }
}
