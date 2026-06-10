namespace CasaDiFratelli.Api.Models;

public class InventoryAudit
{
    public int Id { get; set; }

    public string Title { get; set; } = string.Empty;

    public string Status { get; set; } = "Draft";

    public int? CreatedByAdminUserId { get; set; }

    public string? CreatedByAdminName { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? ConfirmedAtUtc { get; set; }

    public int? ConfirmedByAdminUserId { get; set; }

    public string? ConfirmedByAdminName { get; set; }

    public List<InventoryAuditLine> Lines { get; set; } = new();
}
