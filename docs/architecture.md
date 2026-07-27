# SeatMap Architecture Audit

## Executive Summary

The project has strong product depth for a first restaurant: reservations, table map, CRM, ordering, kitchen/bar workflows, inventory, marketing, events, roles, push notifications, and maintenance tooling already exist.

The main architectural gap is that the codebase is still shaped as a single-restaurant application. It is not yet cleanly separated into Domain/Application/Infrastructure/API layers, and tenant isolation is only beginning. The correct path is incremental extraction, not a rewrite.

## What Was Found

- Backend is an ASP.NET Core API with EF Core and PostgreSQL.
- Models, services, controllers, migrations, background jobs, and infrastructure live in one API project.
- Inventory exists with ingredients, recipes, stock movements, audits, auto deduction, and extras.
- Operational soft delete exists for reservations, orders, and order items.
- Audit logging exists and is used in important admin workflows.
- Role logic exists in `AdminRoleAccess`.
- Public frontend is reasonably modular.
- Admin frontend is concentrated in `AdminPage.jsx`, which is now the largest UI risk.
- Tenant resolution and dedicated database routing now exist in the API.

## Architectural Problems

1. Single project backend

   Domain entities are EF models and sit directly inside the API project. This is acceptable for an early product, but it will slow SaaS scaling.

2. Controllers are too large

   `ReservationsController`, `DiningOrdersController`, and `InventoryController` contain significant business workflow logic. Over time, this should move to application services/use cases.

3. Admin frontend is too concentrated

   `AdminPage.jsx` is over 10k lines. It should be split by bounded context: reservations, orders, inventory, marketing, users, maintenance, reports.

4. Tenant isolation uses dedicated databases

   HTTP requests now resolve a tenant before `AppDbContext` is constructed.
   Each tenant maps to its own connection string, startup initialization and
   background jobs iterate tenant-by-tenant, and backup files are separated by
   tenant. Shared-database mode remains intentionally unsupported.

5. Floor map model is still not fully domain-driven

   The current map works, but the SaaS target needs explicit `FloorPlan`, `FloorSection`, `RestaurantTable`, `MapElement`, and `TableLink` entities.

6. Table combination logic should be link-driven

   Future table combinations should depend on stored `TableLink` rules rather than coordinate assumptions.

## What Should Be Fixed Next

1. Extract backend projects gradually:

   - `SeatMap.Domain`
   - `SeatMap.Application`
   - `SeatMap.Infrastructure`
   - `SeatMap.Api`

2. Move business workflows from controllers into use-case services:

   - create reservation
   - move reservation
   - release table
   - create dining order
   - complete/pay order
   - deduct inventory
   - run marketing campaigns

3. Extract tenant branding and operational settings:

   - restaurant name, phone and email identity
   - opening hours and timezone
   - email/push templates
   - frontend theme and feature flags

4. Split admin frontend into feature modules.

5. Formalize map domain with table links and floor plans.

## What Should Not Be Done Now

- Do not rewrite the project from scratch.
- Do not move all files into Clean Architecture projects in one huge commit.
- Do not add `TenantId` columns to every table until the tenant strategy is confirmed.
- Do not change live restaurant behavior while introducing SaaS foundations.

## SaaS Readiness

Current state: strong restaurant product, early SaaS foundation.

Readiness estimate:

- Product depth: high
- Single restaurant stability: medium-high
- SaaS tenant data isolation: medium-high
- Operational tooling: medium-high
- Code modularity: medium

Recommended next milestone: tenant branding/settings extraction and gradual
admin frontend feature decomposition.
