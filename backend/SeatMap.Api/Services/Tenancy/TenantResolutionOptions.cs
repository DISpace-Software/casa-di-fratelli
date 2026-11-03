namespace SeatMap.Api.Services.Tenancy;

public sealed class TenantResolutionOptions
{
    public bool RequireKnownTenant { get; set; }

    public bool MigrateOnStartup { get; set; } = true;

    public TenantDefinition DefaultTenant { get; set; } = new();

    public List<TenantDefinition> Tenants { get; set; } = new();
}
