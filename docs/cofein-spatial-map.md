# Cofein architectural map

Implementation: 2026-11-04. This change is prepared locally; it has not been published.

The public booking dialog and existing shared administration use one SVG
architecture and one furniture renderer. The source is the owner's supplied
`20260907_162344.jpg` plan and the approved map concepts. Geometry is a drawing,
not a measured survey. Main-entrance designation and ambiguous glazing remain
unconfirmed; the map labels the street opening and garden connections without
inventing a new bookable terrace or garden furniture.

## Data and behavior

- The existing API floor-plan document supplies table IDs, zones, active state,
  positions, capacities and combinations. The renderer does not create tables.
- Per-zone API coordinates are projected into one connected 900 × 1600 world.
  Reverse projection retains the server's accepted 5–95 range. The original
  30 tables remain distinct, including F01–F04. Bar stools are context only.
- The four detailed views are fragments of one floor and two booking zones.
  They do not create extra zones or change reservation rules.
- The public map is visible before availability is requested. Only a fresh,
  valid availability option can be selected. The final POST retains the
  pre-existing server recheck, conflict handling and unknown-result protection.
- Unknown future table IDs in known zones use generic furniture; their live
  positions and capacities still work. Public options for other zones remain
  accessible in the list. The shared admin falls back to its generic map if a
  new, unmapped active zone is added.
- The map editor uses the same architecture and supports pointer dragging and
  arrow-key movement. Capacity and position edits remain a draft until Save;
  existing revision/conflict protection is unchanged.
- Existing admin dialogs, booking actions, permissions, navigation and Casa
  visual components are reused. Casa's architecture and table rendering stay
  on their existing branch. Cofein camera storage has a new namespace so the
  old two-panel camera cannot place the new floor plan off-screen.

## Source

- `frontend/src/domain/floorPlans/cofeinGeometry.js`
- `frontend/src/components/floorplan/CofeinArchitecture.jsx`
- `frontend/src/components/floorplan/CofeinTableVisual.jsx`
- `frontend/src/components/floorplan/CofeinMapExplorer.jsx`
- `frontend/src/cofein/CofeinBooking.jsx`
- `frontend/src/pages/AdminPage.jsx`

The previously untracked Cofein public-site source/assets were carried into
this isolated branch without changing the landing page, photographs, menu or
motion. The retired standalone Cofein admin is not part of this build.

## Local preview

Use Node 22 and .NET 8. The disposable API fixture is the existing
`scripts/check-shared-admin-local.py`, with root Cofein fixtures supplied by
`--fixtures-root`. Do not use production credentials for local fixture checks.

```sh
VITE_API_BASE_URL=http://127.0.0.1:8877 \
VITE_COFEIN_API_BASE_URL=http://127.0.0.1:8877 \
VITE_COFEIN_BOOKINGS_ENABLED=true \
npm --prefix frontend run dev:admin -- --host 127.0.0.1 --port 5176 --strictPort
```

Public: `http://127.0.0.1:5176/cofein-preview.html`.
Admin: `http://127.0.0.1:5176/r/cofein/admin`.
Both share the fixture origin; the production website is unchanged.

## Verification

- 113 domain tests, including 6 spatial projection checks.
- 15 public Cofein API tests.
- 23 isolated HTTP/database baseline checks.
- 26 spatial integration checks through actual React components, HTTP and
  disposable PostgreSQL: capacity/position persistence, inactive/new/renamed
  tables, draft isolation, editor boundaries, booking/conflict/cancellation,
  stale/error/closed availability, and unchanged Casa header/navigation and
  41 existing operational tables.
- ESLint for changed source and builds for Casa, shared admin and Cofein pass.
- Read-only production inspection confirms the same 30 table IDs and initial
  coordinates/capacities, with 150 provisional seats. No production writes or
  schema migrations are part of this change.

`scripts/check-cofein-spatial-map.mjs` accepts happy-dom/esbuild module paths,
the private local-fixture state path, an output report path and an optional
baseline checkout path (defaults to the sibling shared-admin checkout). Its simulated
DOM checks are not visual browser tests. Chrome automation currently fails to
navigate or capture screenshots. Actual desktop/mobile browser verification
remains pending; an SVG component render is available separately and must not
be represented as a screenshot of the website.

Release packages retain the existing shared-admin paths and legacy Cofein
admin redirects. They contain no credentials or local fixture state. Publishing
the frontend requires no backend deployment or floor-plan data migration.
