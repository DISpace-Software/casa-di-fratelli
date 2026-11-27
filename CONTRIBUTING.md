# Working on SeatMap

Start with [the architecture map](docs/architecture.md), then the guide for the
application you are changing: [server](backend/ARCHITECTURE.md),
[mobile](mobile/ARCHITECTURE.md), or [web](frontend/ARCHITECTURE.md).

For focused work, use [component workspaces and the local hub](docs/development-workspaces.md).

## Where new code belongs

1. Identify the feature and its business rule before choosing a folder.
2. Put deterministic decisions in the domain: pass the clock, facts and settings
   as input. A domain policy must not fetch data, navigate, send email or read UI state.
3. Put orchestration in an application use case/controller/hook: authenticate the
   actor, load facts, apply rules, persist the result and describe the outcome.
4. Keep database, HTTP, secure storage and notification details in adapters.
5. Keep views concerned with input, rendering and interaction. They may enforce
   friendly input limits, but the server remains authoritative.

The extracted modules follow these boundaries; legacy controllers and screens do
not all do so yet. When changing a legacy module, extract a coherent responsibility
with its behavior tests. Do not move files just to match a diagram.

## Names, interfaces and comments

Use the product vocabulary: reservation, table selection, offer, preorder,
restaurant, guest. A waitlist request is not a reservation; an offer is not a
confirmed reservation. Prefer names that state an operation or decision.

Use an interface when it defines a meaningful boundary with alternative adapters
or needs an independent test double (notification delivery, storage, clock).
Do not create an interface for every class, a generic repository over EF Core, or
an event bus for synchronous calls without a concrete need.

Comments explain **why**: transaction scope, ownership, retry behavior, timezone
interpretation or compatibility constraints. Public module entry points should
explain their responsibility. Avoid comments that restate assignments or repeat
an entire method body. Keep HTTP payloads and persisted field names stable unless
a separately tested migration is part of the change. Format touched code with the
language's formatter and the root `.editorconfig`; avoid unrelated repository-wide formatting churn.

## Changes that need special attention

- Resolve the restaurant before constructing its database scope. Never use one
  restaurant's DbContext to serve another restaurant.
- Availability is a preview. Reservation and offer writes must recheck eligibility
  under the same restaurant transaction/advisory lock.
- Use the restaurant timezone for reservation dates/times and UTC for offer expiry.
- A retry must not create a second booking or preorder. Preserve request/offer IDs.
- Do not log guest management capabilities, authentication tokens or credentials.
- A late mobile response must not apply to a different signed-in guest.
- Email/provider failures must not undo an already committed reservation.
- Existing HTTP routes, JSON, preference keys and secure storage keys are contracts.

## Verification

Use Node 22 for web commands, .NET 8 for the server and the repository's Flutter
SDK. Run commands from the indicated directory. Tests below use local fixtures;
never point destructive checks at a restaurant production database.

```sh
# Repository root: guard extracted dependency boundaries.
python3 scripts/check-architecture.py

# Server: build and execute behavioral checks.
dotnet build backend/backend.sln
dotnet run --project backend/SeatMap.DomainChecks
dotnet run --project backend/CasaDiFratelli.ReservationChecks
dotnet run --project backend/SeatMap.WaitlistChecks
dotnet run --project backend/SeatMap.GuestChecks
dotnet run --project backend/SeatMap.SommelierChecks
dotnet run --project backend/SeatMap.PlatformChecks
dotnet run --project backend/CasaDiFratelli.TenancyChecks

# In frontend/
npm ci
npm test
npm run test:cofein
npm run build
npm run build:admin
npm run build:cofein
# For waitlist interaction changes; install Playwright Chromium first or set
# PLAYWRIGHT_CHROMIUM_EXECUTABLE to an installed Chrome executable.
npm run test:waitlist-browser

# In mobile/
flutter analyze
flutter test
```

Start with the affected feature checks. A cross-layer refactor also needs broad
regressions. Report failures, skipped tests and unverified device/provider behavior
explicitly. A passing build does not prove runtime behavior, and a process launch
does not prove that the phone screen works.

## Review checklist

- Is the business rule named and placed in the module that owns it?
- Does the new dependency point inward, or is the coupling documented legacy debt?
- Are tenant, authorization, transaction and retry boundaries preserved?
- Do tests assert observable behavior rather than the private implementation?
- Do comments explain the non-obvious choices and remain true after this change?
- Are generated files, credentials, local fixtures and build outputs excluded?
