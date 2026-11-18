# Guest registration and profile

The backend now implements a guest account API independent of restaurant administrator authentication. Flutter live mode uses it; it never falls back to the test account after an API failure.

## Fields and behaviour

Required registration fields: first name, last name, email, international phone, password, password confirmation and explicit privacy consent. Passwords accept long phrases (12–128 characters). City, country and date of birth are optional. Communication language is Russian, Bulgarian or English; this preference is independent of the app's Russian/Bulgarian/English interface setting. Marketing consent is optional and off by default; saving the preference does not send campaigns or notifications.

The profile editor saves all fields to the server and prefills reservation contacts. Changing the login email requires the current password and a unique normalized email. Changing the password revokes all sessions. Deleting an account requires its password and an explicit confirmation, removes platform data and sessions, and leaves restaurant reservation records intact. It does not cancel reservations.

Email and phone ownership are **not verified** by this release. Password recovery/email verification are not implemented. The consent text is a product draft and should be replaced with the operator's published policy before release. No verified-contact status is presented.

## Server API

```text
POST   /api/v1/guest/register
POST   /api/v1/guest/login
GET    /api/v1/guest/me
PUT    /api/v1/guest/me
POST   /api/v1/guest/logout
POST   /api/v1/guest/password
DELETE /api/v1/guest/me
```

Protected endpoints accept the opaque session token as `Authorization: Bearer ...`. Tokens last 30 days, are stored only as SHA-256 hashes in the database, and are checked for expiration/revocation on every protected request. Passwords use ASP.NET Core Identity PasswordHasher with 210,000 PBKDF2 iterations. Login failure checks use a dummy hash for unknown accounts. Five failed logins lock the account for 15 minutes. Account mutations/authentication are limited to 20 requests per five minutes per observed client IP; responses return 429 and Retry-After. Configure trusted forwarded headers appropriately for the production reverse proxy before relying on per-client IP partitioning; arbitrary forwarded headers are not trusted by this application.

Native session tokens use flutter_secure_storage (iOS Keychain / Android encrypted storage). Android cloud backup is disabled; iOS keychain entitlements are included. No passwords/tokens are written to SharedPreferences. Browser preview tokens live only in memory, so a reload requires signing in again. Native builds still need full Xcode and Android SDK validation.

Documentation: [ASP.NET Core password hasher](https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.identity.passwordhasheroptions?view=aspnetcore-8.0), [secure storage](https://pub.dev/packages/flutter_secure_storage).

## Isolated local preview

Restaurant search/menu/map/bookings still use the production restaurant API. Guest account requests can be routed to a separately running local backend, using independent local PostgreSQL databases and no production database credentials.

From `mobile/`:

```sh
python3 tool/init_guest_dev.py
python3 tool/run_guest_dev.py
```

In a second terminal:

```sh
SEATMAP_GUEST_API_UPSTREAM=http://127.0.0.1:5289 python3 tool/serve_live_preview.py
```

The preview server listens on http://127.0.0.1:5188. Build its release with `--dart-define=SEATMAP_API_BASE_URL=http://127.0.0.1:5188`. It forwards only explicitly allowed guest operations, passes the guest Authorization header only to the guest backend, and exposes no admin API. The local development API is at http://127.0.0.1:5289. The scripts require local PostgreSQL tools and .NET 8. Database metadata lives in ignored `.local/guest-dev.json`; PostgreSQL data is under a private temporary directory and persists while that directory is retained. These are development accounts, not production accounts.

## Production rollout

Deployed on Render on 2026-11-19 (local Europe/Sofia date), backend commit `f40aca4`, deployment `dep-dbv2na97lnhs7390bppg`. Database `seatmap-platform` uses Basic-256mb with 1 GB storage in Ohio, disk autoscaling off, and external connections disabled after migration. API uses the internal connection URL via Render environment variables. Secrets are not committed. Live registration/profile/logout/login/deletion were checked using a synthetic account that was then deleted; no restaurant booking was submitted.

Checked-in `Platform:Enabled` remains false for unconfigured deployments; the production Render environment overrides it to true. Guest endpoints return 503 when disabled. Existing restaurant migrations are unchanged. Cofein's existing tenant is now published through `Tenancy__Tenants__1__IsListed=true`; its connection and notification settings are preserved.

For a future deployment:

1. Provision a dedicated PostgreSQL database; it must differ from every restaurant database. Set `Platform__Enabled=true` and `ConnectionStrings__SeatMapPlatform` on the API host.
2. Run `dotnet SeatMap.Api.dll --MigratePlatform=true` as a separate deployment command. Do not combine it with `--MigrateRestaurants=true`.
3. Deploy the updated API and app. Use HTTPS. For a direct browser client, allow its exact origin in `Platform__FrontendOrigins`; native clients do not use browser CORS.
4. Perform the signup/profile flow against staging first. Confirm native secure storage and production rate limiting behind the actual proxy.

The migration extends GuestProfiles and adds GuestCredentials/GuestSessions only in PlatformDbContext. Guest accounts work across restaurants without storing credentials in any restaurant database. Existing guest favourites and reservation-reference tables are preserved; their API integrations and cross-device booking history are outside this change.

## Validation

```sh
dotnet run --project backend/SeatMap.GuestChecks
# Optional: disposable PostgreSQL database dedicated to this check only:
GUEST_CHECKS_POSTGRES='Host=127.0.0.1;Port=...;Database=seatmap_guest_checks;Username=seatmap_dev' \
  dotnet run --project backend/SeatMap.GuestChecks
```

The check applies platform migrations in the explicitly supplied PostgreSQL test database (or uses ephemeral SQLite by default), creates synthetic accounts, exercises registration/validation/profile/login/logout/password change/expiry/lockout/deletion, and deletes them. Never point it at a production database.

Flutter tests cover the registration UI, password-confirmation validation, complete registration payload, token restore/logout, expired-session handling and server field errors. Existing restaurant and tenant checks remain applicable.
