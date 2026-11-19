# Guest email verification and live restaurant maps

Mobile loads the restaurant floor plan, public blocking slots, seasonal zone settings and dated restaurant closure from the live restaurant API. While the map is visible and the app is in the foreground, it refreshes every three seconds without a loading overlay. Network latency is additional; this is polling, not an instantaneous push stream. Requests do not overlap. Responses for a superseded date/time/party size are discarded. Returning to the map or resuming the app also refreshes it.

Moving, adding, deleting or deactivating tables therefore changes the open mobile map. Removing a selected table, moving it to another room, closing its room or occupying it clears the invalid selection. Closed rooms remain labelled **Closed** with disabled tabs; another open room is selected automatically. Dated whole-restaurant closures disable all rooms on affected dates. Seasonal closure remains in force until staff reopen the room. Casa's `openTerrace` uses the existing live seasonal setting; no closure is hardcoded in Flutter.

Availability is fetched again before submitting a booking. The server remains authoritative and checks closures, the current floor plan, capacities, holds and competing reservations during the booking transaction. Polling does not reserve a selected table.

## Email account flows

Platform account mail uses a dedicated `IGuestEmailSender` and Resend, independent of restaurant notification switches (including Cofein's disabled booking notifications).

- Registration saves an unverified account and returns a challenge, without a session token. Entering the emailed six-digit code verifies email and creates a session.
- Login rejects an unverified account with `403 EMAIL_NOT_VERIFIED`; mobile offers the verification screen. Existing accounts also need to verify their email once. Previously issued sessions for unverified accounts are refused.
- Forgot password accepts an email and returns the same challenge-shaped response for known and unknown accounts. Unknown accounts receive no mail. Mobile does not reveal whether the email exists.
- A valid reset code changes the password, verifies email ownership, clears login lockout and revokes all existing sessions. It does not automatically log the user in.
- Changing email requires the current password, clears verification and revokes sessions. Mobile then offers verification of the new address. Codes issued for a previous address are rejected.

Codes expire after ten minutes, allow five attempts, are single use, and are replaced when another code of the same purpose is sent. Sending is limited to once per minute per account across both purposes and by the existing per-IP auth limiter. Database stores an HMAC of the code and challenge ID, never the clear code. The private server key prevents offline enumeration of the six-digit space from a database dump. Claiming a code and completing verification/reset run in one serializable transaction; failed attempt counts are persisted outside it. All account responses use `Cache-Control: no-store`.

The UI and emails support Bulgarian, English and Russian. Codes support native one-time-code autofill/paste. Password reset requires at least 12 characters and matching confirmation.

## API

All paths below have the prefix `/api/v1/guest` and are platform endpoints, without a restaurant context.

| POST path | Request | Result |
| --- | --- | --- |
| `/register` | Existing registration fields | 201 challenge |
| `/email/code` | `email` | 200 challenge |
| `/email/verify` | `challengeId`, `code` | 200 session and profile |
| `/password/forgot` | `email` | 200 challenge |
| `/password/reset` | `challengeId`, `code`, `newPassword`, `confirmPassword` | 204 |

Challenge shape: `challengeId`, `expiresAtUtc`, `resendAfterSeconds` (60). Generic responses for ineligible/unknown addresses deliberately contain an opaque, nonfunctional challenge. A resend during the cooldown does not send another email. The UI disables resend during this interval.

## Deployment

Apply platform migration `20261119005634_GuestEmailSecurity` before deploying the API. It adds nullable email verification/cooldown timestamps and the challenge table, preserving existing profiles. No restaurant database migration is needed.

Configure private Render environment variables:

- `Platform__Email__CodeSecret`: random private value, at least 32 characters. Keep stable across instances/redeployments. Rotation invalidates outstanding codes.
- `Platform__Email__From`: SeatMap sender on a verified Resend domain.
- `Platform__Email__ApiKey`: optional dedicated Resend key; otherwise existing `RESEND_API_KEY` is used.

Sender falls back to `FROM_EMAIL` if a platform sender is absent. Mail failures produce `503 EMAIL_DELIVERY_FAILED`; they never grant a session or mark an address verified. An account created before a delivery failure can resume through login → verify email, or password recovery.

## Validation

`SeatMap.GuestChecks` runs real HTTP account flows against isolated SQLite and PostgreSQL with a capturing mail transport: registration gating, code replay, email change, cooldown, unknown address, wrong-purpose code, five-attempt lockout, expiry, recovery, old-password rejection and session revocation. Flutter tests cover registration → code → authenticated profile, recovery UI, automatic map refresh, deletion of selected tables and disabled closed zones. Existing booking checks cover server-side closure and current-table validation. Production email smoke testing must use the provider's documented `delivered+label@resend.dev` test sink, never an arbitrary customer's address.
