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

- tenant-specific connection strings for future restaurants;
- VAPID keys for push notifications;
- product tier settings.

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

