using Microsoft.Extensions.Options;

namespace CasaDiFratelli.Api.Services.Tenancy;

public sealed class TenantOptionsValidator : IValidateOptions<TenantResolutionOptions>
{
    public ValidateOptionsResult Validate(string? name, TenantResolutionOptions options)
    {
        var errors = new List<string>();
        var tenants = options.Tenants.Where(tenant => tenant.IsActive).ToList();

        if (tenants.Count == 0)
            errors.Add("Tenancy:Tenants must contain at least one active tenant.");

        ValidateUnique(tenants, tenant => tenant.Id, "Id", errors);
        ValidateUnique(tenants, tenant => tenant.Slug, "Slug", errors);
        ValidateUnique(tenants, tenant => tenant.ConnectionStringKey, "ConnectionStringKey", errors);
        ValidateUnique(
            tenants.SelectMany(tenant => tenant.FrontendOrigins.Select(origin => new TenantDefinition { Id = origin })),
            tenant => tenant.Id.Trim().TrimEnd('/'),
            "FrontendOrigin",
            errors);

        foreach (var tenant in tenants)
        {
            if (string.IsNullOrWhiteSpace(tenant.Id))
                errors.Add("Every active tenant requires an Id.");
            if (string.IsNullOrWhiteSpace(tenant.Slug))
                errors.Add($"Tenant '{tenant.Id}' requires a Slug.");
            if (string.IsNullOrWhiteSpace(tenant.ConnectionStringKey))
                errors.Add($"Tenant '{tenant.Id}' requires a ConnectionStringKey.");
            if (string.IsNullOrWhiteSpace(tenant.AdminEmailConfigurationKey) ||
                string.IsNullOrWhiteSpace(tenant.AdminPasswordConfigurationKey))
                errors.Add($"Tenant '{tenant.Id}' requires admin credential configuration keys.");
            if (string.IsNullOrWhiteSpace(tenant.FrontendUrl) ||
                !Uri.TryCreate(tenant.FrontendUrl, UriKind.Absolute, out _))
                errors.Add($"Tenant '{tenant.Id}' requires an absolute FrontendUrl.");
            if (!tenant.DatabaseMode.Equals("DedicatedDatabase", StringComparison.OrdinalIgnoreCase))
                errors.Add($"Tenant '{tenant.Id}' uses unsupported DatabaseMode '{tenant.DatabaseMode}'. Only DedicatedDatabase is currently safe.");
        }

        if (!tenants.Any(tenant => tenant.Id.Equals(options.DefaultTenant.Id, StringComparison.OrdinalIgnoreCase)))
            errors.Add("Tenancy:DefaultTenant must also exist in Tenancy:Tenants.");

        return errors.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(errors);
    }

    private static void ValidateUnique(
        IEnumerable<TenantDefinition> tenants,
        Func<TenantDefinition, string> selector,
        string field,
        ICollection<string> errors)
    {
        var duplicates = tenants
            .Select(selector)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .GroupBy(value => value, StringComparer.OrdinalIgnoreCase)
            .Where(group => group.Count() > 1)
            .Select(group => group.Key);

        foreach (var duplicate in duplicates)
            errors.Add($"Active tenant {field} '{duplicate}' is duplicated.");
    }
}
