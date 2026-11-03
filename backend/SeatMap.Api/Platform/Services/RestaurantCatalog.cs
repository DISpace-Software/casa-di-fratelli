using SeatMap.Api.Services.Tenancy;
using Microsoft.Extensions.Options;

namespace SeatMap.Api.Platform.Services;

public sealed record RestaurantSummary(string Id, string Slug, string Name, string? WebsiteUrl);

// Configuration remains the routing source of truth until catalog administration
// and provisioning are implemented. Never enumerate/connect to restaurant DBs.
public sealed class RestaurantCatalog(IOptions<TenantResolutionOptions> options)
{
    public IReadOnlyList<RestaurantSummary> List() => options.Value.Tenants
        .Where(tenant => tenant.IsActive && tenant.IsListed)
        .OrderBy(tenant => tenant.Name, StringComparer.OrdinalIgnoreCase)
        .ThenBy(tenant => tenant.Id, StringComparer.Ordinal)
        .Select(tenant => new RestaurantSummary(tenant.Id, tenant.Slug, tenant.Name, tenant.FrontendUrl))
        .ToArray();

    public RestaurantSummary? Find(string id) => List().FirstOrDefault(restaurant =>
        restaurant.Id.Equals(id, StringComparison.OrdinalIgnoreCase));
}
