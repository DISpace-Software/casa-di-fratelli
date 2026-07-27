# Deployment

## Current Production Shape

- Frontend: Vercel
- Backend API: Render
- Database: Render PostgreSQL
- Email: Resend
- Domain: `casadifratelli.bg`

## Required Environment Variables

Backend:

- `ConnectionStrings__DefaultConnection` or `DATABASE_URL`
- `RESEND_API_KEY`
- `FROM_EMAIL`
- `ADMIN_EMAIL`
- `ADMIN_URL`

Optional:

- tenant-specific connection strings such as `ConnectionStrings__RestaurantBella`;
- tenant-specific initial owner secrets referenced by each tenant definition;
- VAPID keys for push notifications;
- product tier settings.
- `BACKUP_DIRECTORY` pointing to a persistent disk or external mount for weekly readable customer/reservation backup files.

## Backups

Keep database-provider PostgreSQL backups enabled as the primary recovery layer.
The admin Maintenance page also creates readable JSON exports of customers and reservations.
Manual exports are downloadable immediately, and the API can create automatic exports on the schedule configured in the admin Maintenance page.
In production, set `BACKUP_DIRECTORY` to persistent storage; the default local `DataBackups` folder is only a fallback.

## Deploy Safety

Before deployment:

```bash
dotnet build backend/CasaDiFratelli.Api/CasaDiFratelli.Api.csproj
cd frontend && npm run build
```

After deployment:

- check `/api/menu`;
- check admin login;
- create a test reservation;
- check Render logs for migration errors;
- confirm frontend CORS domain.

## Adding another frontend and database

The full onboarding contract is documented in
[`multi-tenancy.md`](multi-tenancy.md). A production tenant needs a unique
connection string key, frontend URL/origins, and unique initial owner
credentials. Reusing a connection string key across active tenants is rejected
at backend startup.
