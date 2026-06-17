# SeatMap / Casa di Fratelli

SeatMap is a restaurant SaaS platform currently running Casa di Fratelli as the first production restaurant.

The current product includes a public restaurant website, online reservations, an interactive table map, CRM, orders, kitchen/bar workflows, inventory, marketing campaigns, events, admin roles, push notifications, and operational maintenance tools.

## Current Architecture

- `backend/CasaDiFratelli.Api` - ASP.NET Core API, PostgreSQL, EF Core migrations, background services, email, push, CRM, orders, inventory, and marketing.
- `frontend` - Vite/React public website, menu, reservation UX, and admin CRM.
- `docs` - SaaS architecture notes and operating guidelines.

The application is intentionally being evolved from a single-restaurant product into a SaaS-ready platform without rewriting the project from scratch.

## Run Locally

Backend:

```bash
dotnet run --project backend/CasaDiFratelli.Api/CasaDiFratelli.Api.csproj
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Production builds used during development:

```bash
dotnet build backend/CasaDiFratelli.Api/CasaDiFratelli.Api.csproj
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

Target model:

- One backend
- Multiple restaurant frontends
- Dedicated database per restaurant by default
- Tenant resolution by domain, subdomain, header, route, and local fallback

The first tenant abstraction exists in `Services/Tenancy`. Current behavior still resolves Casa di Fratelli as the default tenant so production is not disrupted.

## Documentation

- [Architecture](docs/architecture.md)
- [Multi-tenancy](docs/multi-tenancy.md)
- [Onboarding a new restaurant](docs/onboarding-new-restaurant.md)
- [Inventory module](docs/inventory-module.md)
- [API guidelines](docs/api-guidelines.md)
- [Deployment](docs/deployment.md)

