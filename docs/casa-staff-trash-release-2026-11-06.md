# Casa staff seating and reservation trash release — 2026-11-06

## Changes

Restore Casa staff seating flexibility throughout create, edit, move, approval, arrival, walk-in and restoration. Casa permits any active tables in one zone, with an authenticated staff capacity override. Preserve exact custom table IDs, including Cyrillic 29а, enforce overlap protection and protect future bookings during map changes. Public rules and Cofein configured-only combinations remain strict. Existing 40-guest limits in map movement and walk-in flows remain.

Replace the floating reservation basket Refresh button with Bulgarian/English/Russian Restore all and Empty trash actions. Both ask for confirmation and prevent repeat submission while busy. Bulk operations snapshot all trashed reservations in the selected restaurant, including records beyond the displayed 300. Each record keeps existing authorization, transaction, conflict checks, order archival and audit behavior. Restore skips conflicts and reports success/failure counts. Permanent deletion only accepts trashed records; linked orders and order items remain archived. Active reservations and other restaurants are unaffected.

## Verification

- Backend Release solution build: zero warnings/errors.
- Reservation regression checks pass, including partial bulk restore, 302-record purge, active-booking preservation, linked-order preservation, retry and role denial.
- 111 frontend domain tests, targeted ESLint, production shared-admin build and git diff --check pass.
- 23 baseline disposable PostgreSQL HTTP checks and three focused seating HTTP scenarios pass.
- Real Chromium: seven map checks (create/edit/undersized move/custom-table merge/conflict feedback/reload), five desktop/mobile picker checks, three mobile basket checks (confirmation dismissal, partial restore, permanent empty, reload, tenant isolation). No JavaScript errors.
- Positive writes tested only on disposable local databases. Production validation uses deployment identity, public APIs, authorization guards, CORS and published artifact hashes; no live trash action is executed.

Evidence: original workspace output/casa-release-20261106/. Release source: fix/casa-admin-parity-20261104 worktree, based on cb08322. The original checkout and Cofein map/menu work remain separate.

Backend must deploy before promoting the shared-admin static artifact. No schema migration or tenant configuration change is needed. Prior backend: a3b5b0cdb8a77fbf993fd7ae637b7d0e068c317d; prior shared admin deployment: dpl_3c6tktVKNpLLuoApTNb9t2oFGNfR.
