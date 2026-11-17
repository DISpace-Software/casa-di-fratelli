# Shared restaurant administration

Updated: 2026-11-18. The shared administration application is in production.
The API-owned on-device dictation policy is live in backend commit `af01a5a`.
The shared frontend consuming it is live from `f6ca33f`, Vercel deployment
`dpl_7dzuTeG6J2ce1oRfpJi6Af6bs6EP`.

Production uses one application at `https://seatmap-admin-eight.vercel.app`:

- Casa: `https://seatmap-admin-eight.vercel.app/r/casa-di-fratelli/admin`
- Cofein: `https://seatmap-admin-eight.vercel.app/r/cofein/admin`

Legacy `/admin` links, plus Cofein's `/cofein-admin.html`, redirect to it.
For the original 2026-11-04 rollout, frontend source was `ec3614d` and backend
source was `84e4bc7`. That historical release evidence is in the
original workspace's `output/shared-admin-qa/release.json`. Verified: 107 frontend
tests, 23 two-database HTTP checks, 6 auth DOM checks, 14 complete AdminPage DOM
checks, 18 production API checks and published-file/redirect checks. DOM checks
compare the existing Casa header/navigation classes and text; they are not
screenshots or visual approval. Notifications stay disabled for Cofein.

## One existing interface

The shared application renders the existing `frontend/src/pages/AdminPage.jsx`
with the existing Casa styles, navigation, sections and controls. It is not a
second Cofein dashboard or a redesign. The restaurant name and restaurant-owned
data change; role and product-tier permissions continue to determine available
actions. Floor-plan geometry, table capacities, zones, menu categories and media
come from the selected restaurant rather than Casa constants.

The standalone entry is `frontend/admin.html` with
`frontend/src/admin/main.jsx`. The regular Casa application and the standalone
application reuse the same admin component. The standalone build does not
include either restaurant's public landing page as an administration interface.

## Routing, identity and isolation

Restaurant links have the form:

```text
/r/casa-di-fratelli/admin
/r/cofein/admin
```

`tenantRuntime.js` validates that path. `tenantApi.js` sends `X-Tenant-Id` on
every API request, including login, session validation, public configuration,
device login, downloads and CRUD. It rejects conflicting selectors and requests
outside the configured API origin/path. An invalid shared-admin path does not
fall back to Casa.

The URL selects the restaurant; it does not grant access. Existing credentials,
hashed session tokens and device credentials remain in that restaurant's
database. There is no global staff-account merge, password search across
databases, new identity provider or staff-membership migration. A matching email
or numeric user ID in two databases does not make sessions interchangeable.

Shared browser storage keys use `seatmap:<tenant-id>:<key>`. Cached identity or
role is not authoritative: a stored session must pass `/api/admin/me`. The
shared entry handles expired sessions without letting a stale request clear a
newly established session. Legacy Casa storage keys remain separate.

Anonymous `GET /api/admin/context` is handled by the normal tenant middleware
and returns only:

```json
{
  "tenantId": "cofein",
  "name": "Cofein",
  "frontendUrl": "https://cofein.vercel.app",
  "notificationsEnabled": false,
  "reservationDictation": {
    "enabled": true,
    "mode": "on-device",
    "languages": ["bg"],
    "fields": ["guestName", "phone"]
  }
}
```

The response reads `ICurrentTenant` and the global dictation policy, with
`Cache-Control: no-store`. It contains no database connection,
credential, owner email, token or private configuration, and performs no database
query. The shared entry validates the returned tenant ID and uses the website
URL to resolve restaurant-relative media. This works for an unlisted restaurant
without publishing it in the public catalogue. Unknown explicit tenant selectors
still fail in the middleware before the action executes.

## Shared on-device dictation

`ReservationDictationPolicy` enables Bulgarian name and phone dictation for
every resolved restaurant by default, including future restaurants. Availability
does not depend on Basic/Pro and does not change reservation permissions. No
Casa allowlist, per-restaurant database setting or voice build flag is needed.
The optional global rollback is `ReservationDictation__Enabled=false` in API
configuration. A missing value enables the feature; false, empty and invalid
values disable it. The policy is separate from editable tenant branding and
from the existing, disabled server speech service.

The admin fetches `/api/admin/context` after authentication in both shared and
Casa builds, then revalidates on visible tab focus. It requires a matching
tenant, `enabled:true`, mode `on-device`, Bulgarian support and exactly
`guestName`/`phone`. Missing, malformed or failed responses leave manual entry
available without enabling another recognition service. A disabled response
cancels dictation and disposes the prepared model. Environment changes require
an API restart; an already open tab observes rollback on its next policy fetch.

Model preparation requires an explicit click. The pinned Bulgarian Zipformer
model and sherpa-onnx WASM runtime are served from the same frontend origin and
run in a dedicated Worker. Audio is processed in memory on the device, with no
upload to Render or an external ASR provider. There are no calls to the server
voice capabilities/transcription endpoints and no WebSpeech fallback. Only name
and phone have microphones; a proposed phone must be confirmed before it changes
the field. Date, time, guest count and email remain manual.

On 2026-11-18, read-only production checks confirmed the new policy and
`no-store` for Casa and Cofein, and `404 TENANT_NOT_FOUND` for an unknown tenant.
The shared frontend was then promoted after its compiled JavaScript and model
manifest matched the release package, with correct WASM/ONNX content types.
Both production restaurant routes return the exact packaged HTML. Before release,
479 domain tests and 52 browser scenarios passed, including a future tenant,
both form locations and disabling an already prepared worker without losing
manual values.
The model has been tested with synthetic Bulgarian audio in desktop Chrome and
WebKit, not with a physical iPad microphone or restaurant noise. It can recognize
wrong phone digits; confirmation is mandatory. The initial assets are about
86 MB, and the tested WASM heap reserves 512 MiB in addition to other tab memory.
Older devices may be unsupported; persistent WebKit cache and iPad airplane-mode
operation are unverified. See [the on-device guide](reservation-dictation-ondevice.md)
for accuracy evidence, lifecycle checks and reproduction instructions.

## Restaurant policies

- Cofein retains automatic booking confirmation and
  `NotificationsEnabled=false`. Push configuration returns
  `{ "enabled": false, "publicKey": null }` without creating keys. Creating or
  refreshing a subscription returns 409; removing an old subscription remains
  possible. The shared frontend must also suppress browser permission prompts
  and local notifications for this policy. Disabled email includes password-reset
  email, as before.
- Enabled Casa push configuration retains `publicKey` and adds `enabled:true`.
  Reservation push payloads add `tenantId`, while retaining the legacy `/admin`
  URL. The shared service worker can route to the restaurant-specific admin link.
- `/api/menu/seed` is Casa's catalogue importer. It returns 409 for other
  restaurants before storage writes, preventing Casa dishes from entering
  Cofein's menu. Normal restaurant menu CRUD remains available.
- Floor-plan saves retain revision conflict protection. A stale editor must not
  overwrite a newer plan, and the legacy reset endpoint remains disabled.

## Build and local runtime

Use Node 22 and .NET 8. On this Mac the compatible SDK executable is
`/Users/macbookpro/.dotnet/dotnet`; the system `dotnet` currently points to SDK 7.
For shell commands below, place the compatible SDK and PostgreSQL command-line
tools on `PATH`.

```sh
npm --prefix frontend ci
npm --prefix frontend run test
npm --prefix frontend run build
npm --prefix frontend run build:admin
```

`vite.admin.config.js` sets shared-admin mode, rewrites development restaurant
paths to `admin.html` and writes the standalone build to `frontend/dist-admin`.
Set `VITE_API_BASE_URL` explicitly for a local API or release. For example, after
starting the isolated API on port 8876:

```sh
VITE_API_BASE_URL=http://127.0.0.1:8876 npm --prefix frontend run dev:admin -- --host 127.0.0.1 --port 5176
```

Open `http://127.0.0.1:5176/r/cofein/admin` and
`http://127.0.0.1:5176/r/casa-di-fratelli/admin`.

`scripts/check-shared-admin-local.py` builds and runs the API against two new,
disposable local PostgreSQL databases. It does not accept a database URL or read
production connection settings. Its fixture root supplies only the approved
Cofein floor plan and menu JSON. Example from this worktree:

```sh
PATH=/Users/macbookpro/.dotnet:$PATH DOTNET_ROOT=/Users/macbookpro/.dotnet python3 scripts/check-shared-admin-local.py --fixtures-root /Users/macbookpro/casa-di-fratelli --report /tmp/shared-admin-api-report.json --origin http://127.0.0.1:5176 --api-port 8876 --hold --state-file /tmp/shared-admin-local.json
```

`--hold` keeps the isolated fixture alive for browser checks. Temporary login
state is written with mode 0600; do not commit or copy that file into reports.
Stop the owning process with SIGINT/SIGTERM when finished. Use a fresh state-file
path if another held fixture is already running.

Backend regression commands:

```sh
/Users/macbookpro/.dotnet/dotnet run --project backend/CasaDiFratelli.ReservationChecks --no-restore
/Users/macbookpro/.dotnet/dotnet run --project backend/CasaDiFratelli.TenancyChecks
```

Both suites passed for this change. Reservation checks cover menu seed guards,
notification side effects, context response, separate session databases with
overlapping owner IDs/emails, bearer/header compatibility and revocation.
Tenancy checks include the common origin and conflicting/unknown selectors.
The final backend build completed with zero warnings and zero errors.

`scripts/check-shared-admin-local.py` additionally exercises real PostgreSQL HTTP
login, device credentials, module endpoints and writes. Its generated report is
the evidence for a particular run. `scripts/check-shared-admin-dom.mjs` accepts
explicit happy-dom and esbuild module paths plus a report path; it checks the
React login/session shell in a simulated DOM, not the full visual admin page.

To prepare a reviewable static package, use a fresh destination:

```sh
VITE_API_BASE_URL=https://casa-di-fratelli-api.onrender.com npm --prefix frontend run build:admin
python3 scripts/package-shared-admin.py /tmp/shared-admin-release
```

The packager copies only the admin entry, compiled assets and required public
assets, writes restaurant-path rewrites and no-index headers, and prints file
hashes. It includes the versioned `speech/bg-zipformer/8d2f8f4-sherpa-1.12.36/`
manifest allowlist: model, WASM/JavaScript runtime and licenses. It checks the
pinned source/revision, file sizes and SHA256 hashes, rejects missing or altered
files, and sets WASM/ONNX content types. These assets are loaded only when the
administrator prepares dictation; browser audio never goes to the API.
Packaging does not publish anything. The ordinary frontend Vercel config
is not the standalone package's routing configuration.

## Safe rollout

1. Review the isolated diff and test reports, complete browser checks, and retain
   the previous deployment/configuration for recovery. Do not use the unrelated
   dirty checkout as the release source.
2. Deploy the compatible backend before the shared frontend depends on
   `/api/admin/context` and its dictation policy. Backend `af01a5a` already serves
   that contract; the new frontend fails closed against an older API. No schema
   migration is required. Keep
   `Tenancy__MigrateOnStartup=false` and existing restaurant definitions,
   connection strings and owner credentials unchanged.
3. Add the exact shared admin origin to an unused
   `Platform__FrontendOrigins__<index>` entry. This CORS list works with
   `Platform__Enabled=false`; no platform database is needed. Do not assign the
   common origin to Casa's or Cofein's `FrontendOrigins`, which would bind that
   origin to one restaurant and make the other selector conflict. Do not replace
   existing origin entries or use a wildcard. Verify preflight permits
   `X-Tenant-Id`, `X-Admin-Token`, `Content-Type` and map revision headers.
4. Preserve the configured restaurant product tier. A missing
   `AppSettings["ProductTier"]` is Basic, which hides Orders/Inventory and blocks
   operational staff roles. Dictation is available at either tier and requires
   no product-tier or account-role change.
5. Deploy the same standalone artifact for both restaurant links. Validate
   context, login, own data, cross-tenant rejection, map revision handling and
   disabled Cofein notifications before redirecting legacy entry links. Preserve
   tenant context in redirects, bookmarks and service-worker notification clicks.

The following SQL records the historical Cofein-only Pro provisioning performed
during the 2026-11-04 rollout. It is not a current rollout step and must not be
reapplied for dictation. The prior value and backups were stored outside the
repository; this example is not evidence of the restaurant's current tier.

```sql
BEGIN;
DO $$
BEGIN
  IF current_database() <> 'cofein' OR current_user <> 'cofein_app' THEN
    RAISE EXCEPTION 'Expected the dedicated Cofein database and role';
  END IF;
END $$;
SELECT "Key", "Value", "UpdatedAtUtc"
FROM public."AppSettings" WHERE "Key" = 'ProductTier';
INSERT INTO public."AppSettings" ("Key", "Value", "UpdatedAtUtc")
VALUES ('ProductTier', 'Pro', now())
ON CONFLICT ("Key") DO UPDATE
SET "Value" = 'Pro', "UpdatedAtUtc" = now();
COMMIT;
```

Verify `/api/product-tier` with Cofein's authenticated session. Any recovery of
this setting must use the recorded previous value in the same database only.
Do not run database bootstrap or migrations to change a product tier.

## Original verification scope and known gap (2026-11-04)

At the original rollout, visual desktop/mobile comparison and interactive
browser verification were pending because Chrome/CDP automation failed. Those
historical results do not establish that clicks, navigation, maps and dialogs
work in a real browser. Later dictation checks and their remaining physical-iPad
limitations are recorded separately in the on-device guide; the old automation
failure is not a statement about the current test environment.

The original audit also recorded that Cofein's public menu read static JSON and
database edits did not update it. That separate synchronization task included
printed EUR/BGN prices, allergens and one unconfirmed EUR price. This dictation
update does not re-audit or claim to fix that flow and introduces no menu schema
migration.
