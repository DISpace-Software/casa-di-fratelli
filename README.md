# SeatMap

SeatMap is a multi-restaurant platform developed by **DISpace Software**. It brings together restaurant websites, table reservations, floor plans, staff operations and a Flutter guest app. **Casa di Fratelli** and **Cofein** are restaurants on the platform, not alternative names for the platform itself.

## Start here

- **[SeatMap Control](https://seatmap-control.vercel.app)** — navigation to restaurant sites, administration, source code, workspaces and hosting dashboards. Sign in with a Vercel account that has access to the project. Restaurant administrator access is separate.
- **[Casa di Fratelli](https://casadifratelli.bg)** · **[Cofein](https://www.cofeinclub.com)** — public restaurant websites.
- **[Mobile app setup](mobile/README.md)** — Flutter configuration and development instructions.

Control is a navigation portal, not a live monitoring system or a remote process launcher. Deployment versions and operational status are available in the linked hosting dashboards.

## Architecture

SeatMap uses a **shared, modular ASP.NET Core backend** with separate restaurant websites and a shared staff administration app. It is not a collection of one backend microservice per restaurant.

| Component | Responsibility |
| --- | --- |
| `backend/SeatMap.Api` | .NET 8 API, application workflows, PostgreSQL/EF Core, integrations and background services |
| `frontend` | React/Vite restaurant websites and shared staff administration |
| `mobile` | Flutter guest application for iOS and Android, with a browser review build |
| Restaurant databases | Restaurant-specific reservations and operational data |
| Platform database | Shared guest accounts and profile data |
| `docs` | Architecture, onboarding and deployment documentation |

Restaurant context is resolved by the API's tenancy layer. Domain, route and other supported selectors are governed by the configured tenant rules. Guest identity is separate from restaurant administrator authentication. Database credentials and provider secrets belong in deployment configuration, never in the repository or Control catalog.

## Repository and release status

This repository was renamed from `casa-di-fratelli` to **`seatmap`**. The restaurant's name, tenant identifiers and existing service URLs do not need to change with the repository name.

The default branch is `main`. Changes go through pull requests and the required
`Verify` web/backend checks. Each application has a separate deployment target;
a successful web deployment does not imply that the API was deployed too.
See [release operations and migrations](docs/release-operations.md).

- [`frontend/src/apps`](frontend/src/apps) — separate Casa, Cofein and admin entry points.
- [`apps/control`](apps/control) — protected hosted navigation portal.
- [`workspaces`](workspaces) — focused editor workspaces.
- [`tools/dev-hub`](tools/dev-hub) — local-only launcher, opened with `SeatMap.command`.
- [Development workflow](docs/development-workspaces.md) — ownership and commands.

## Features and configuration boundaries

The codebase includes reservations and availability, interactive floor plans, menus and preorders, CRM, kitchen/bar workflows, inventory, events, marketing, waitlists and wine pairing from each restaurant's available assortment. Feature availability depends on restaurant configuration, permissions and the deployed version.

Guest registration, login and profile APIs are implemented and used by the mobile app. See [guest accounts and rollout](mobile/docs/GUEST_ACCOUNTS.md) for supported operations and remaining limitations, including contact verification and password recovery.

Notification code does not imply every delivery channel is enabled. Email requires a configured sender/provider; a shared corporate sender domain is still pending. Native iOS push requires Apple Push Notifications entitlements and credentials; the current free Apple Developer setup does not provide that production push configuration.

## Local development

Prerequisites: **Node.js 22**, **.NET 8**, and isolated **PostgreSQL** development databases. Mobile development additionally requires Flutter and the relevant platform SDKs.

Install web dependencies:

```sh
npm --prefix frontend ci
```

Run one web application against your local API (replace the URL with your configured local listener):

```sh
# Casa website
VITE_API_BASE_URL=http://localhost:5183 npm --prefix frontend run dev

# Cofein website
VITE_COFEIN_API_BASE_URL=http://localhost:5183 npm --prefix frontend run dev:cofein

# Shared administration
VITE_API_BASE_URL=http://localhost:5183 npm --prefix frontend run dev:admin
```

Configure local tenant/database settings before starting the backend:

```sh
dotnet run --project backend/SeatMap.Api/SeatMap.Api.csproj
```

The API's startup can run migrations and compatibility initialization. Use development databases; do not point a local test instance at production. Restaurant connection settings and the platform database are configured separately. See [multi-tenancy](docs/multi-tenancy.md) and [guest database setup](mobile/docs/GUEST_ACCOUNTS.md).

Build individual web targets:

```sh
npm --prefix frontend run build
npm --prefix frontend run build:cofein
npm --prefix frontend run build:admin
dotnet build backend/SeatMap.Api/SeatMap.Api.csproj
```

## Documentation

- [Architecture](docs/architecture.md)
- [Multi-tenancy](docs/multi-tenancy.md)
- [Shared booking service](docs/shared-booking.md)
- [Onboarding a restaurant](docs/onboarding-new-restaurant.md)
- [Mobile configuration](mobile/README.md)
- [Testing on iPhone](mobile/docs/IPHONE_TESTING.md)
- [Guest accounts and deployment](mobile/docs/GUEST_ACCOUNTS.md)
- [Inventory](docs/inventory-module.md)
- [API guidelines](docs/api-guidelines.md)
- [Deployment](docs/deployment.md)
- [Platform preparation](docs/seatmap-platform.md) and [transition audit](docs/seatmap-transition-audit.md) — staged planning documents; consult their release boundaries alongside current code and rollout records.
