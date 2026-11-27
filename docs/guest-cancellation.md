# Guest reservation management

New public bookings return `managementToken` once and `guestReservation` with the actual status, restaurant phone, UTC start/deadline and `canCancel`. The token is an independent 256-bit capability for that reservation, not a staff or guest-account session. Only its SHA-256 hash is stored in the restaurant's `Reservations.GuestManagementTokenHash` column; entity JSON excludes that hash.

Authenticated guest routes use `X-Reservation-Token`, never query parameters:

```text
GET  /api/v1/restaurants/{restaurantId}/reservations/{id}/guest
POST /api/v1/restaurants/{restaurantId}/reservations/{id}/cancel
```

Unknown reservations and missing/incorrect capabilities all return 404 without contact details. Tenant routing selects the dedicated restaurant database before access. Responses disable caching; the routes have a shared per-IP limit of 60 requests per five minutes. Tokens must not be logged or included in analytics or error reports.

`GuestCancellationLeadMinutes` in restaurant branding defaults to **180**. Self cancellation is permitted at the exact deadline and blocked after it. The server resolves the reserved wall-clock time using the restaurant's IANA timezone, including daylight saving time, and checks its own UTC clock. Invalid local times, completed/released/no-show/walk-in/admin bookings, arrived guests, and reservations with non-cancelled dining orders require contacting the restaurant. The rejection is 409 with `code: CONTACT_RESTAURANT` and updated reservation policy.

Cancellation uses the same database advisory-lock transaction as booking and availability writes. It retains the reservation/table links for staff history, sets `Cancelled` and `Cancelled by guest`, invalidates confirmation/order links, and adds one guest cancellation audit event. A retry with the valid capability returns the existing cancelled state, including after the deadline. Cancelled reservations no longer occupy tables.

The mobile app stores capabilities separately in iOS Keychain/Android encrypted storage, namespaced by API origin and restaurant-qualified booking ID. SharedPreferences contains booking display metadata only. The browser preview keeps capabilities in memory. The app refreshes status when opening Bookings, resuming, or pressing Refresh. A lost cancellation response is reconciled against the status endpoint before reporting failure. Legacy bookings without a capability remain contact-only: unverified contact fields cannot safely recover ownership. Booking history is still local to the device; this change does not introduce account-wide booking synchronization or email verification.

Restaurant phones are read from live branding: Casa `+359888218318`, Cofein `0893300305` (dialled as `+359893300305`). The app opens the system telephone handler only after the user taps Call and offers number copying if calling is unavailable.

## Floor-plan landmarks

Schema version 1 gains optional `landmarks`: `id`, `zoneId`, `kind`, `x`, `y`, `width`, `height`, optional translated `names`. Coordinates are percentages of the room; dimensions must be positive and remain within 0–100. Supported kinds are `window`, `entrance`, `terraceEntrance`, `restaurantEntrance`, `tv`, `wall`, `bar`.

Absent/null landmarks retain Casa's original presentation presets from the website. An explicit empty list removes them. Casa indoor windows, side entrance, partition and terrace entrance; covered terrace windows, TV and entrance; and open-terrace restaurant entrance mirror `frontend/src/apps/casa/pages/ReservationPage.jsx`. Other restaurants never inherit Casa furniture. Cofein currently has no authoritative landmark coordinates; its plan returns an empty list until the restaurant supplies them. The mobile renderer supports its future markers without another app change.

## Rollout

Apply restaurant migration `20261119000311_GuestReservationManagement` to **both dedicated restaurant databases before deploying** this API. It adds one nullable varchar(64) column and leaves existing reservations unchanged. No platform database migration is needed. The old API tolerates the additive column. Do not generate/replace restaurant plans or seed menus as part of rollout.

Validation covers capability isolation, missing/wrong keys, exact deadline and one tick after, Sofia winter/summer offsets, invalid DST time, arrived/order restrictions, idempotency, audit history and released availability. HTTP adapter checks exercise cross-restaurant denial and actual status/cancel routes. Flutter checks cover header transport, capability exclusion from JSON, late rejection, response-loss reconciliation, phone normalization, map data, and existing user flows. Production verification uses reads and invalid capabilities, without creating restaurant bookings or sending notifications.
