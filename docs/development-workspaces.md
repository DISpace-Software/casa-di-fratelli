# Separate restaurant workspaces and local development hub

Implemented 27 November 2026. This is a development-tooling change, not a new
production service or a database migration.

## Architecture decision

Keep a single repository and the existing modular ASP.NET API. Restaurants are
tenants, not copies of the platform. Their operational databases remain isolated;
guest identity remains in the platform database. API tenant resolution and staff
authorization are authoritative. A workspace or a URL is not a security boundary.

The public sites are independent presentations and independently deployable Vite
entries. The staff admin and Flutter guest application are shared clients. Moving
these clients to separate repositories or creating a server per restaurant would
multiply release/configuration work without improving the current business flow.

The web source now has explicit application folders:

- `frontend/src/apps/casa`: Casa entry, route composition and public pages.
- `frontend/src/apps/cofein`: Cofein entry, design, booking flow, menu and tests.
- `frontend/src/apps/admin`: shared admin entry, authentication shell and dashboard.
- `frontend/src/admin`: shared staff feature adapters and presentation helpers.
- `frontend/src/components`, `domain`, `context`, `config`: existing shared web code.

One `frontend/package.json` and lockfile deliberately remain. They provide a single
React version, dependency installation and compatible shared modules. Splitting
npm packages today would add dependency/build plumbing without a second consumer
outside this web source tree. The existing HTML entries, Vite configs, output
folders, packaging scripts and production routing are unchanged. Assets retain
their public URLs. Mobile/backend paths and deployment roots are unchanged.

`check-architecture.py` rejects shared-to-app and cross-app dependencies. One
explicit exception preserves Casa's legacy lazy admin route. Existing legacy
coupling is documented rather than described as full application isolation.
Shared admin widgets and the large AdminPage still warrant gradual feature-level
extraction; this change does not claim to finish the earlier DDD refactoring.

## Daily workflow

1. Open a file from `workspaces/`: `casa`, `cofein`, `admin`, `backend`, `mobile`,
   or `platform`, each with the `.code-workspace` extension.
2. Only the relevant source folders and shared dependencies appear in the editor.
   Workspace tasks provide web startup/builds, backend build and Flutter analysis.
3. Use Node 22 (`nvm use 22` in your terminal), install dependencies once with
   `npm --prefix frontend ci`, and use the existing .NET 8 / Flutter toolchains.
4. Double-click `SeatMap.command` on macOS, or run:

   ```sh
   python3 tools/dev-hub/server.py
   ```

5. Open **http://127.0.0.1:4310**. Cards provide local start/stop, preview,
   workspace links, production site/admin links, hosting/log links and dependencies.
   VS Code must be installed and registered for `vscode://` links; otherwise open
   the corresponding workspace file manually. Closing the terminal stops owned
   processes. The hub is intentionally local and is not published on Vercel.

| Local process | Address | Command from frontend |
| --- | --- | --- |
| Casa | http://127.0.0.1:5173 | `npm run dev:casa` |
| Cofein | http://127.0.0.1:5175/cofein-preview.html | `npm run dev:cofein` |
| Shared admin | http://127.0.0.1:5176/r/casa-di-fratelli/admin | `npm run dev:admin` |
| Cofein admin | http://127.0.0.1:5176/r/cofein/admin | same shared admin process |

The hub and workspace tasks explicitly select **http://localhost:5183** for the
API. Raw legacy npm commands still honor the existing Vite environment/fallbacks;
use the hub/tasks when you want the local-only workflow. Local API needs separately
configured local databases, tenant definitions and local CORS origins. Without it,
visual site shells render but live reservation/admin data is unavailable. No
production credentials are copied into the hub. The backend is not auto-started
because its startup can apply migrations to the configured databases.

The mobile workspace currently provides analysis, not a one-click phone install.
Device selection, signing and deployment stay explicit. Database cards document
ownership; they do not expose SQL consoles or database credentials.

## Operational boundaries

- Hub binds only `127.0.0.1`, validates Host and requires same-origin POST plus a
  custom header. It exposes no arbitrary shell or filesystem endpoint.
- Only three predefined frontend npm tasks may launch. No deploy, migration,
  install, backend start or email action is exposed over HTTP.
- It stops only process groups it created. Occupied external ports are reported,
  not killed or silently reused. A listening port is a process readiness signal,
  not an end-to-end API health check.
- Process logs stay in a temporary directory printed at startup. They are not
  served to the browser. Do not paste secrets into logs or commit them.
- Production links are navigation links; the hub does not claim production health
  or automatically fetch private dashboards. Published versions remain visible
  in the linked Vercel/Render dashboards, not fabricated in the local panel.

## Change and release scope

| Change | Required verification | Publication |
| --- | --- | --- |
| Casa-owned source | Casa build + relevant tests | Casa site |
| Cofein-owned source | Cofein tests/build | Cofein site |
| Shared admin source | Domain tests + admin build + affected staff flow | Shared admin |
| Shared web module | Domain/Cofein tests + all three builds | Affected consumers |
| API contract/policy | .NET checks + affected clients | API and affected clients |
| Mobile UI | Flutter analyze/tests + relevant flow | App build/distribution |

Build commands and the existing static packaging scripts remain compatible.
The required web/backend CI checks and production deployment gates are now installed.
See [developer onboarding](../CONTRIBUTING.md) and [release operations](release-operations.md).

## Evidence

- Three Vite production builds pass after relocation.
- 156 web domain/contract tests and 38 Cofein checks pass.
- Architecture guard checks domain boundaries, module cycles and application imports.
- 38 isolated backend tenancy checks pass without connecting to restaurant databases.
- Six local hub HTTP/process tests cover foreign origins/hosts, command allowlisting,
  workspace targets, local API override, occupied ports and duplicate starts.
- Real Chrome exercises local startup, preview and stop for each web entry, filters
  and narrow layout. No restaurant reservation is submitted during these checks.

Run checks:

```sh
python3 scripts/check-architecture.py
python3 tools/dev-hub/test_server.py
npm --prefix frontend test
npm --prefix frontend run test:cofein
npm --prefix frontend run build
npm --prefix frontend run build:cofein
npm --prefix frontend run build:admin
```
