# Casa staff seating parity — 2026-11-05

Implemented and verified locally in `/private/tmp/casa-admin-parity-20261104`, branch `fix/casa-admin-parity-20261104`, baseline `cb08322`. No deployment was performed. The original checkout's unfinished changes were preserved.

## Behavior

Casa staff can select any active tables in one zone, including the exact saved Cyrillic ID `29а`, independently of public combination rules. `staffCombinationMode` is restaurant-owned plan metadata: legacy Casa defaults to `same-zone`; Cofein and other tenants default to `configured`. Explicit saved policies remain authoritative. Public bookings cannot gain staff combination privileges.

Authenticated staff capacity overrides now cover create/edit chips, map moves and move suggestions. Suggestions list adequate seating first and retain smaller available choices. Move errors remain visible with the draft retained; duplicate saves are blocked while a request is pending.

Create, edit, move, approve, arrive, walk-in, restore and future-plan validation use the same staff policy. Exact configured table IDs are preserved; conflict queries include exact and case-folded forms for databases whose uppercasing does not handle Cyrillic. Active tables/zones, closure checks, overlap checks and authentication remain enforced. Future bookings protect custom table IDs and permitted seating policy when editing the plan.

## Verification

- 111 frontend domain tests passed, including undersized move suggestions and custom-table policies.
- Backend reservation checks passed, including CasaStaffParityChecks and the existing capacity regression checks.
- Shared admin production build succeeded with Node 22; targeted ESLint and git diff --check passed.
- 23 baseline HTTP checks against two disposable PostgreSQL databases passed.
- Three additional real HTTP scenarios passed: exact Casa IDs, full staff reservation lifecycle on 29+29а, public/authentication/Cofein policy guards.
- Real Chromium desktop: create six guests at four-seat table23; display duplicate conflict without losing form input; edit to seven; move to six-seat table29; move to 29+29а; retain saved state after reload. Seven browser checks passed, no JavaScript errors.
- Real Chromium desktop/mobile list: create/edit above nominal capacity, reload persistence, 390px layout, Cofein single-table capacity override with unconfigured second table disabled. Five browser checks passed, no JavaScript errors.

Screenshots and machine-readable evidence: `/Users/macbookpro/casa-di-fratelli/output/casa-admin-parity-20261105/`.

Reusable checks: scripts/check-casa-seating-api.mjs, scripts/check-casa-seating-map-browser.mjs and scripts/check-casa-seating-picker-browser.mjs. Browser scripts accept private fixture state, output directory, Playwright module and Chromium executable as explicit arguments. Local fixture credentials are not included in reports or source.

## Remaining scope

Production still requires publishing the compatible backend and shared admin artifact together. No customer reservations or production restaurant plans were changed in this task. Cofein public-menu synchronization and its architectural-map branch remain separate work.
