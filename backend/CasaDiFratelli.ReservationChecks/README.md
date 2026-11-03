# Reservation lifecycle checks

Run `dotnet run --project backend/CasaDiFratelli.ReservationChecks` with .NET 8.
Uses an isolated in-memory SQLite database. Checks trash listing (including cancelled walk-ins), restoring statuses and table assignments, conflict rejection, permanent deletion, archiving linked orders while preserving their amounts and items, unrelated records and role restrictions. No production connections or emails.

`BookingServiceChecks.cs` also exercises shared creation and email confirmation,
CRM rollback, clock-based limits and notification failures. Real HTTP calls run
both legacy and v1 action bodies against two isolated SQLite databases, checking
response compatibility, tenant isolation and forged administrator fields.
Email templates use a local capture handler. No external email/push is sent.
These checks do not establish concurrent booking safety on PostgreSQL.
