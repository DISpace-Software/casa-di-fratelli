# Reservation lifecycle checks

Run `dotnet run --project backend/CasaDiFratelli.ReservationChecks` with .NET 8.
Uses an isolated in-memory SQLite database. Checks trash listing (including cancelled walk-ins), restoring statuses and table assignments, conflict rejection, permanent deletion, archiving linked orders while preserving their amounts and items, unrelated records and role restrictions. No production connections or emails.
