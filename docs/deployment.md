# Deployment

## Current Production Shape

- Frontend: Vercel
- Backend API: Render
- Database: Render PostgreSQL
- Email: Resend
- Domain: `casadifratelli.bg`

## SeatMap API project name

The backend project is now `backend/SeatMap.Api/SeatMap.Api.csproj` and the
published entry point is `SeatMap.Api.dll`. The Docker build context remains
`backend`; `backend/Dockerfile` publishes and starts the renamed project.

For a deployment configured with explicit commands instead of Docker, update
the project path and DLL name in the hosting settings before deploying this
revision. With `backend` as the working directory, a publish command is:

```sh
dotnet publish SeatMap.Api/SeatMap.Api.csproj -c Release -o out
dotnet out/SeatMap.Api.dll
```

This repository rename does not rename the Render service or change its public
URL. The existing frontend API URL, Casa tenant ID, connection configuration and
database migration IDs are retained. Hosting settings have not been changed by
the local rename. A public URL change requires its own client migration.

### Render dashboard follow-up — 3 November 2026

The Render project display name was changed from `Casa di Fratelli` to `SeatMap`
and confirmed in the dashboard. Its existing `Production` environment remains.
User-provided screenshots subsequently confirmed the API service name
`seatmap-api` and PostgreSQL instance label `casa-di-fratelli-db` on the same
service IDs. The API's displayed URL remains
`https://casa-di-fratelli-api.onrender.com`; PostgreSQL shows `Available`.
The old Node service `casa-di-fratelli` remains
suspended; it was not resumed or removed.

Observed API build settings: root directory `backend`, Dockerfile `./Dockerfile`,
Docker context `.`, empty Docker command override and empty pre-deploy command.
These settings already resolve the repository Dockerfile after the local project
rename. No deploy was triggered; the dashboard still showed live commit `3911dd8`.

The project, API and restaurant database display-name changes are complete.
The user completed the API/database renames after browser button operations
timed out. The PostgreSQL instance label is distinct from its SQL database name,
username and connection string; those connection values were not inspected in
this follow-up. Render integration was suggested but connection has not been
confirmed. The screenshots still show live commit `3911dd8`: renaming resources
does not deploy the local SeatMap code changes.

## Required Environment Variables

For the verified SeatMap release on 3 November 2026, see
[the production release report](seatmap-release-2026-11-03.md).

Backend:

- `ConnectionStrings__DefaultConnection` or `DATABASE_URL`
- `RESEND_API_KEY`
- `FROM_EMAIL`
- `MARKETING_FROM_EMAIL`
- `REPLY_TO_EMAIL`
- `UNSUBSCRIBE_EMAIL`
- `ADMIN_EMAIL`
- `ADMIN_URL`

Recommended production values:

```text
FROM_EMAIL=Casa di Fratelli <reservations@mail.casadifratelli.bg>
MARKETING_FROM_EMAIL=Casa di Fratelli <offers@mail.casadifratelli.bg>
REPLY_TO_EMAIL=<a monitored restaurant mailbox>
UNSUBSCRIBE_EMAIL=<a monitored restaurant mailbox>
```

Keep transactional and marketing senders separate so complaints about offers do
not directly damage the reputation of reservation confirmations. Do not use a
`noreply` sender.

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
dotnet build backend/SeatMap.Api/SeatMap.Api.csproj
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
