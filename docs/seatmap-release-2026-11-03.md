# SeatMap production release — 3 November 2026

## Deployed versions

- `13882370078122e906a7cff75367d11791c9ad76`: SeatMap.Api rename, platform foundation, restaurant v1 routes and shared booking service. Render auto-deploy succeeded in 1m 10s.
- `6c4a2f887ed97464602a4fc4928463beba3e78c6`: preserve existing menus during startup. Render confirmed **Live**, auto-deploy succeeded in 52.4s.
- Service: `seatmap-api`, `srv-d7drmgl8nd3s73dvukn0`, project `SeatMap`, environment `Production`.
- Active deployment: https://dashboard.render.com/web/srv-d7drmgl8nd3s73dvukn0/deploys/dep-dbkm18h5efls73en1pc0
- API URL remains `https://casa-di-fratelli-api.onrender.com`.

Platform database configuration remains disabled by default; no platform migration job was run and no new database was provisioned. Cofein was not registered or published. All 27 existing restaurant migration/snapshot files were verified unchanged apart from namespaces before release.

## Menu startup issue found and corrected

The first deploy ran the pre-existing menu synchronization on startup. Comparing public menu responses before and after the deploy identified one actual data change in addition to nondeterministic ordering of equal-name dishes:

- Existing pizza row **347** became inactive.
- A matching pizza row **348** was created and activated, with the same public content and price.
- The original menu already had multiple inactive rows with this same seed key; the old unique-match logic treated that key as unmatched and recreated it on every startup.
- No previous menu rows were deleted. Other existing menu rows were unchanged. Active customer-facing menu content and prices were verified identical, excluding the replaced row ID.

The corrective release calls `MenuSeedData.SeedIfEmptyAsync` during startup and restaurant initialization. It initializes only a completely empty menu. Existing custom edits, inactive menus and historical duplicate keys are preserved. Explicit admin-triggered menu synchronization remains available and is not changed by this fix.

After the corrective deployment, every menu row and ID matched the response immediately after the first deployment: no additional duplication occurred. Row 348 remains active and row 347 remains inactive; the original active ID was not restored. Existing order/recipe associations were not migrated or inspected in this release. Historical duplicate cleanup is not part of this deployment.

## Verification

- Release solution build: 0 errors, 0 warnings.
- TenancyChecks: 17 passing checks.
- PlatformChecks: 27 passing checks.
- ReservationChecks: all existing groups pass, plus a new SQLite regression covering first initialization, edited prices/content, custom dishes, duplicate historical keys and a fully inactive menu.
- Render built the Docker image and confirmed the corrected commit as Live. Local Docker daemon was unavailable.
- Vercel reported success for both code commits; frontend source was not changed.
- Public catalog: HTTP 200, Casa listed, Cofein absent.
- Legacy/v1 menu, map, branding and seasonal zones return matching data; menu compared by ID to account for SQL ordering ties.
- Map, branding and seasonal-zone responses match the pre-deploy baseline.
- Unknown restaurant: HTTP 404.
- Casa-origin CORS preflight succeeds.
- Empty booking bodies through legacy and v1 endpoints: HTTP 400. No valid booking was submitted and no guest notification was requested.
- Restaurant website: HTTP 200.

These smoke checks do not exercise a complete production reservation with real guest data or an authenticated profile. Concurrent booking protection and the mobile application remain future stages.

The Render dashboard still displayed its existing payment-failure warning. Billing settings and payment information were not changed.
