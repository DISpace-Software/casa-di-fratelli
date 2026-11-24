# SeatMap waitlist

Implemented 2026-11-25. Mobile 1.2.0 (10).

## Guest flow

When the selected zone has no available table for the party, the map offers a waitlist request. A verified SeatMap account with a phone number is required. Date, party size and zone are inherited from the booking search; guests can select up to five times. Requests are stored on the server, not just the device. One active request per guest, restaurant and date; up to three active dates per restaurant, and 200 requests per restaurant/date.

The account inbox aggregates requests across active restaurants. The app refreshes it every 15 seconds while foregrounded and on resume. Reservations shows waiting, offered and paused requests; closed requests appear in history. Other tabs show an offer banner. Editing times or resuming moves a request to the back of the matching queue. Declining or missing an offer pauses it; the guest must explicitly resume.

## Allocation and integrity

A tenant-scoped worker runs approximately every 10 seconds. It matches requests in queue order against the restaurant's actual floor plan, configured combinations, public capacity limits, zone closures, restaurant closure, public table holds, lead time and three-hour reservation separation. Among valid selections it prefers the smallest sufficient capacity. The default offer lasts five minutes (admin-configurable 3–10).

Allocation, ordinary bookings, confirmation, walk-ins, staff changes, hall blocks and public holds share the PostgreSQL restaurant advisory lock. Active offers block overlapping booking writes and appear in public blocked slots. Floor-plan edits cannot invalidate a held table. The background scheduler and public bookings are not a strict priority queue: before an offer has been allocated, a newly available table remains publicly bookable.

Confirmation checks guest ownership, offer ID and expiry under the lock, then uses the ordinary booking service. The verified account supplies name/contact details. A successful confirmation becomes an approved booking. Repeated/concurrent confirmation does not create another reservation. Recovering a confirmation response issues a fresh guest management capability, revoking an earlier capability for that booking. Capabilities are stored in the mobile secure store, not preferences. The normal booking cancellation rules still apply.

## Notifications

**System iOS push is not enabled.** The current personal-team provisioning profile has no `aps-environment`; the user confirmed a free Apple developer account. Never claim that a closed app will receive an APNs alert. The interface explicitly describes email and the in-app inbox.

Guest-requested offers use the same configured SeatMap account email identity (`Platform:Email:ApiKey`, `Platform:Email:From`, with existing `RESEND_API_KEY`/`FROM_EMAIL` fallback), independently of staff/marketing notification switches. A persisted 30-second delivery lease prevents parallel workers from sending concurrently. The offer ID is the provider idempotency key. Failed delivery retries up to five times while the offer remains live; only provider success sets `EmailSentAtUtc`. The deadline is in the restaurant's timezone. Delivery is not guaranteed, and a delayed email can arrive after expiry; the server always rechecks the offer.

The worker revalidates the guest account and uses its currently verified email before sending. Emails instruct the guest to open SeatMap → Reservations; there is no email auto-confirm action or native deep link.

To add APNs later: paid Apple Developer team and Push Notifications entitlement, APNs signing key stored only on server, authenticated device-token registration/rotation/revocation, provider delivery adapter using the same offer ID and expiry, and notification-tap routing into the inbox. Official references: https://developer.apple.com/help/account/reference/supported-capabilities-ios/ and https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns . No fake push permission prompt or unused device-token collection is included.

## Restaurant operations

Reservations in the admin includes a waitlist panel: date filter, active offers/deadlines, contact information, email delivery state, pause/resume of new offers, offer duration, and closure with a required audit reason. Staff can enter a request for an existing verified SeatMap account after confirming the guest asked for it. Metrics cover the displayed result set (maximum 300 entries): requests, booked requests, waiting/offered and parties marked arrived/completed. No inferred revenue metric is presented.

A pause stops new requests/offers; existing offers remain valid. Existing restaurant hours and seasonal zones constrain matching. Per-weekday waitlist switches, paid priority, deposits, SMS and manual reordering are not implemented. Large parties still follow each restaurant's contact rule.

## Schema and verification

Migration `20261124213328_Waitlist` only creates `WaitlistEntries` and its two indexes; no existing bookings are rewritten. Cofein's restricted application role receives CRUD permission on this new table. The migration snapshot preserves the legacy baseline rather than silently scaffolding unrelated drift.

`dotnet run --project backend/SeatMap.WaitlistChecks` checks eligibility, verified identity, idempotency, exclusive holds, expiry, rollover, access boundaries and real HTTP join → inbox → confirmation. Optional `WAITLIST_TEST_POSTGRES` must point to a dedicated database named `seatmap_waitlist_checks_*`; it also checks parallel allocator and confirmation requests. No actual guests are contacted.

Mobile checks cover explicit confirmation, expiry, authenticated offer version, and visual layout. The complete pre-existing mobile suite and reservation regression suite were also run. Screenshot: `mobile/.local/waitlist-offer.png` (synthetic fixture, not a real reservation).
