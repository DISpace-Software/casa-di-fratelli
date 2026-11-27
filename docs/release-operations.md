# SeatMap release operations

## Release ownership

One repository, one protected `main`, separate deployment projects. A repository
rename is not a tenant/domain/database rename. Secrets remain with Render/Vercel.

| Target | Root | Build | Runtime |
| --- | --- | --- | --- |
| Casa | repository | `python3 scripts/build-web-release.py casa` | Vercel static |
| Cofein | repository | `python3 scripts/build-web-release.py cofein` | Vercel static |
| Shared admin | repository | `python3 scripts/build-web-release.py admin` | Vercel static |
| Control | `apps/control` | none | Vercel static, all deployments protected |
| API | `backend` | Dockerfile | Render, .NET 8 |

Web installs use `npm --prefix frontend ci` and Node 22. Build Output API v3
contains target-specific routing/headers. `/release.json` identifies the source
commit and application. This is build provenance, not a health check. Do not
publish `frontend/dist` to the Cofein/admin project or reuse another project's ID.

## Review and deployment

1. Open a PR against current `main`. GitHub `Verify` must pass web and backend
   jobs. No production credentials are available to those tests.
2. Review schema changes and compatibility with currently deployed clients.
3. Merge only the tested, current PR head. Force pushes/deletion of `main` are
   blocked. The solo-maintainer setup requires PRs and passing checks, not an
   impossible self-approval by a second reviewer.
4. Vercel production aliasing is blocked until both GitHub checks pass. Web projects build independently. Verify the production `/release.json`,
   tenant admin route, site, menu and availability; do not create a real booking.
5. Render uses `checksPass`, with `backend/**` build filtering (excluding Markdown). API release requires the migration assessment below. Keep automatic schema
   mutation disabled. Check the API catalog and each restaurant's read endpoints.
6. Record deployed SHA and deployment IDs. A failed build must leave the previous
   successful deployment serving traffic.

## Database migrations

Production has isolated restaurant database targets and a separate guest account
store. `Tenancy__MigrateOnStartup=false` must remain set. Treat application rollback
and database rollback as different operations.

Before a schema release:

- List migration changes against the currently deployed API commit, not just the
  previous Git commit. Identify affected restaurant/platform databases.
- Confirm a usable recent backup/recovery point and rehearse restoration in an
  isolated database. Record duration, row-count/schema checks and recovery point.
  Never restore into the live target as a test.
- Test the migration on an isolated restored database. Verify both the old and new
  application versions can operate during rollout. Prefer additive changes; defer
  column removal until old versions no longer use it.
- Execute the intended release artifact with exactly one migration mode:
  `dotnet SeatMap.Api.dll --MigratePlatform=true` for platform, or
  `dotnet SeatMap.Api.dll --MigrateRestaurants=true` for active restaurant databases.
  The latter iterates all configured active restaurants: review that list first.
  Do not combine modes; use a controlled one-off job/shell with server-side config.
- Check exit status and EF migration history, then publish the compatible API.
  If migration fails, stop rollout. Do not run automatic down-migrations.

The pipeline does not run migrations, backups, production SQL or email tests.
Restoration is not claimed verified merely because the provider reports a database
available. HA, backup retention and restore drills are distinct concerns.

## Rollback

For web apps, promote the previous verified production deployment in the same
Vercel project; check its commit and domain. For API, redeploy the previous known
compatible commit. If the schema is no longer backward compatible, use a reviewed
forward fix or the rehearsed recovery procedure; never assume code rollback
undoes a migration. Keep access protection enabled during rollbacks.

## Email

Resend is called from the API. Casa currently has verified sender domains;
Cofein notifications remain disabled until its intended sender is configured.
A future shared SeatMap sender requires domain ownership/DNS verification,
server-side credentials, tenant-aware branding and Reply-To routing. Do not enable
email merely by wiring the website or renaming a repository. Do not send test mail
to restaurant customers.

## Health checks and current limitations

Render probes `/api/v1/restaurants`, a public read-only catalog endpoint. This
checks HTTP application readiness; it is not a deep probe of every restaurant
database, email delivery or booking transaction. Check tenant-specific read flows
after rollout. Do not report this shallow probe as proof of complete system health.

The restaurant PostgreSQL service previously allowed external access from all IPs.
Before narrowing its allowlist, verify all consumers (including external admin
tools) and internal API connection paths. Backup restoration has not been exercised
by this release setup. No database or email credentials are copied into GitHub.
