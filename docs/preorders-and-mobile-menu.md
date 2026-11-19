# Mobile menu, visibility and future preorders

The mobile seat map only shows currently active zones and currently free tables. It reuses the same authoritative floor-plan, dated zone closure and blocked-slot API data as the public booking flow, refreshes every three seconds while visible and on resume, and removes an invalid selection. It does not reserve a table merely by selecting it; submission still validates the current layout and occupancy on the server.

## Menu

The restaurant menu uses the live menu endpoint, preserves menu item IDs and integer cent prices, filters inactive items, separates food/drinks and offers category filters, search, photo cards and dish details. Existing real photos are used; missing photos receive category artwork. Relative photo paths are resolved against the restaurant's catalog website URL. Bulgarian, English and Russian strings are included.

A centered offer after booking opens the preorder menu when that restaurant's saved platform policy is enabled. Upcoming booking cards also open the menu. Restaurants with the platform switch off still have a browse-only menu. Demo mode previews the cart without creating restaurant orders or charging a card.

## Developer activation

In the shared administration, **DEV management → Services & commission** lets Developer control the restaurant's platform switch and commission in basis points (0–10000). Saving this switch is sufficient to activate preorders: Owner confirmation is not required. Changing the commission keeps the feature enabled; new drafts snapshot the new fee, while existing drafts retain their original financial amounts. Only Developer can edit the policy, and each change is audited in the selected restaurant database. Owner can view the current status, commission and monthly report.

The platform switch defaults to off. This release needs no migration or policy-data rewrite: an existing saved `platform.enabled: true` immediately becomes effective after deployment. Historical owner consent records and audit entries remain unchanged and are returned for compatibility only. They never control activation, and obsolete consent writes are explicitly rejected rather than fabricating acceptance.

## Public API

- `GET /api/v1/restaurants/{restaurantId}/preorders/settings`
- `POST /api/v1/restaurants/{restaurantId}/reservations/{id}/preorders/quote`
- `POST /api/v1/restaurants/{restaurantId}/reservations/{id}/preorders`
- `GET /api/v1/restaurants/{restaurantId}/reservations/{id}/preorders`
- `POST /api/v1/restaurants/{restaurantId}/reservations/{id}/preorders/{preorderId}/checkout`

Public settings expose `enabled` directly from the restaurant's saved platform policy and `activationMode: "developer"`. Quote, draft and checkout eligibility use the same switch. Turning it off blocks new quote/draft/checkout requests, while existing unpaid drafts remain readable with the reservation capability token.

All reservation routes require `X-Reservation-Token`; email or phone alone grants no access. The server recalculates menu prices, validates active items, quantities, current zone/booking availability, serving offsets and lead time. Saving requires an approved booking, a GUID idempotency key and 1–40 distinct items, each quantity 1–20. Serving time is reservation time plus 0–120 minutes in 15-minute increments. Preorders close 30 minutes before the reservation starts. Replaying the same key and content returns the same draft; a different payload with that key is rejected.

## Administration API

`/api/preorders` uses the existing tenant selector and admin authentication:

- `GET settings`: Owner or Developer.
- `PUT platform`: Developer only, `{ enabled, commissionBasisPoints }`.
- `PUT consent`: legacy Owner-authenticated route; returns `410 PREORDER_MANAGED_BY_PLATFORM` without changing consent, policy or audit records. Older clients should refresh and present settings as read-only.
- `GET settlements?month=YYYY-MM`: Owner or Developer.

Admin settings expose `enabled`, `activationMode: "developer"` and `consentNeedsRenewal: false`, alongside `platform` and historical `restaurant` / `termsVersion` fields. Owner and Developer retain read-only settings and report access; only Developer may edit activation and fees.

The monthly report uses the restaurant's timezone and confirmed payment ledger entries only. Gross, commission and net are EUR cents; commission snapshots belong to the order. Drafts do not appear as payments or kitchen orders.

## Current payment boundary

This release adds unpaid draft and payment-ledger infrastructure. No acquiring provider, checkout session, payment webhook, card capture, refund, kitchen dispatch or bank payout is connected. Public settings return `cardPaymentsAvailable: false`; checkout fails with `CARD_PAYMENTS_NOT_CONNECTED` and creates no payment. The app's card payment action is disabled and explicitly explains that a draft is unpaid. Monthly reports state `payoutsConnected: false` and `moneyMovementPerformed: false`.

Before activating real orders, implement the chosen acquiring provider, verified idempotent webhooks, refunds, paid order dispatch and reconciliation/payout accounting. A paid ledger entry prevents self-cancellation; an unpaid draft does not.

## Migration and validation

Restaurant migration `20261119023000_PreordersFoundation` creates only `ReservationPreorders` and `PreorderPayments` plus indexes and foreign keys. Apply to each restaurant database before deploying the API because cancellation eligibility also checks the future paid ledger. Keep startup migration and demo seeding disabled in production. No platform account migration is required.

Migration ownership and application access are separate. A migration executed by the database owner can create these tables successfully while the restaurant API uses a different role with no access to them. In that state, guest booking status and cancellation fail with PostgreSQL `42501` (`permission denied for table PreorderPayments`), even when the restaurant has never enabled preorders.

After every preorder migration, connect with **each restaurant's actual API runtime credentials**, rather than the migration/owner connection, and run the read-only guard in `scripts/verify-preorder-runtime-access.sql`. For example, with a locally configured PostgreSQL service holding the runtime connection: `PGSERVICE=cofein-runtime psql -X -v ON_ERROR_STOP=1 -f scripts/verify-preorder-runtime-access.sql`. Repeat for Casa. The script checks schema usage, table CRUD privileges, any ID-sequence usage, and the cancellation payment relationship inside a read-only transaction that rolls back. Current preorder IDs are UUIDs and require no sequences.

If access is missing, the table owner should grant the intended restaurant runtime role `SELECT, INSERT, UPDATE, DELETE` on **only** `public."ReservationPreorders"` and `public."PreorderPayments"`, consistent with the application's other restaurant tables. Do not change table ownership, use a superuser for the API, or grant access to all databases/tables as a shortcut. Run the guard again with the runtime connection and verify an authenticated read-only admin settlement request; do not cancel a customer's reservation as a smoke test. The Cofein repair on 19 November 2026 added these two table grants to its existing `cofein_app` role; Casa already had access. No booking, consent, order or payment data changed.

47 preorder checks cover role restrictions, capabilities, restaurant isolation, developer activation without consent, fee changes, historical consent preservation, obsolete-write rejection, disablement, pricing, rounding, idempotency, closed zones, pending bookings, unavailable checkout and unpaid cancellation. They pass on SQLite and isolated PostgreSQL. Flutter checks cover live map visibility, menu/cart behavior and the disabled payment action; visual artifacts are generated at iPhone size.

## Approved logo

The user selected the first refined concept, lavender/lime connected SM. It is used in native iOS/Android and web icons, discovery, sign-in and launch screens. Artwork and prompts live in `mobile/design/logo-concepts/refined`; `mobile/tool/generate_icons.py` deterministically crops/resizes it. The generated source is retained unchanged.
