# Multi-tenancy architecture

SeatMap uses one ASP.NET Core backend and a dedicated PostgreSQL database for
each restaurant. Frontends may be deployed independently with different
domains and the same build: public identity and reservation rules are loaded
from the resolved tenant through `GET /api/branding`.

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
6. Sign in as `Owner` or `Developer`, open the administrator settings, and
   save the restaurant name, contacts, localized address/opening hours, logo,
   social links, timezone, and reservation limits.

At startup the backend validates tenant configuration and, for every active
tenant:

- opens that tenant database;
- applies EF migrations;
- applies the compatibility schema bootstrap;
- creates the initial owner only when the database has no administrators;
- seeds the Casa di Fratelli menu only when `SeedDefaultMenu` is explicitly
  `true`.

The default menu must normally remain disabled for new brands.

## Branding and business settings

Branding is stored as `tenant.branding.v1` in the tenant's own `AppSettings`
table. It therefore follows the same database isolation and backup policy as
the restaurant's reservations and customers. The public endpoint exposes only
display content and reservation rules. Provider credentials and sender
addresses are never returned to the browser.

The editable settings include:

- restaurant name, phone, public email, logo and review/social URLs;
- Bulgarian, English, and Russian address and opening-hours text;
- IANA timezone;
- public lead time and maximum booking window;
- public/admin latest reservation time and walk-in service times.

The frontend keeps Casa di Fratelli values only as a compatibility fallback
while its branding request is unavailable. A non-Casa tenant returned by the
API receives empty contacts/assets rather than inheriting Casa links.

Email and push credentials remain server-side and are scoped by tenant. For a
tenant ID `restaurant-bella`, use environment variables equivalent to:

```text
Tenancy__Email__restaurant-bella__RESEND_API_KEY=<resend key>
Tenancy__Email__restaurant-bella__FROM_EMAIL=Restaurant Bella <reservations@mail.restaurantbella.bg>
Tenancy__Email__restaurant-bella__MARKETING_FROM_EMAIL=Restaurant Bella <offers@mail.restaurantbella.bg>
Tenancy__Email__restaurant-bella__REPLY_TO_EMAIL=hello@restaurantbella.bg
Tenancy__Email__restaurant-bella__UNSUBSCRIBE_EMAIL=hello@restaurantbella.bg
Tenancy__Email__restaurant-bella__VAPID_SUBJECT=mailto:owner@restaurantbella.bg
```

Global email variables remain a compatibility fallback for Casa di Fratelli
only. This prevents a newly added restaurant from sending through Casa's
identity by mistake.

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
- a database mode other than `DedicatedDatabase` is requested;
- two tenant connection strings target the same host, port, and database;
- IDs can collide after backup-path normalization;
- aliases, domains, IDs, slugs, or frontend origins overlap between tenants.

Failing startup is intentional: serving a request from the wrong database is
worse than temporary unavailability.

## Current boundaries

Physical data isolation and runtime branding are implemented. Editorial home
page content such as awards, chefs, gallery photographs, delivery providers,
SEO files (`robots.txt`, sitemap, web manifests), and legal documents are
deployment content. Review or replace those files for each restaurant before
publishing its public site.

The shared backend remains one deployment failure domain: a failed startup
migration for one tenant prevents the service from starting for every tenant.
For a larger fleet, move migrations to a controlled deployment job and add
per-tenant health monitoring.

Shared-database tenancy is deliberately unsupported. If added later, every
tenant-owned table must receive `TenantId`, composite uniqueness constraints,
and EF global query filters.
