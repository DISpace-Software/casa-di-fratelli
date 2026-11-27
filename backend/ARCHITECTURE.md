# Backend architecture and contributor guide

SeatMap is a modular monolith with restaurant-scoped databases and a separate platform identity database. It is **not yet a fully separated Clean Architecture solution**. The structure below distinguishes enforced boundaries from legacy code, so contributors do not mistake a folder name for isolation.

## Projects and dependency direction

- `SeatMap.Domain`: framework-independent business policy. It has no package or project references. `Reservations/ReservationTimePolicy` accepts restaurant-local time and explicit limits; it does not read configuration, HTTP, a clock, or a database.
- `SeatMap.Api`: composition root (`Program.cs`), HTTP adapters, use-case orchestration, and existing persistence/integration implementations. References Domain, never the reverse.
- `SeatMap.DomainChecks`: executable boundary tests referencing only Domain.
- Other `*Checks` projects: API/application/infrastructure regression harnesses. Some use SQLite; concurrency-sensitive checks optionally run against a dedicated PostgreSQL database.

`Services/Reservations/ReservationTimeRules` is the compatibility adapter from tenant branding and `TimeProvider` into the pure policy. The business-day rollover after midnight is intentional; do not replace it with ordinary calendar comparison.

## Context map

| Context | Current location | Responsibility and boundary |
| --- | --- | --- |
| Guest identity | `Platform/Auth`, `Platform/Models`, `Platform/Services` | Platform account, verified identity, authentication and capability issuance. Separate database. |
| Tenant resolution | `Services/Tenancy`, filters, `Data` | Resolve tenant before constructing restaurant-scoped persistence. Never trust a submitted guest/tenant ID as authorization. |
| Reservations | `Services/Reservations`, reservation controllers | Booking validation, conflicts, guest management and booking notifications. Shared restaurant transaction protects all allocation paths. |
| Floor plan | `Services/FloorPlans`, floor plan controllers | Zones, tables, public capacity and permitted combinations. Waitlist consumes the same selection rules. |
| Waitlist | `Application/Waitlist`, `Services/Waitlist`, three controllers | Guest requests, exclusive offers, booking conversion, cross-tenant guest inbox and notification delivery. |
| Preorders | `Services/Preorders`, guest preorder controllers | Changes to food requested for a booking and editing policy. |
| Dining/orders | Dining order controllers and models | On-site order lifecycle. Distinct from a reservation or an unsubmitted preorder. |
| Inventory | Inventory controllers and models | Stock and operational inventory writes. |
| Sommelier | `Services/Sommelier` | Shared matching rules applied only to each restaurant's actual assortment. |
| Staff administration | Admin controllers, `AuditService` | Staff authorization, settings and auditable operations. |

These are code ownership boundaries within one application, not independent deployable services. Cross-context references remain in the legacy host.

## Waitlist use cases and invariants

`WaitlistController` handles guest HTTP routes, identity extraction and result mapping. `ConfirmWaitlistOffer` owns confirmation and recovery of the management token. `GuestWaitlistInboxController` delegates to `GetGuestWaitlistInbox`; the latter deliberately creates a fresh dependency scope per tenant. A tenant read failure is returned separately so the app can retain that tenant's cached rows. Request cancellation must propagate rather than be reported as an ordinary tenant failure.

`AdminWaitlistController` has its own file and role boundary and delegates staff workflows to `AdministerWaitlist`. The application service directly receives floor-plan and optional platform persistence dependencies. Its settings and audit writes still share the existing transaction. Audit actor extraction retains an explicit `HttpContext` compatibility parameter until `AuditService` is migrated to a transport-neutral actor. `WaitlistService` orchestrates joins, validation and allocation; `WaitlistEntry.OfferTables` names the atomic mutation that creates an offer version and resets delivery tracking. Entity namespace and persisted properties remain unchanged to avoid unintended EF schema/model changes.

Preserve these invariants in any further extraction:

1. Regular bookings, staff edits, table holds, offer allocation and acceptance use the same restaurant write lock. A new repository or context must not silently create a second unit of work.
2. Save each allocated hold before selecting for the next waiting guest. FIFO order is `QueueAtUtc`, then ID; editing/resuming goes to the back of the queue.
3. Confirmation checks authenticated ownership and the exact offer version. Retrying a successful confirmation retrieves the same booking and rotates its management capability; it must never allocate a second booking.
4. Persist deadlines and delivery leases. Network delivery happens outside the booking transaction, with an offer-specific provider idempotency key.
5. Restaurant-local business time controls valid slots; UTC controls offer expiry and delivery leases.
6. Runtime guest identity comes from the authenticated session. Staff enrollment still requires an explicitly requested, verified account.

## Style and dependency decisions

Use names that describe the use case or business rule. Controllers should translate transport, authorization and use-case results; new business workflows belong in `Application/<Context>`. Pure rules belong in Domain only when they can be expressed without EF, ASP.NET or configuration objects. Infrastructure stays in the host until its port and ownership are clear.

Do not add an interface for every class. Interfaces are useful for true external boundaries or alternate implementations (for example the existing reservation notification abstraction). EF `DbContext` already represents a unit of work; generic repositories around it would obscure the restaurant transaction. Do not introduce event buses or asynchronous domain events for allocation unless consistency semantics are explicitly designed and tested.

Comments should explain *why*: transaction ordering, security ownership, idempotency, time conventions and partial failure. Avoid narrating assignments. Keep public JSON names, route attributes and status/error codes stable during internal refactors.

## Remaining migration work

The large Reservations, DiningOrders and Inventory controllers still mix orchestration and persistence. Admin audit actor extraction, offer scheduling and email formatting remain coupled to the host. Many responses use anonymous objects, and EF entities use mutable setters. These are known remaining boundaries, not a claim that all code is now strict DDD.

Extract these incrementally by use case with characterization tests first. Preserve current routes and database identities; introduce typed response contracts only with serialization tests. Move persistence behind purpose-built ports where an alternate implementation or isolated application test requires it. Large physical moves or one-interface-per-class changes alone do not improve these boundaries.

## Verification

Run from repository root:

```sh
dotnet build backend/backend.sln
dotnet run --project backend/SeatMap.DomainChecks
dotnet run --project backend/SeatMap.WaitlistChecks
dotnet run --project backend/CasaDiFratelli.ReservationChecks
dotnet run --project backend/CasaDiFratelli.TenancyChecks
dotnet run --project backend/SeatMap.GuestChecks
dotnet run --project backend/SeatMap.PlatformChecks
dotnet run --project backend/SeatMap.SommelierChecks
```

For PostgreSQL waitlist concurrency checks, supply `WAITLIST_TEST_POSTGRES` pointing to a new isolated database whose name starts with `seatmap_waitlist_checks_`; never point it at a restaurant database. See `../docs/waitlist.md` for setup and delivery limitations. This architectural change requires no migration and does not deploy itself.
