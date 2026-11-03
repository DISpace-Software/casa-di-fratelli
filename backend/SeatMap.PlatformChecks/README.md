# SeatMap platform foundation checks

Run from the repository root:

```sh
dotnet run --project backend/SeatMap.PlatformChecks
```

Uses synthetic restaurant configuration, an isolated in-memory SQLite database,
and a temporary HTTP server bound to loopback. No production secrets, database
connections, migrations, email or background workers are used.

Checks catalog publication and safe DTOs; separate platform database targets;
profile/favorite uniqueness; restaurant-scoped booking references; profile
deletion cascades; PostgreSQL migration SQL generation; actual MVC route
selection, middleware isolation, CORS preflight and legacy route compatibility.
Restaurant action bodies are intercepted after tenant resolution, so HTTP checks
verify routing boundaries rather than live restaurant database behavior.

These checks do not prove PostgreSQL migration execution, concurrent booking
safety, guest authentication or mobile booking. Those require their own
integration checks before enabling those features.
