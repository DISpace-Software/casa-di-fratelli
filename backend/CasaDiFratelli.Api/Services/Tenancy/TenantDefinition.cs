namespace CasaDiFratelli.Api.Services.Tenancy;

public sealed class TenantDefinition
{
    public string Id { get; set; } = "casa-di-fratelli";

    public string Name { get; set; } = "Casa di Fratelli";

    public string Slug { get; set; } = "casa-di-fratelli";

    public string? Domain { get; set; } = "casadifratelli.bg";

    public string DatabaseMode { get; set; } = "DedicatedDatabase";

    public string ConnectionStringKey { get; set; } = "DefaultConnection";
}
