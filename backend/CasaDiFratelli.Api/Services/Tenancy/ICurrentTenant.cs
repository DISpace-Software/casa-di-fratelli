namespace CasaDiFratelli.Api.Services.Tenancy;

public interface ICurrentTenant
{
    string TenantId { get; }

    string TenantSlug { get; }

    string TenantName { get; }

    string? Domain { get; }

    string? FrontendUrl { get; }

    string DatabaseMode { get; }

    string ConnectionStringKey { get; }

    bool IsResolved { get; }
}
