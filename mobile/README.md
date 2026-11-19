# SeatMap mobile

Flutter MVP for **iOS and Android**, with a browser preview for review. The public restaurant websites and backend remain separate from this application.

## Run

Use Flutter **3.50.0** / Dart **3.14** or later. The SDK used on this machine is `/Users/macbookpro/develop/flutter`.

```sh
cd mobile
flutter pub get
flutter run -d chrome
```

On this machine, if Flutter is not on your PATH:

```sh
/Users/macbookpro/develop/flutter/bin/flutter run -d chrome
```

For testing on your iPhone, see [the device guide](docs/IPHONE_TESTING.md).

For a native device, use `flutter devices` and `flutter run -d <device-id>`. Android requires an Android SDK and a compatible JDK. iOS requires full Xcode, its platform SDKs, and signing for a physical device. Xcode 26.3 is selected on this Mac; a signed release has been installed and launched on the user’s iPhone 14 Plus. Android still requires its SDK and device testing.

## Accounts

Live mode now uses server registration, login and an editable full guest profile. See [guest account setup and rollout](docs/GUEST_ACCOUNTS.md). The guest API is deployed on Render (backend commit f40aca4), with its own seatmap-platform PostgreSQL database. Casa di Fratelli and Cofein are published in the live catalogue. The default preview now uses production for both guests and restaurants.

### Offline test account

- Email: `demo@seatmap.app`
- Password: `SeatMap2026!`

Only offline demo mode shows a one-tap test account button. This is local demo authentication, not a server account. Browsing and booking do not require login. No password is persisted.

## Features

- Reference-matched dark/lavender discovery, restaurant detail, and interactive seat-map screens; bundled Inter font and restaurant photographs.
- Four-tab navigation: overview, search, bookings, profile.
- Restaurant search by name, cuisine and area, city selection and cuisine filters.
- Date, time and party-size selection; restaurant menu; six-image demo photo gallery; favourites.
- Table status, zones, windows/entrances/TV/partition landmarks from the restaurant plan, capacity and allowed combination checks; selected-table summary and booking contact form with explicit privacy consent.
- Booking result, email confirmation status refresh, device booking history, and real guest cancellation at least three hours before the reservation. Restaurant contact and tap-to-call after the cutoff.
- Real guest registration with email code verification, login, full editable server profile, email password recovery, password change, session revocation and account deletion.
- Foreground seat maps refresh every three seconds, including table edits, seasonal room closures and dated restaurant closures. See [email and live-map behavior](../docs/guest-email-and-live-map.md).
- Persisted local favourites, an offline test account and a labelled demo reminder preference.
- Loading, empty, offline and conflict states. Real request failures never become fake successful bookings.

## Demo and live API modes

The app connects to **https://casa-di-fratelli-api.onrender.com by default**. Booking submissions in this mode create real restaurant reservations.

For the local browser preview, run the same-origin proxy (the production API does not allow the local preview origin through CORS):

```sh
flutter build web --release --no-tree-shake-icons --no-wasm-dry-run \
  --dart-define=SEATMAP_API_BASE_URL=same-origin
python3 tool/serve_live_preview.py
```

Open http://127.0.0.1:5188. The proxy binds only to loopback, forwards the public restaurant API to the fixed production origin, and serves the release build. iOS and Android connect directly to production and do not need this proxy.

To explicitly select the offline Cosmos-led demo instead:

```sh
flutter run -d chrome --dart-define=SEATMAP_API_BASE_URL=
```

Demo bookings, profile and favourites are stored with SharedPreferences on the device/browser. Notification preferences are demonstrations; no native push is claimed. Automated demo tests explicitly select the offline repository.

To override the backend, pass `--dart-define=SEATMAP_API_BASE_URL=https://your-api-origin`.

Use an API **origin**, without `/api` at the end. Live mode replaces the demo catalogue with the backend's published restaurants. The production catalogue publishes Casa di Fratelli and Cofein. Restaurant names, branding, floor plans, seasonal closures, blocked slots, menus and booking creation use the versioned restaurant API. The live catalogue does not invent Cosmos entries or restaurant ratings. The city and cuisine filters use available catalogue data; the current API does not provide a geographic search index, so unknown cities are not inferred.

Real reservations are sent only after the user submits the contact form. For first-visit email confirmation, the app accurately shows a pending result; the current server email link opens the restaurant website. New bookings receive a private management capability. The app refreshes their actual status when opening Bookings or resuming. Self cancellation is allowed through the server deadline (three hours before the start, in the restaurant’s timezone); later changes require contacting the restaurant. Older bookings without that capability remain contact-only. Contact data never proves ownership.

Live identity and profile use the new guest API; favourites and the device's booking list remain local. The updated API and platform migration are deployed on Render. The app uses no admin credentials or admin endpoints. HTTP errors are shown to the user, and a request timeout is treated as an uncertain result rather than a safe retry.

The browser preview requires its exact origin in `Platform:FrontendOrigins` on the backend if using a live API. Native iOS/Android clients use the restaurant ID in the URL and do not need a browser CORS origin. A loopback API URL on Android Emulator normally uses `10.0.2.2`, not the computer's `127.0.0.1`; use HTTPS or a development-specific cleartext configuration for local native development. Production transport security has not been relaxed.

## Languages

Complete Russian, Bulgarian and English ARB bundles live under `lib/l10n/`. Language selection is available in Profile for guests and signed-in users. Manual choice is saved independently of the profile's communication-language preference. In automatic mode Bulgaria (edge country BG or device region BG) selects Bulgarian; otherwise the supported device language is used, with English as fallback. No GPS permission is requested. The production edge currently returns BG for the local network used in this review.

Branding addresses, floor-plan zone names and menu names/descriptions use the selected language when available from the restaurant API, with English/Bulgarian fallbacks. User-entered content and restaurant content lacking translations are preserved.

After changing ARB bundles:

```sh
flutter gen-l10n
python3 tool/generate_data_messages.py
```

The latter generates a small pure-Dart subset so the HTTP adapter's read-only CLI checks do not import Flutter's UI engine.

To open the preview on an iPhone on the same Wi-Fi, run `python3 tool/serve_live_preview.py --host 0.0.0.0` and use the Mac's LAN IP. See the iPhone guide for the current URL and native USB setup.

## API contract

```text
GET  /api/v1/restaurants
GET  /api/v1/restaurants/{id}/branding
GET  /api/v1/restaurants/{id}/floor-plan
GET  /api/v1/restaurants/{id}/zones
GET  /api/v1/restaurants/{id}/closure
GET  /api/v1/restaurants/{id}/reservations/blocked-slots
GET  /api/v1/restaurants/{id}/menu
POST /api/v1/restaurants/{id}/reservations
GET  /api/v1/restaurants/{id}/reservations/{bookingId}/guest
POST /api/v1/restaurants/{id}/reservations/{bookingId}/cancel
```

Creation sends `guestName`, `phone`, `email`, `guestCount`, `area`, `reservedDate` (`YYYY-MM-DD` in the restaurant's calendar), `reservedTime` (`HH:mm`), string `tableIds`, `notes`, `privacyConsent`, and `marketingConsent`. Restaurant time calculations use the bundled IANA timezone database. Reservation IDs are stored with their restaurant ID to avoid collisions between restaurant databases.

Guest status/cancellation require the booking-specific `X-Reservation-Token` header. The raw capability is returned once on creation and stored separately in iOS Keychain/Android encrypted storage; it is excluded from SharedPreferences metadata. The server stores only its SHA-256 hash. Cancel retries are idempotent, and deadline checks run inside the restaurant write transaction. Browser-preview capabilities last only for the current page session. See [the guest cancellation contract](../docs/guest-cancellation.md).

## Project layout

```text
lib/domain/       Models shared by demo and live modes
lib/data/         Demo data, HTTP adapter, map/availability rules
lib/state/        UI state and local persistence
lib/ui/           Theme and reusable components
lib/ui/screens/   Discovery, detail, map, booking, profile and login
assets/           Bundled imagery, font licence, editable icon source
android/          Android application project
ios/             iOS application project
web/              Browser review target
test/            API adapter, persistence and complete UI-flow tests
```

## Verification

```sh
flutter analyze
flutter test
flutter build web --release --no-tree-shake-icons --no-wasm-dry-run
```

Tests cover the actual reservation DTO, string table IDs, table areas, public holds, 180-minute conflicts and hall-block boundaries, no fake success on an API failure, durable demo booking occupancy/cancellation, test credentials, and discovery → detail → seat map → booking → bookings navigation at phone widths.

The supplied raster image is the design reference. No editable Figma link, component library or original restaurant photos were provided. Layout, colours, spacing and controls are reconstructed from that reference; the main interior imagery is AI-created to match its visual direction. See `assets/ASSETS.md` for provenance. Exact Figma-layer/pixel equivalence and native-device behaviour have not been certified.

To regenerate the three visual-review screenshots with the real bundled fonts:

```sh
flutter test test/visual_review_test.dart --dart-define=CAPTURE_VISUALS=true
```

The resulting images are saved under `docs/screenshots/`.

Visual previews: [Discovery](docs/screenshots/01-discovery.png) · [Restaurant](docs/screenshots/02-restaurant.png) · [Seat map](docs/screenshots/03-seat-map.png).

Optional live **read-only** integration check (never creates reservations):

```sh
dart run tool/check_live_readonly.dart https://casa-di-fratelli-api.onrender.com
```
