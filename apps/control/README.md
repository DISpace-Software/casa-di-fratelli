# SeatMap Control

Internal navigation portal for DISpace Software. This app belongs to the SeatMap
monorepo; it is not a restaurant website or a replacement for the staff admin.

Published panel: https://seatmap-control.vercel.app (Vercel sign-in required).

## Access

Vercel project: `seatmap-control`, team: `stepan2215s-projects`.
**Deployment Protection → Vercel Authentication → All Deployments** is required.
This protects production, preview URLs, HTML, JavaScript and the catalog at the
hosting boundary. Sign in using the existing Vercel account with project access.
New collaborators must be granted access deliberately in Vercel; GitHub access
alone does not grant access to this panel. Do not disable protection or distribute
protection bypass links. Restaurant admin authentication remains separate.

The repository is public, as it was before the rename. Catalog metadata and source
are therefore public; this portal must never contain credentials, guest records,
database connection strings or confidential operational information.

## Ownership and structure

- `index.html`: accessible page structure and onboarding.
- `app.js`: catalog rendering, search and category filters; no server mutations.
- `catalog.json`: component paths, dependencies and service links.
- `style.css`: responsive styling.
- `vercel.json`: CSP, anti-framing, noindex and content-type headers.

The source branch is recorded explicitly in `catalog.json`. It describes code,
not necessarily the version deployed by each service. Actual production versions,
availability and logs are available in the linked hosting dashboards. The panel
does not pretend that a configured URL is a successful health check.

Local launcher: `tools/dev-hub`; it owns local processes and must stay on loopback.
Do not deploy that Python server to Vercel. This online app serves static files only.

## Local preview

```sh
python3 -m http.server 4311 --bind 127.0.0.1 --directory apps/control
```

Open http://127.0.0.1:4311. Local preview is deliberately not authenticated;
production protection is configured in the Vercel project, not JavaScript.

## Deployment

Use the existing Vercel project with root directory `apps/control`, framework
Other, no build/install command, no environment secrets. Git source:
`DISpace-Software/seatmap`. Production source is `main`. Restaurant sites and API deploy separately.

The initial production release was explicitly deployed from commit `e9d178a`.
Git integration uses `main`, which now contains this application. Updates go through
the repository verification workflow and a pull request.

Before each release verify All Deployments protection. After release an anonymous
request to `/`, `/catalog.json` and `/app.js` must be denied or redirected to login;
an authenticated request must serve the expected content. Check search, category
filters, code links and narrow viewport layout. Updating repository metadata or
this portal must not trigger an unreviewed backend production rollout.

## Rename

The platform repository was renamed from `casa-di-fratelli` to `seatmap` on
2026-11-27. Repository ID and history are unchanged. Update existing clones:

```sh
git remote set-url origin https://github.com/DISpace-Software/seatmap.git
```

Keep Casa restaurant branding, tenant IDs and existing API hostname unchanged.
GitHub redirects old repository links; do not create a new repository with the
old name, which would take over those redirects.

## Release verification — 2026-11-27

- Production deployment `dpl_3Xqq1hb9MMvbE4mGkTNFWqJdUCGA` reached Ready.
- Anonymous requests for HTML, catalog and JavaScript redirect to Vercel login.
- Authenticated HTML and catalog responses match the committed source byte-for-byte.
- Browser checks passed: eight components, category filters, search, empty state,
  no JavaScript errors and no horizontal overflow at 390px width.
- All source/workspace paths exist. Repository architecture checks passed.
- Render and the existing Casa Vercel project recognize `DISpace-Software/seatmap`
  with the same GitHub repository ID; the Casa preview build reached Ready.
