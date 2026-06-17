namespace CasaDiFratelli.Api.Services.Tenancy;

public sealed class TenantResolutionOptions
{
    public TenantDefinition DefaultTenant { get; set; } = new();

    public List<TenantDefinition> Tenants { get; set; } = new()
    {
        new TenantDefinition()
    };
}
