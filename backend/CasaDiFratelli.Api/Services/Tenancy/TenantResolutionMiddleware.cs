using Microsoft.Extensions.Options;

namespace CasaDiFratelli.Api.Services.Tenancy;

public sealed class TenantResolutionMiddleware
{
    private static readonly HashSet<string> DevelopmentHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "localhost",
        "127.0.0.1",
        "::1"
    };

    private readonly RequestDelegate _next;
    private readonly TenantResolutionOptions _options;

    public TenantResolutionMiddleware(RequestDelegate next, IOptions<TenantResolutionOptions> options)
    {
        _next = next;
        _options = options.Value;
    }

    public async Task InvokeAsync(HttpContext context, CurrentTenant currentTenant)
    {
        var tenant = ResolveTenant(context) ?? _options.DefaultTenant;
        currentTenant.Resolve(tenant);

        await _next(context);
    }

    private TenantDefinition? ResolveTenant(HttpContext context)
    {
        var candidates = new[]
        {
            context.Request.Headers["X-Tenant-Id"].FirstOrDefault(),
            context.Request.RouteValues["tenant"]?.ToString(),
            context.Request.RouteValues["tenantSlug"]?.ToString(),
            ResolveFromHost(context.Request.Host.Host)
        };

        foreach (var candidate in candidates.Where(x => !string.IsNullOrWhiteSpace(x)))
        {
            var match = FindTenant(candidate!);
            if (match != null)
                return match;
        }

        var host = context.Request.Host.Host;
        if (!string.IsNullOrWhiteSpace(host))
        {
            var domainMatch = _options.Tenants.FirstOrDefault(tenant =>
                !string.IsNullOrWhiteSpace(tenant.Domain) &&
                host.Equals(tenant.Domain, StringComparison.OrdinalIgnoreCase));

            if (domainMatch != null)
                return domainMatch;
        }

        return null;
    }

    private TenantDefinition? FindTenant(string value)
    {
        return _options.Tenants.FirstOrDefault(tenant =>
            tenant.Id.Equals(value, StringComparison.OrdinalIgnoreCase) ||
            tenant.Slug.Equals(value, StringComparison.OrdinalIgnoreCase) ||
            (!string.IsNullOrWhiteSpace(tenant.Domain) && tenant.Domain.Equals(value, StringComparison.OrdinalIgnoreCase)));
    }

    private static string? ResolveFromHost(string host)
    {
        if (string.IsNullOrWhiteSpace(host) || DevelopmentHosts.Contains(host))
            return null;

        var parts = host.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length <= 2)
            return null;

        var subdomain = parts[0];
        return subdomain.Equals("www", StringComparison.OrdinalIgnoreCase) ? null : subdomain;
    }
}
