# Mobile menu, visibility and future preorders

The mobile seat map only shows currently active zones and currently free tables. It reuses the same authoritative floor-plan, dated zone closure and blocked-slot API data as the public booking flow, refreshes every three seconds while visible and on resume, and removes an invalid selection. It does not reserve a table merely by selecting it; submission still validates the current layout and occupancy on the server.

## Menu

The restaurant menu uses the live menu endpoint, preserves menu item IDs and integer cent prices, filters inactive items, separates food/drinks and offers category filters, search, photo cards and dish details. Existing real photos are used; missing photos receive category artwork. Relative photo paths are resolved against the restaurant's catalog website URL. Bulgarian, English and Russian strings are included.

A centered offer after booking opens the preorder menu only when that restaurant's effective policy is enabled. Upcoming booking cards also open the menu. Restaurants without opt-in still have a browse-only menu. Demo mode previews the cart without creating restaurant orders or charging a card.

## Consent and developer control

In the shared administration profile, Developer controls the restaurant's platform master switch and commission in basis points (0–10000). Only Owner can separately opt in and accept the displayed commission and terms. Developer cannot grant owner consent. A changed commission requires renewed owner consent before the feature becomes enabled again. Policy changes are audited in the selected restaurant database.

Both controls default to off; production rollout must not opt a restaurant in on its behalf.

## Public API

- `GET /api/v1/restaurants/{restaurantId}/preorders/settings`
- `POST /api/v1/restaurants/{restaurantId}/reservations/{id}/preorders/quote`
- `POST /api/v1/restaurants/{restaurantId}/reservations/{id}/preorders`
- `GET /api/v1/restaurants/{restaurantId}/reservations/{id}/preorders`
- `POST /api/v1/restaurants/{restaurantId}/reservations/{id}/preorders/{preorderId}/checkout`

All reservation routes require `X-Reservation-Token`; email or phone alone grants no access. The server recalculates menu prices, validates active items, quantities, current zone/booking availability, serving offsets and lead time. Saving requires an approved booking, a GUID idempotency key and 1–40 distinct items, each quantity 1–20. Serving time is reservation time plus 0–120 minutes in 15-minute increments. Preorders close 30 minutes before the reservation starts. Replaying the same key and content returns the same draft; a different payload with that key is rejected.

## Administration API

`/api/preorders` uses the existing tenant selector and admin authentication:

- `GET settings`: Owner or Developer.
- `PUT platform`: Developer only, `{ enabled, commissionBasisPoints }`.
- `PUT consent`: Owner only, `{ optedIn, acceptTerms }`.
- `GET settlements?month=YYYY-MM`: Owner or Developer.

The monthly report uses the restaurant's timezone and confirmed payment ledger entries only. Gross, commission and net are EUR cents; commission snapshots belong to the order. Drafts do not appear as payments or kitchen orders.

## Current payment boundary

This release adds unpaid draft and payment-ledger infrastructure. No acquiring provider, checkout session, payment webhook, card capture, refund, kitchen dispatch or bank payout is connected. Public settings return `cardPaymentsAvailable: false`; checkout fails with `CARD_PAYMENTS_NOT_CONNECTED` and creates no payment. The app's card payment action is disabled and explicitly explains that a draft is unpaid. Monthly reports state `payoutsConnected: false` and `moneyMovementPerformed: false`.

Before activating real orders, implement the chosen acquiring provider, verified idempotent webhooks, refunds, paid order dispatch and reconciliation/payout accounting. A paid ledger entry prevents self-cancellation; an unpaid draft does not.

## Migration and validation

Restaurant migration `20261119023000_PreordersFoundation` creates only `ReservationPreorders` and `PreorderPayments` plus indexes and foreign keys. Apply to each restaurant database before deploying the API because cancellation eligibility also checks the future paid ledger. Keep startup migration and demo seeding disabled in production. No platform account migration is required.

31 preorder checks cover role restrictions, capabilities, restaurant isolation, opt-in, fee reconsent, pricing, rounding, idempotency, closed zones, pending bookings, unavailable checkout and unpaid cancellation. They pass on SQLite and isolated PostgreSQL. Flutter checks cover live map visibility, menu/cart behavior and the disabled payment action; visual artifacts are generated at iPhone size.

## Approved logo

The user selected the first refined concept, lavender/lime connected SM. It is used in native iOS/Android and web icons, discovery, sign-in and launch screens. Artwork and prompts live in `mobile/design/logo-concepts/refined`; `mobile/tool/generate_icons.py` deterministically crops/resizes it. The generated source is retained unchanged.
