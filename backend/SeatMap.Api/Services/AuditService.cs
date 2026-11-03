using System.Text.Json;
using SeatMap.Api.Data;
using SeatMap.Api.Models;

namespace SeatMap.Api.Services;

public class AuditService
{
    private readonly AppDbContext _db;

    public AuditService(AppDbContext db)
    {
        _db = db;
    }

    public async Task RecordAsync(
        HttpContext context,
        string action,
        string entity,
        string entityId,
        object? before = null,
        object? after = null)
    {
        var admin = AdminAuthService.Current(context);
        var options = new JsonSerializerOptions { WriteIndented = false };

        _db.AuditLogs.Add(new AuditLog
        {
            AdminUserId = admin?.Id,
            AdminName = admin?.Name ?? "System",
            Action = action,
            Entity = entity,
            EntityId = entityId,
            BeforeJson = before == null ? null : JsonSerializer.Serialize(before, options),
            AfterJson = after == null ? null : JsonSerializer.Serialize(after, options),
            IpAddress = context.Connection.RemoteIpAddress?.ToString(),
            UserAgent = context.Request.Headers.UserAgent.ToString(),
            CreatedAtUtc = DateTime.UtcNow
        });

        await _db.SaveChangesAsync();
    }
}
