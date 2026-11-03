using SeatMap.Api.Services.Tenancy;
using Npgsql;

namespace SeatMap.Api.Platform.Data;

public static class PlatformDatabaseConfiguration
{
    public static string Resolve(IConfiguration configuration)
    {
        var value = configuration.GetConnectionString("SeatMapPlatform");
        if (string.IsNullOrWhiteSpace(value))
            throw new InvalidOperationException("Set ConnectionStrings__SeatMapPlatform to a dedicated PostgreSQL connection string.");
        return TenantDatabaseConnectionResolver.ConvertPostgresUrl(value);
    }

    public static void ValidateIsolation(string platformConnection, IEnumerable<string> restaurantConnections)
    {
        var platformTarget = Target(platformConnection);
        if (restaurantConnections.Any(connection => Target(connection) == platformTarget))
            throw new InvalidOperationException("The SeatMap platform database must be separate from every restaurant database.");
    }

    private static string Target(string value)
    {
        var connection = new NpgsqlConnectionStringBuilder(value);
        var host = string.Join(",", (connection.Host ?? "").Split(',')
            .Select(part => part.Trim().TrimEnd('.').ToLowerInvariant()).OrderBy(part => part, StringComparer.Ordinal));
        var database = string.IsNullOrEmpty(connection.Database) ? connection.Username : connection.Database;
        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(database))
            throw new InvalidOperationException("Database host and name are required.");
        return System.Text.Json.JsonSerializer.Serialize(new { host, connection.Port, database });
    }
}
