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
        var requestedTenantValue = context.Request.Headers["X-Tenant-Id"].FirstOrDefault();
        var originValue = ResolveFromOrigin(context.Request.Headers.Origin.FirstOrDefault());
        var requestedTenant = string.IsNullOrWhiteSpace(requestedTenantValue)
            ? null
            : FindTenant(requestedTenantValue);
        var originTenant = string.IsNullOrWhiteSpace(originValue)
            ? null
            : FindTenant(originValue);

        if (!string.IsNullOrWhiteSpace(requestedTenantValue) && requestedTenant == null)
        {
            await WriteTenantErrorAsync(context, "TENANT_NOT_FOUND", "The requested tenant is not configured.");
            return;
        }

        if (requestedTenant != null && originTenant != null &&
            !requestedTenant.Id.Equals(originTenant.Id, StringComparison.OrdinalIgnoreCase))
        {
            await WriteTenantErrorAsync(
                context,
                "TENANT_ORIGIN_MISMATCH",
                "The requested tenant does not match the configured frontend origin.");
            return;
        }

        var tenant = ResolveTenant(context);
        if (tenant == null && _options.RequireKnownTenant)
        {
            await WriteTenantErrorAsync(context, "TENANT_NOT_FOUND", "No active tenant is configured for this request.");
            return;
        }

        tenant ??= _options.DefaultTenant;
        currentTenant.Resolve(tenant);
        context.Response.Headers["X-Tenant-Id"] = tenant.Id;

        await _next(context);
    }

    private static async Task WriteTenantErrorAsync(HttpContext context, string code, string message)
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        await context.Response.WriteAsJsonAsync(new { code, message });
    }

    private TenantDefinition? ResolveTenant(HttpContext context)
    {
        var candidates = new[]
        {
            context.Request.Headers["X-Tenant-Id"].FirstOrDefault(),
            context.Request.RouteValues["tenant"]?.ToString(),
            context.Request.RouteValues["tenantSlug"]?.ToString(),
            ResolveFromOrigin(context.Request.Headers.Origin.FirstOrDefault()),
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
                tenant.IsActive &&
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
            tenant.IsActive &&
            (
                tenant.Id.Equals(value, StringComparison.OrdinalIgnoreCase) ||
                tenant.Slug.Equals(value, StringComparison.OrdinalIgnoreCase) ||
                (!string.IsNullOrWhiteSpace(tenant.Domain) &&
                 tenant.Domain.Equals(value, StringComparison.OrdinalIgnoreCase)) ||
                tenant.FrontendOrigins.Any(origin =>
                    NormalizeOrigin(origin).Equals(NormalizeOrigin(value), StringComparison.OrdinalIgnoreCase))
            ));
    }

    private static string? ResolveFromOrigin(string? origin)
    {
        if (string.IsNullOrWhiteSpace(origin) ||
            !Uri.TryCreate(origin, UriKind.Absolute, out var uri))
            return null;

        return $"{uri.Scheme}://{uri.Authority}";
    }

    private static string NormalizeOrigin(string value) => value.Trim().TrimEnd('/');

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
