using Microsoft.Extensions.Options;
using Npgsql;

namespace CasaDiFratelli.Api.Services.Tenancy;

public sealed class TenantDatabaseConnectionResolver
{
    private readonly IConfiguration _configuration;
    private readonly CurrentTenant _currentTenant;
    private readonly TenantResolutionOptions _options;

    public TenantDatabaseConnectionResolver(
        IConfiguration configuration,
        CurrentTenant currentTenant,
        IOptions<TenantResolutionOptions> options)
    {
        _configuration = configuration;
        _currentTenant = currentTenant;
        _options = options.Value;
    }

    public string Resolve()
    {
        if (!_currentTenant.IsResolved)
            throw new InvalidOperationException("Resolve the tenant before database access.");

        var tenant = _options.Tenants.FirstOrDefault(item =>
            item.Id.Equals(_currentTenant.TenantId, StringComparison.OrdinalIgnoreCase));

        if (tenant == null || !tenant.IsActive)
            throw new InvalidOperationException("A valid active tenant is required before database access.");

        return ResolveFor(tenant);
    }

    public string ResolveFor(TenantDefinition tenant)
    {
        var key = tenant.ConnectionStringKey.Trim();
        var connectionString = _configuration.GetConnectionString(key);

        if (string.IsNullOrWhiteSpace(connectionString) &&
            key.Equals("DefaultConnection", StringComparison.OrdinalIgnoreCase))
        {
            connectionString =
                _configuration["DATABASE_URL"] ??
                _configuration["POSTGRES_URL"] ??
                _configuration["POSTGRESQL_URL"];
        }

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                $"Database connection for tenant '{tenant.Id}' is not configured. " +
                $"Set ConnectionStrings__{key}.");
        }

        return ConvertPostgresUrl(connectionString);
    }

    public void ValidateDedicatedDatabaseTargets()
    {
        var targets = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var tenant in _options.Tenants.Where(item => item.IsActive))
        {
            var connection = new NpgsqlConnectionStringBuilder(ResolveFor(tenant));
            var host = string.Join(",", (connection.Host ?? string.Empty).Split(',')
                .Select(value => value.Trim().TrimEnd('.').ToLowerInvariant())
                .OrderBy(value => value, StringComparer.Ordinal));
            // PostgreSQL defaults Database to Username when it is omitted.
            var database = string.IsNullOrEmpty(connection.Database) ? connection.Username : connection.Database;
            if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(database))
                throw new InvalidOperationException($"Tenant '{tenant.Id}' requires an explicit database host and database name.");
            var target = System.Text.Json.JsonSerializer.Serialize(new { host, connection.Port, database });
            if (targets.TryGetValue(target, out var previousTenant))
                throw new InvalidOperationException(
                    $"Tenants '{previousTenant}' and '{tenant.Id}' resolve to the same database. Dedicated databases are required.");
            targets.Add(target, tenant.Id);
        }
    }

    private static string ConvertPostgresUrl(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            (!uri.Scheme.Equals("postgres", StringComparison.OrdinalIgnoreCase) &&
             !uri.Scheme.Equals("postgresql", StringComparison.OrdinalIgnoreCase)))
        {
            return value;
        }

        var credentials = uri.UserInfo.Split(':', 2);
        return new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.IsDefaultPort ? 5432 : uri.Port,
            Database = uri.AbsolutePath.TrimStart('/'),
            Username = credentials.Length > 0 ? Uri.UnescapeDataString(credentials[0]) : string.Empty,
            Password = credentials.Length > 1 ? Uri.UnescapeDataString(credentials[1]) : string.Empty,
            SslMode = SslMode.Require
        }.ConnectionString;
    }
}
