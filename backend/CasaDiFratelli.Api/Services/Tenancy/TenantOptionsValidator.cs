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
        ValidateUnique(tenants, tenant => tenant.AdminPasswordConfigurationKey, "AdminPasswordConfigurationKey", errors);
        ValidateUnique(
            tenants.SelectMany(tenant => tenant.FrontendOrigins.Select(origin => new TenantDefinition { Id = origin })),
            tenant => tenant.Id.Trim().TrimEnd('/'),
            "FrontendOrigin",
            errors);

        var aliases = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var hosts = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        void Register(Dictionary<string, string> entries, string value, string tenantId, string label)
        {
            if (string.IsNullOrWhiteSpace(value)) return;
            if (entries.TryGetValue(value, out var owner) && !owner.Equals(tenantId, StringComparison.OrdinalIgnoreCase))
                errors.Add($"Tenant {label} '{value}' is shared by '{owner}' and '{tenantId}'.");
            else
                entries[value] = tenantId;
        }

        foreach (var tenant in tenants)
        {
            if (string.IsNullOrWhiteSpace(tenant.Id))
                errors.Add("Every active tenant requires an Id.");
            if (string.IsNullOrWhiteSpace(tenant.Slug))
                errors.Add($"Tenant '{tenant.Id}' requires a Slug.");
            if (!System.Text.RegularExpressions.Regex.IsMatch(tenant.Id, "^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$"))
                errors.Add($"Tenant '{tenant.Id}' requires a path-safe Id containing only letters, digits and single hyphens.");
            Register(aliases, tenant.Id, tenant.Id, "alias");
            Register(aliases, tenant.Slug, tenant.Id, "alias");
            if (!string.IsNullOrWhiteSpace(tenant.Domain))
            {
                if (!Uri.TryCreate($"https://{tenant.Domain}", UriKind.Absolute, out var domainUri) ||
                    !domainUri.Host.Equals(tenant.Domain, StringComparison.OrdinalIgnoreCase))
                    errors.Add($"Tenant '{tenant.Id}' requires a bare domain without a scheme, port or path.");
                Register(aliases, tenant.Domain, tenant.Id, "alias");
                Register(hosts, tenant.Domain, tenant.Id, "host");
                Register(aliases, $"https://{tenant.Domain}", tenant.Id, "origin");
            }
            foreach (var origin in tenant.FrontendOrigins)
            {
                if (!Uri.TryCreate(origin, UriKind.Absolute, out var originUri) ||
                    originUri.Scheme is not ("http" or "https") ||
                    originUri.AbsolutePath != "/" || !string.IsNullOrEmpty(originUri.UserInfo) ||
                    !string.IsNullOrEmpty(originUri.Query) || !string.IsNullOrEmpty(originUri.Fragment))
                {
                    errors.Add($"Tenant '{tenant.Id}' requires HTTP(S) frontend origins without paths or credentials.");
                    continue;
                }
                Register(aliases, origin.Trim().TrimEnd('/'), tenant.Id, "origin");
                if (!originUri.IsLoopback)
                    Register(hosts, originUri.Host, tenant.Id, "host");
            }
            if (string.IsNullOrWhiteSpace(tenant.ConnectionStringKey))
                errors.Add($"Tenant '{tenant.Id}' requires a ConnectionStringKey.");
            if (string.IsNullOrWhiteSpace(tenant.AdminEmailConfigurationKey) ||
                string.IsNullOrWhiteSpace(tenant.AdminPasswordConfigurationKey))
                errors.Add($"Tenant '{tenant.Id}' requires admin credential configuration keys.");
            if (string.IsNullOrWhiteSpace(tenant.FrontendUrl) ||
                !Uri.TryCreate(tenant.FrontendUrl, UriKind.Absolute, out var frontendUri) ||
                frontendUri.Scheme is not ("http" or "https"))
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
