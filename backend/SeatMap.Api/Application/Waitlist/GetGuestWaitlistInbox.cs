using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SeatMap.Api.Data;
using SeatMap.Api.Services.Tenancy;
using SeatMap.Api.Services.Waitlist;
using System.Text.Json;

namespace SeatMap.Api.Application.Waitlist;

/// <summary>Reads an authenticated guest's entries across isolated restaurant databases.</summary>
public sealed class GetGuestWaitlistInbox(
    IServiceScopeFactory services,
    IOptions<TenantResolutionOptions> tenancy,
    ILogger<GetGuestWaitlistInbox> logger)
{
    public async Task<object> ExecuteAsync(Guid guestId, CancellationToken cancellationToken)
    {
        var entries = new List<System.Text.Json.Nodes.JsonNode>();
        var failed = new List<string>();
        foreach (var tenant in tenancy.Value.Tenants.Where(x => x.IsActive))
        {
            try
            {
                // Resolve the tenant before resolving its DbContext; each scope owns one database.
                using var scope = services.CreateScope();
                scope.ServiceProvider.GetRequiredService<CurrentTenant>().Resolve(tenant);
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var rows = await db.WaitlistEntries.AsNoTracking().Where(x => x.GuestId == guestId).OrderByDescending(x => x.CreatedAtUtc).Take(100).ToListAsync(cancellationToken);
                foreach (var row in rows)
                {
                    var node = JsonSerializer.SerializeToNode(WaitlistService.Describe(row), WaitlistService.Json)!;
                    node["restaurantId"] = tenant.Id;
                    node["restaurantName"] = tenant.Name;
                    entries.Add(node);
                }
            }
            catch (Exception error) when (!cancellationToken.IsCancellationRequested)
            {
                // One unavailable restaurant must not hide entries from healthy tenants.
                logger.LogWarning(error, "Waitlist inbox unavailable. TenantId={TenantId}", tenant.Id);
                failed.Add(tenant.Id);
            }
        }
        return new { entries, failedRestaurantIds = failed, serverTimeUtc = DateTime.UtcNow };
    }
}
