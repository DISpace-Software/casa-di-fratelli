# Multi-Tenancy

## Target Model

SeatMap should support:

- one shared backend;
- multiple restaurant frontends;
- dedicated database per restaurant by default;
- optional shared database mode later;
- strict tenant isolation.

## Tenant Definition

The initial tenant contract contains:

- `Id`
- `Name`
- `Slug`
- `Domain`
- `DatabaseMode`
- `ConnectionStringKey`

This maps to the future persistent `Tenant` entity:

- `Id`
- `Name`
- `Slug`
- `Domain`
- `IsActive`
- `DatabaseMode`
- `ConnectionStringKey`
- `CreatedAt`
- `UpdatedAt`

## Current Tenant Resolution

The first safe implementation is in `backend/CasaDiFratelli.Api/Services/Tenancy`.

Resolution order:

1. `X-Tenant-Id` header
2. route value `tenant`
3. route value `tenantSlug`
4. subdomain
5. configured domain
6. default tenant fallback

Today all unresolved local or production requests fall back to Casa di Fratelli. This preserves current behavior.

## Next Backend Step

Introduce a tenant-aware database connection resolver:

- read `ICurrentTenant.ConnectionStringKey`;
- map it to the correct connection string;
- create `DbContext` using that tenant-specific connection;
- keep one database per restaurant as the default SaaS mode.

## Tenant Isolation Rules

No restaurant may access another restaurant's:

- reservations;
- orders;
- menu;
- tables;
- floor plans;
- inventory;
- CRM;
- marketing;
- audit logs.

For dedicated databases, isolation is mostly physical. For any future shared database mode, every tenant-owned table must have `TenantId` and EF global filters.

