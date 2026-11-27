# SeatMap / Casa di Fratelli

SeatMap is a restaurant platform serving Casa di Fratelli and Cofein through a shared API and isolated restaurant databases.

The current product includes a public restaurant website, online reservations, an interactive table map, CRM, orders, kitchen/bar workflows, inventory, marketing campaigns, events, admin roles, push notifications, and operational maintenance tools.

## Current Architecture

- `backend/SeatMap.Domain` - framework-independent reservation policies.
- `backend/SeatMap.Api` - ASP.NET Core host, application workflows, PostgreSQL adapters, migrations and background workers.
- `mobile` - Flutter guest application with domain policies, data adapters and presentation.
- `frontend` - Vite/React public website, menu, reservation UX, and admin CRM.
- `docs` - SaaS architecture notes and operating guidelines.

The application is intentionally being evolved from a single-restaurant product into a SaaS-ready platform without rewriting the project from scratch.

## Open one component

Open `workspaces/casa.code-workspace`, `cofein.code-workspace`,
`admin.code-workspace`, `backend.code-workspace` or `mobile.code-workspace`.
For a visual launcher, double-click `SeatMap.command` or run
`python3 tools/dev-hub/server.py`, then open http://127.0.0.1:4310.
See [workspace architecture and workflow](docs/development-workspaces.md).

## Run Locally

Backend:

```bash
dotnet run --project backend/SeatMap.Api/SeatMap.Api.csproj
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Production builds used during development:

```bash
dotnet build backend/SeatMap.Api/SeatMap.Api.csproj
cd frontend && npm run build
```

## Database

The API uses PostgreSQL. Configure either:

- `ConnectionStrings__DefaultConnection`
- `DATABASE_URL`
- `POSTGRES_URL`
- `POSTGRESQL_URL`

On startup the API runs EF migrations and the compatibility bootstrapper.

## SaaS Direction

The SeatMap platform foundation now includes an opt-in separate profile database,
a public restaurant directory, guest authentication, profile-backed booking, and versioned restaurant routes. The shared guest profile database is separate from restaurant operational databases.
See [platform preparation and rollout](docs/seatmap-platform.md) for the exact
boundary, migration commands and remaining release requirements.

Target model:

- One backend
- Multiple restaurant frontends
- Dedicated database per restaurant by default
- Tenant resolution by domain, subdomain, header, route, and local fallback

The first tenant abstraction exists in `Services/Tenancy`. Current behavior still resolves Casa di Fratelli as the default tenant so production is not disrupted.

## Mobile app

The Flutter app is in [`mobile/`](mobile/README.md), targeting iOS and Android with a browser review build. Live API mode includes Casa di Fratelli and Cofein, server guest registration/profile, seat maps, availability and booking creation. Russian, Bulgarian and English are supported; Bulgaria defaults to Bulgarian with a saved manual override.

- [Run and configuration](mobile/README.md)
- [Test on an iPhone](mobile/docs/IPHONE_TESTING.md)
- [Guest accounts and Render rollout](mobile/docs/GUEST_ACCOUNTS.md)

## Documentation

- [Architecture and dependency rules](docs/architecture.md)
- [Contributor guide](CONTRIBUTING.md)
- [SeatMap transition audit and staged plan](docs/seatmap-transition-audit.md)
- [Multi-tenancy](docs/multi-tenancy.md)
- [SeatMap platform and mobile preparation](docs/seatmap-platform.md)
- [Shared booking service](docs/shared-booking.md)
- [Onboarding a new restaurant](docs/onboarding-new-restaurant.md)
- [Inventory module](docs/inventory-module.md)
- [API guidelines](docs/api-guidelines.md)
- [Deployment](docs/deployment.md)

