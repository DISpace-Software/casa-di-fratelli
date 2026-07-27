namespace CasaDiFratelli.Api.Services.Tenancy;

public sealed class TenantDefinition
{
    public string Id { get; set; } = "casa-di-fratelli";

    public string Name { get; set; } = "Casa di Fratelli";

    public string Slug { get; set; } = "casa-di-fratelli";

    public string? Domain { get; set; } = "casadifratelli.bg";

    public List<string> FrontendOrigins { get; set; } = new();

    public string? FrontendUrl { get; set; }

    public bool IsActive { get; set; } = true;

    public bool SeedDefaultMenu { get; set; }

    public string AdminEmailConfigurationKey { get; set; } = "ADMIN_EMAIL";

    public string AdminPasswordConfigurationKey { get; set; } = "ADMIN_PASSWORD";

    public string DatabaseMode { get; set; } = "DedicatedDatabase";

    public string ConnectionStringKey { get; set; } = "DefaultConnection";
}
