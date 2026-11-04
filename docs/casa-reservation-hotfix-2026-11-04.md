# Casa staff reservation regression — 2026-11-04

## Incident and cause

The shared administration loaded, but creating a six-guest reservation for
Casa table 23 failed. The table's nominal capacity is four. Before the
floor-plan migration, capacity checks applied to public bookings only;
authenticated staff could manage seating themselves. The migration applied
the nominal capacity restriction to staff too. The map dialog then discarded
the returned error and showed a generic failure.

## Fix

Source commit: `a3b5b0cdb8a77fbf993fd7ae637b7d0e068c317d`.

An explicit, strict-by-default capacity override restores the previous
authenticated staff workflow across creation and subsequent staff actions.
Public booking capacity, authentication, active tables/zones, permitted
combinations and overlap protection remain enforced. Nominal table capacities
are unchanged. Future staff bookings still prevent their tables from being
disabled or renamed. Walk-ins retain the legacy maximum of 40 guests.

The existing administration now returns the actual save error to the map
dialog. Both map and list forms keep entered data after failure. The shared
admin shell and the unpublished Cofein architectural-map branch are separate
from this release.

## Verification and release

- 30 backend regression groups pass; Release build has no warnings/errors.
- 23 disposable PostgreSQL/API baseline checks and eight real Chromium/API
  incident scenarios pass: six guests at table 23, edit, approve/arrive,
  conflict feedback/form retention, public capacity and authentication guards.
- Test reservations were cancelled in the disposable local database.
- Positive booking writes were tested locally; production verification used
  deployment identity, startup logs, public metadata, CORS and artifact hashes.
  No customer reservation or restaurant floor-plan data was edited in production.

Render service `srv-d7drmgl8nd3s73dvukn0` deployed the exact source commit as
`dep-dbliuh942hec738c0q2g`, live at 2026-11-04 13:13:38 UTC.
Startup logs contain no observed startup errors; Casa metadata/context return
200 and the shared-admin preflight returns 204.

Vercel project `seatmap-admin` (`prj_NIjBY6LiopcLCV43C5gqOKtQWD9l`) promoted
the tested static package as `dpl_3c6tktVKNpLLuoApTNb9t2oFGNfR`:
`https://seatmap-admin-eight.vercel.app/r/casa-di-fratelli/admin`.

Reports and screenshots are in the original workspace at
`output/casa-incident-20261104/`. They contain no credentials.

Previous backend commit for recovery: `84e4bc727b6cd0710cba52a18866baddec9d4795`.
Previous frontend deployment: `dpl_FdAfzC6XaNHxp268hvbYsU8XpHDS`.
Returning to either previous version reintroduces this regression and is not
required by the successful verification.

Before publishing any older feature branch (including the pending Cofein map),
bring this hotfix into its source so a later deployment cannot remove it.
