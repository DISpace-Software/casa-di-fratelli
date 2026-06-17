# Onboarding a New Restaurant

## Goal

Add a new restaurant without cloning backend logic or rewriting workflows.

## Checklist

1. Create a restaurant tenant.

   Required values:

   - tenant id
   - tenant slug
   - public domain
   - database mode
   - connection string key

2. Create a dedicated PostgreSQL database.

3. Add the tenant connection string in the deployment environment.

4. Add tenant config to `Tenancy:Tenants`.

5. Deploy or connect a restaurant-specific frontend.

6. Configure CORS for the restaurant domain.

7. Seed restaurant data:

   - menu
   - table layout
   - roles/users
   - product tier
   - email sender
   - push notification settings

8. Run smoke tests:

   - public menu loads;
   - reservation can be created;
   - admin login works;
   - table map loads;
   - order flow works if Pro is enabled;
   - inventory auto deduction works if Pro is enabled;
   - email sending works.

## Recommended Restaurant Modes

Basic:

- public site;
- reservations;
- CRM basics;
- owner/admin/developer roles;
- events;
- marketing.

Pro:

- Basic features;
- waiter/kitchen/bar;
- digital ordering;
- inventory;
- reports;
- operational push notifications.

