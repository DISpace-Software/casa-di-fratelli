namespace CasaDiFratelli.Api.Services.Tenancy;

public sealed class CurrentTenant : ICurrentTenant
{
    public string TenantId { get; private set; } = string.Empty;

    public string TenantSlug { get; private set; } = string.Empty;

    public string TenantName { get; private set; } = string.Empty;

    public string? Domain { get; private set; }

    public string? FrontendUrl { get; private set; }

    public string DatabaseMode { get; private set; } = "SingleDatabase";

    public string ConnectionStringKey { get; private set; } = "DefaultConnection";

    public bool IsResolved { get; private set; }

    public void Resolve(TenantDefinition tenant)
    {
        if (!tenant.IsActive || string.IsNullOrWhiteSpace(tenant.Id))
            throw new InvalidOperationException("An active tenant is required.");
        if (IsResolved)
        {
            if (!TenantId.Equals(tenant.Id, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("A dependency-injection scope cannot change tenants.");
            return;
        }

        TenantId = tenant.Id;
        TenantSlug = tenant.Slug;
        TenantName = tenant.Name;
        Domain = tenant.Domain;
        FrontendUrl = tenant.FrontendUrl;
        DatabaseMode = tenant.DatabaseMode;
        ConnectionStringKey = tenant.ConnectionStringKey;
        IsResolved = true;
    }
}
