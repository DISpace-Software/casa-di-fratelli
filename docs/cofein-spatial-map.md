# Cofein website and architectural map

The active Cofein website and map implementation is integrated from `feat/cofein-booking-ux-20261113`. The isolated entry is `frontend/cofein-preview.html`; `vite.cofein.config.js` builds it into `frontend/dist-cofein`. It does not replace Casa's public entry. The retired coffee-opening experiments are excluded.

## Public website

The landing page includes the existing Cofein identity, responsive restaurant photographs, space/gallery views, contact links, a searchable food/drink menu and a booking dialog. Menu and booking components load when opened. The site menu uses the source branch's bundled Cofein catalog; it does not update restaurant menu data or the mobile app's live menu.

Booking requires explicit `VITE_COFEIN_BOOKINGS_ENABLED=true` and `VITE_COFEIN_API_BASE_URL` configuration. All booking requests use `/api/v1/restaurants/cofein`, disable caching and omit browser credentials. There is no Casa fallback. Branding, opening/booking times, the saved map, blocked slots, seasonal closures and dated restaurant closures come from the current API. Submission rechecks availability; uncertain network results prevent an immediate duplicate submission and direct the guest to contact the restaurant.

The current API's additional landmark and guest-management response fields are compatible. This website retains its existing confirmation/contact flow; native app booking management and preorders remain separate features.

## Map data and presentation

The API floor-plan document remains the source of table IDs, zones, active state, coordinates, capacity, combinations and revision. No database migration, default map import or live restaurant data rewrite is required. New halls use separate map areas; renaming a hall retains its stable ID. Unknown table IDs use generic furniture. Inactive halls/tables are excluded from interactive map geometry.

Cofein's original `interior` and `exterior` booking zones are projected from their saved 5–95 coordinates into one architectural scene. The four detailed views are camera views of that scene, not additional booking zones. The public map, working admin map and editor reuse the same geometry and furniture renderer. Local editor drafts stay separate from saved operational data and use the revision returned with the loaded map when saving.

The architecture traces the owner's supplied `20260907_162344.jpg` plan. It is a visual drawing, not a measured survey. Ambiguous main-entrance/glazing details are not new booking areas. Architecture, furniture rotations and camera views are web presentation; they do not add API landmarks or automatically replace Flutter's native renderer.

## Verification

Run public unit tests with `node --test src/apps/cofein/*.test.js` from `frontend`, then build with `npm run build:cofein`. Browser checks under `scripts/check-cofein-*` require an explicitly configured local origin or disposable fixture. The scenarios that create bookings or edit maps verify `localOnly` and localhost before writing. Never point those fixture checks at production.

The 38 public unit checks cover API isolation, policy/time windows, availability, combinations, closures, current additive metadata, request/result validation, duplicate-attempt protection, contact validation and map selection. Current integration-wide verification and release evidence are recorded separately; historical branch test totals are not release evidence for a new build.

The current browser suites are `check-cofein-booking-workspace-browser.mjs`, `check-cofein-main-browser.mjs`, `check-cofein-admin-halls-browser.mjs` and `check-cofein-flexible-map-browser.mjs`. Earlier scripts targeting the retired booking steps are excluded. The flexible-map suite creates a disposable booking and verifies that reservation history prevents deleting its table; cleanup cancels the booking, restores original furniture and deactivates the added test hall/table. Stop the fixture process to remove its temporary databases.

`docs/cofein-floor-plan.initial.json` is the original 30-table fixture recovered from repository history for `check-shared-admin-local.py`. It is not a deployment seed. Never import it over a restaurant's live floor plan.

## Packaging

Use Node 22. Build the shared admin with `VITE_API_BASE_URL` and `npm --prefix frontend run build:admin`, then run `python3 scripts/package-shared-admin.py <fresh-directory>`. Build Cofein with `VITE_COFEIN_BOOKINGS_ENABLED=true`, `VITE_COFEIN_API_BASE_URL` and `npm --prefix frontend run build:cofein`, then run `python3 scripts/package-cofein-site.py <fresh-directory>`. Both packagers exclude unrelated application assets. Select the corresponding Vercel project explicitly; the repository's existing link may identify Casa's public website.

The integration preserves current main's Developer controls, manager/Owner permissions, direct Developer preorder activation, guest cancellation and account services. No backend runtime or database migration changes are part of this integration. Flutter continues to consume live schema-v1 plans using its existing native renderer.
