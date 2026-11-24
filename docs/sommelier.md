# Restaurant sommelier

The server owns selection. Mobile sends a restaurant route, dish ID and optional serving, style and price ceiling. TenantResolutionMiddleware selects the restaurant DB and rejects conflicting tenant selectors. Prices and active flags are read from that restaurant's current MenuItems. There is no LLM dependency or invented wine inventory.

## Data and matching

- Platform DB: SommelierWines contains reusable wine profiles, producer/name/vintage in Name, source/tasting provenance, style, body/acidity/sweetness/tannin on 0–5 scales and alcohol %. Only Developer can edit this shared catalogue.
- Platform DB: SommelierRules contains versioned initial weights for balance, freshness, sweetness, spice and umami. Numeric weights are product heuristics, not scientific probabilities. Hard conflicts still apply when weights change.
- Restaurant DB: SommelierProfiles links a menu ID to a dish profile or a shared wine. Serving, availability and verification belong to that restaurant. Profiles cascade when a menu item is deleted. Wines are not assigned across tenants automatically.
- Restaurant administrators/owners/developers can maintain their own profiles in Menu → Online sommelier. Profiles default to unverified/unavailable. Sauce and preparation belong in the dish's intensity/acidity/fat/heat/etc. values and notes; notes are not silently interpreted by an AI.
- Recommendations require verified dish and wine profiles, verified local mapping, Available=true, an active menu position and a positive price. Hard conflicts reject sweet dishes with insufficiently sweet wine and very spicy food with high tannin/alcohol. Remaining candidates are scored, filtered, sorted deterministically and deduplicated by wine, then limited to three.
- Saving a preorder rechecks availability of mapped wines in addition to existing active-item and price validation. This is restaurant-maintained availability, not a stock reservation or bottle inventory integration.

Pairing dimensions are informed by [WSET's pairing principles](https://www.wsetglobal.com/news-insights/insight-opinion/four-rules-to-masterful-food-and-wine-pairing/) and [WSET's discussion of spice](https://www.wsetglobal.com/news-insights/insight-opinion/how-to-pair-drinks-with-spice/). The scoring weights are our initial heuristic and should be calibrated with restaurant feedback. Personal preference is subjective; no confidence percentage is shown.

## Incomplete restaurant menus

Specific producer labels are not mandatory: a restaurant can verify a house-wine profile from tasting/provenance. However, a generic position combining red/white/rosé is not a verified profile. For an unprofiled dish, the API returns separately labelled menuOptions for active wine-category/name positions and status `consultation`; these are **not** pairing recommendations and the mobile UI does not offer a direct preorder action for ambiguous options. Budget applies; unknown style/serving cannot be certified. Without wine positions the response is `no_wines` with a contact action. With verified profiles but no matching candidates the response is `no_match`.

As inspected on 24 November 2026, Casa's published menu has no wine positions. Cofein lists generic glass wine, dessert wine and sangria. No producer, tasting profile, availability confirmation or new menu position was fabricated to populate the feature.

## Deployment

1. Apply restaurant migration 20261124175322_SommelierProfiles to every restaurant DB with the migration owner. Grant the actual runtime role SELECT/INSERT/UPDATE/DELETE on only SommelierProfiles. Verify access with that role. Existing menu/profile/order records are not rewritten.
2. Deploy backend, then apply platform migration 20261124175331_SommelierCatalogue using the separate `--MigratePlatform=true` job before publishing mobile/admin access to the feature. Keep restaurant startup migration settings unchanged.
3. Publish standalone shared admin package, then mobile 1.1.0 (8). The public restaurant websites are unchanged. The API is reusable by a future public web menu integration.

For PostgreSQL migration scripts use AppDbContextFactory's `--postgres` design-time argument. It uses a dummy local connection for script generation, never production credentials. The normal SQLite design-time path is preserved. Do not scaffold unrelated legacy schema drift into feature migrations.

## Validation

`dotnet run --project backend/SeatMap.SommelierChecks`: scoring conflicts, explanations, verification, budget/style/serving filters, availability, generic fallback and two-database isolation.

Flutter sommelier tests exercise budget parsing, real recommendation display and generic consultation without a misleading order action. Menu/cart regression tests remain in the suite. Admin component has a successful production build and ESLint check. PostgreSQL migration scripts were exercised in a disposable local database with rule/profile reads.

## Release evidence — 24 November 2026

- Restaurant migrations applied to Casa and Cofein using the database owner. Cofein runtime CRUD/read access verified as `cofein_app`.
- Platform job `job-dc2t3irrjlhs73dmr360` succeeded and seeded five shared rules; restaurant startup migration policy was not changed.
- Shared administration deployment `dpl_7KhuRZEME5kVon3sobm91mJkHeuc` promoted to the existing `seatmap-admin-eight.vercel.app` alias. Staged and public HTML matched the reviewed standalone package.
- Live API reads: Casa `no_wines`, Cofein `consultation` with four menu options, conflicting tenant selectors rejected, configuration endpoint requires authentication, invalid budget rejected.
- Backend: 17 sommelier checks plus existing guest/account checks passed. Mobile: 77 passed, 8 optional visuals skipped; separate sommelier image capture inspected. Flutter analysis and admin component ESLint clean; admin production build passed.
- iPhone 14 Plus: version 1.1.0 (8) installed. Automatic launch denied because the device was locked; manual launch remains to be observed.
