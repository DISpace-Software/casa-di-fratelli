namespace CasaDiFratelli.Api.Dtos;

public class CreatePublicTableHoldRequest
{
    public DateOnly ReservedDate { get; set; }
    public List<string> TableIds { get; set; } = new();
    public string? Note { get; set; }
}
