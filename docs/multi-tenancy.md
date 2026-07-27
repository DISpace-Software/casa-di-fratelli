# Multi-tenancy architecture

SeatMap uses one ASP.NET Core backend and a dedicated PostgreSQL database for
each restaurant. Frontends may be deployed independently with different
domains, branding, assets, and `VITE_API_BASE_URL`, while keeping the API
contract identical.

## Request and database flow

```text
restaurant frontend
        |
        | Origin and optionally X-Tenant-Id
        v
TenantResolutionMiddleware
        |
        v
CurrentTenant (request scoped)
        |
        v
TenantDatabaseConnectionResolver
        |
        v
AppDbContext -> tenant PostgreSQL database
```

Resolution order:

1. `X-Tenant-Id`;
2. `{tenant}` route value;
3. `{tenantSlug}` route value;
4. configured frontend `Origin`;
5. API subdomain;
6. configured tenant domain;
7. default tenant only when `RequireKnownTenant` is `false`.

If both `Origin` and `X-Tenant-Id` are present, they must resolve to the same
tenant. This prevents one restaurant frontend from routing browser requests to
another restaurant database.

## Tenant configuration

Each active entry under `Tenancy:Tenants` requires:

```json
{
  "Id": "restaurant-bella",
  "Name": "Restaurant Bella",
  "Slug": "restaurant-bella",
  "Domain": "restaurantbella.bg",
  "FrontendUrl": "https://restaurantbella.bg",
  "FrontendOrigins": [
    "https://restaurantbella.bg",
    "https://www.restaurantbella.bg"
  ],
  "IsActive": true,
  "DatabaseMode": "DedicatedDatabase",
  "ConnectionStringKey": "RestaurantBella",
  "SeedDefaultMenu": false,
  "AdminEmailConfigurationKey": "BELLA_ADMIN_EMAIL",
  "AdminPasswordConfigurationKey": "BELLA_ADMIN_PASSWORD"
}
```

Runtime secrets:

```text
ConnectionStrings__RestaurantBella=<postgres connection string>
BELLA_ADMIN_EMAIL=owner@restaurantbella.bg
BELLA_ADMIN_PASSWORD=<unique strong initial password>
```

`DATABASE_URL`, `POSTGRES_URL`, and `POSTGRESQL_URL` remain compatibility
fallbacks only for the `DefaultConnection` tenant.

## Adding a restaurant

1. Create a dedicated empty PostgreSQL database.
2. Add one tenant definition. Do not create separate entries for `www`; add
   every frontend URL to `FrontendOrigins`.
3. Add its connection string and unique initial admin credentials as secrets.
4. Deploy its frontend with the shared backend in `VITE_API_BASE_URL`.
5. Restart the backend.

At startup the backend validates tenant configuration and, for every active
tenant:

- opens that tenant database;
- applies EF migrations;
- applies the compatibility schema bootstrap;
- creates the initial owner only when the database has no administrators;
- seeds the Casa di Fratelli menu only when `SeedDefaultMenu` is explicitly
  `true`.

The default menu must normally remain disabled for new brands.

## Background jobs and backups

Marketing and scheduled backup workers iterate through active tenants. Every
iteration creates a fresh dependency-injection scope, resolves the tenant, and
opens only that tenant database.

JSON backups are stored in a tenant-specific subdirectory:

```text
DataBackups/<tenant-id>/
```

This prevents backup listing and downloads from mixing restaurant files.

## Strict production mode

`RequireKnownTenant` remains `false` for backward compatibility with direct
Casa di Fratelli API calls. Once every production frontend origin is listed,
set:

```json
{
  "Tenancy": {
    "RequireKnownTenant": true
  }
}
```

Unknown origins/tenant IDs then fail before controller or database access.

## Configuration validation

Startup fails fast when:

- there are no active tenants;
- tenant IDs, slugs, or frontend origins are duplicated;
- the default tenant is absent from the active tenant list;
- a connection string key, frontend URL, or admin credential key is missing;
- a database mode other than `DedicatedDatabase` is requested.

Failing startup is intentional: serving a request from the wrong database is
worse than temporary unavailability.

## Current boundaries

Physical data isolation is implemented. Existing controller contracts and
entity schemas remain unchanged.

Brand-specific email copy, push text, restaurant phone numbers, opening hours,
and public frontend content still contain Casa di Fratelli defaults in several
features. Before onboarding a differently branded restaurant, move those
values into a tenant branding/settings service. This is separate from database
isolation and should be done incrementally without changing reservation APIs.

Shared-database tenancy is deliberately unsupported. If added later, every
tenant-owned table must receive `TenantId`, composite uniqueness constraints,
and EF global query filters.
