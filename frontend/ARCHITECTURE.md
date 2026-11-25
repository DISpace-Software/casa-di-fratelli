# Frontend architecture

The frontend contains the Casa public site, Cofein booking site, and the shared
restaurant administration app. Their Vite entry points and published URLs remain
unchanged. This refactor creates explicit boundaries around existing behavior;
it does not move authoritative restaurant rules into the browser.

## Code map

| Location | Responsibility |
| --- | --- |
| `src/pages/` | Route composition and remaining legacy screen orchestration |
| `src/components/admin/` | Admin feature views: inventory, maintenance, marketing, waitlist and shared visual primitives |
| `src/components/admin/map/` | Layout editor, operational reservation map and decorative map layers |
| `src/admin/api/` | Legacy API response conversion and response/error decoding |
| `src/admin/browser/` | Browser-specific image processing, notifications and service-worker registration |
| `src/admin/presentation/` | Display grouping, localized labels, legacy role affordances and view-model helpers |
| `src/admin/waitlist/` | Waitlist HTTP adapter, React orchestration and pure display rules |
| `src/domain/` | Existing deterministic reservation, floor-plan, customer and map calculations |
| `src/context/` | React providers for tenant branding, plans and seasonal state |
| `src/config/` | Runtime tenant resolution, endpoints and existing shared fetch configuration |
| `src/i18n/` | Locale catalogs; admin translations initialize together in `adminText.js` |
| `src/cofein/` | Cofein-specific public booking experience and its adapters |

Components must not import `AdminPage` to reuse helpers. Shared feature behavior
lives below the page and is imported explicitly. Visual primitives do not own
HTTP calls. Avoid a generic `utils` dumping ground: name helpers after the API,
feature or browser capability they belong to.

## Waitlist example

`WaitlistPanel` renders the view. `useAdminWaitlist` owns polling, form drafts,
errors and commands. `createWaitlistApi` translates those commands into the
existing endpoint payloads through injected `adminFetch`; that parent adapter
owns authentication and tenant headers. `waitlistPresentation` contains pure
countdown, duration and close-button rules.

The refresh generation prevents an older date-filter response from overwriting
newer data. Dirty duration input survives polling. Mutation errors remain visible
after a successful refresh, because loading a list does not prove a failed write
succeeded. The countdown adjusts for the server clock. Allocation, capacity,
expiry, permission checks and duplicate-confirmation protection remain server
responsibilities; hiding a button cannot enforce these rules.

## Compatibility boundaries

`admin/api/wireValue.js` and `reservationMappers.js` accept the legacy API's
camelCase and PascalCase fields. UI code consumes normalized data. Do not remove
these fallbacks as incidental cleanup: that requires a separately verified API
migration. Likewise, role helpers are UI affordances, **not authorization**.
Unknown-role fallback is retained for compatibility and must not be used by a
security boundary.

The map keeps its existing world/percentage coordinate conversion and tenant
presentation rules. Extracting its components does not change geometry, table
selection, drag behavior, map camera ownership, or booking endpoints. Tenant
specific copy stays in the existing tenant-aware presentation helpers.

## Validation

Use Node 22, as declared in `package.json`:

```sh
npm test
npm run test:cofein
npm run test:waitlist-browser
npm run build
npm run build:admin
npm run build:cofein
```

The Chromium waitlist test exercises the actual view through an isolated HTTP
fixture: retry, server-clock countdown, pause versus unsaved duration, filtering,
failed and successful staff requests, and audited closure. It also imports the
admin page to catch module-initialization failures after extraction. It does not
prove authenticated production integration or every map/inventory workflow.
Contract tests cover legacy data conversion, waiter attention, role hierarchy
and waitlist display rules. Existing domain tests cover reservation and map rules.

## Remaining debt and next safe changes

`AdminPage` still owns a large amount of cross-feature dashboard state and event
handlers. `ReservationOperationsMap` and `InventoryModule` remain substantial
components. This is a staged refactor, not a claim that the complete frontend is
now a strict DDD or Clean Architecture implementation.

Next, extract one use-case hook and API adapter at a time from the remaining
page (reservation administration, orders, menu editing), preserving its request
contracts and adding behavioral coverage before moving to the next feature.
Split the large map only around state ownership boundaries, with drag, camera,
selection and mobile interaction tests. Server invariants must stay on the
server even when a corresponding UI guard exists. Do not add repositories,
interfaces or factories solely to match a pattern: use an abstraction when it
separates a real dependency or gives a useful test seam.
