# Shared restaurant administration

Updated: 2026-11-04. Implementation is local; this document does not certify a
production rollout or completed visual browser verification.

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
  "notificationsEnabled": false
}
```

The response reads `ICurrentTenant` only: it contains no database connection,
credential, owner email, token or private configuration, and performs no database
query. The shared entry validates the returned tenant ID and uses the website
URL to resolve restaurant-relative media. This works for an unlisted restaurant
without publishing it in the public catalogue. Unknown explicit tenant selectors
still fail in the middleware before the action executes.

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
hashes. Packaging does not publish anything. The ordinary frontend Vercel config
is not the standalone package's routing configuration.

## Safe rollout

1. Review the isolated diff and test reports, complete browser checks, and retain
   the previous deployment/configuration for recovery. Do not use the unrelated
   dirty checkout as the release source.
2. Deploy the compatible backend before the shared frontend depends on
   `/api/admin/context`. No schema migration is required. Keep
   `Tenancy__MigrateOnStartup=false` and existing restaurant definitions,
   connection strings and owner credentials unchanged.
3. Add the exact shared admin origin to an unused
   `Platform__FrontendOrigins__<index>` entry. This CORS list works with
   `Platform__Enabled=false`; no platform database is needed. Do not assign the
   common origin to Casa's or Cofein's `FrontendOrigins`, which would bind that
   origin to one restaurant and make the other selector conflict. Do not replace
   existing origin entries or use a wildcard. Verify preflight permits
   `X-Tenant-Id`, `X-Admin-Token`, `Content-Type` and map revision headers.
4. Verify Cofein's product tier. A missing `AppSettings["ProductTier"]` is Basic,
   which hides Orders/Inventory and blocks operational staff roles. To provide
   the existing Pro functions, set Cofein's own value to Pro; do not bypass the
   tier in UI or promote its owner to Developer.
5. Deploy the same standalone artifact for both restaurant links. Validate
   context, login, own data, cross-tenant rejection, map revision handling and
   disabled Cofein notifications before redirecting legacy entry links. Preserve
   tenant context in redirects, bookmarks and service-worker notification clicks.

For step 4, connect directly to database `cofein` as `cofein_app`, record the prior
setting, and apply only this scoped change. This is a deployment instruction;
it was not run as part of writing this document.

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

## Verification still required and known gap

Visual desktop/mobile comparison and interactive browser verification are still
pending. Current Chrome/CDP automation commands fail; a loaded page or simulated
DOM test does not establish that clicks, navigation, maps and dialogs work in a
real browser. Record this limitation rather than treating automated API checks
as visual approval. Compare the same viewport, role, product tier and theme
against the existing Casa interface, then check both restaurants' own data and
session separation.

Cofein's public menu still reads static JSON. Editing database menu items through
the shared admin does not yet update that public page. Synchronization is a
separate unfinished task, including preservation of independently printed EUR/BGN
prices, allergen information and the one unconfirmed EUR price. This shared-admin
change does not claim to fix that flow or introduce a menu schema migration.
