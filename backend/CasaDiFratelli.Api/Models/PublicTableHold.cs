namespace CasaDiFratelli.Api.Models;

public class PublicTableHold
{
    public int Id { get; set; }
    public DateOnly ReservedDate { get; set; }
    public string TableIdsJson { get; set; } = "[]";
    public string? Note { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public int? CreatedByAdminUserId { get; set; }
    public string? CreatedByAdminName { get; set; }
}
