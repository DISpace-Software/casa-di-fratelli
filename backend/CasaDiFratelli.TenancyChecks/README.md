# Tenant isolation checks

Run with .NET SDK 8:

```sh
dotnet run --project backend/CasaDiFratelli.TenancyChecks/CasaDiFratelli.TenancyChecks.csproj --no-launch-profile
```

The console runner exits nonzero on any failed assertion. It exercises real
tenant middleware, startup validation and database-target preflight with
synthetic configuration. It does not start the API, connect to a database,
apply migrations or run background jobs. Initial NuGet restore may require
network access; subsequent runs can use `--no-restore`.

Cases include unconfigured host suffixes, exact hosts, conflicting selectors,
shared API routing, domain and alias collisions, path-safe backup tenant IDs,
duplicate database targets and immutable tenant scopes.
