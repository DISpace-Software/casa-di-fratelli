# Mobile architecture

SeatMap is a Flutter client of the restaurant and guest-account APIs. The server
owns booking availability, offer allocation, authorization, and payment state.
Mobile rules provide immediate feedback; they must never replace server checks.

## Code map and dependency direction

| Location | Responsibility | Change here when |
| --- | --- | --- |
| `lib/domain/models.dart`, `menu.dart` | Booking, restaurant, floor-plan and menu vocabulary | Changing a model shared by multiple features |
| `lib/domain/reservation_policy.dart` | Deterministic table selection, booking overlap, time slots and cancellation hints | Changing a reservation rule, with matching server review |
| `lib/data/seatmap_repository.dart` | Restaurant API, response validation, demo adapter and compatibility facade | Changing HTTP endpoints or restaurant data loading |
| `lib/data/booking_response_mapper.dart` | Translate API reservation fields/statuses into the local booking model | Changing booking or waitlist confirmation response contracts |
| `lib/data/waitlist_inbox_snapshot.dart` | Parse inbox metadata and retain failed-restaurant entries | Changing partial inbox refresh behavior |
| `lib/data/guest_account_repository.dart` | Guest session transport and account API | Changing authentication or guest-owned endpoints |
| `lib/data/booking_access_store.dart` | Secure persistence of reservation capabilities | Changing secure device storage |
| `lib/data/preorder_cart_key.dart` | Stable cart storage identity | Migrating cart persistence; preserve existing keys |
| `lib/state/app_controller.dart` | Application orchestration, shared session/search state, persistence coordination, notifications to widgets | Changing a cross-feature workflow |
| `lib/ui/screens/` | Routes, user interaction and rendering | Changing a screen |
| `lib/ui/widgets/` | Reusable feature presentation (currently dish photography) | Sharing a visual component across routes |
| `lib/l10n/` | User-facing translations | Changing displayed copy |

New domain policies must not import `data`, `state`, Flutter UI, or localization.
They receive the current time as input. Time-zone data initialization currently
belongs to `SeatMapRepository`; standalone policy tests initialize it explicitly.
Adapters translate domain format failures into localized application errors.
Existing repository policy methods remain as delegates for callers and test doubles.

This is a gradual separation, not a claim that every old model is a pure DDD
aggregate: the current model files still include serialization and presentation
metadata. Avoid creating generic repositories or one-method interfaces unless a
real alternate implementation or boundary requires them. Existing constructor
injection, HTTP mock clients, clock injection and secure-store abstractions are
the testing seams.

## Menu and preorder boundaries

`menu_browsing_screen.dart` owns menu browsing, selection and the sommelier entry point.
`preorder_cart_screen.dart` owns cart editing and submission.
`preorders_screen.dart` owns the Orders tab and existing-order actions.
`ui/widgets/dish_photo.dart` renders remote/embedded dish pictures with a fallback.
The former combined `menu_screen.dart` is now a compatibility barrel that only
re-exports the public screens and photo widget, so existing navigation imports
continue to compile. Feature implementations import each other directly to avoid
a dependency cycle through the barrel. New callers should import the screen they
actually use. A saved cart key is a persistence contract, not a route
name; moving widgets must not change it.

## Invariants to preserve

- `Booking.id` combines restaurant ID and server reservation ID. A guest-status
  response must match that identity before it can update the booking.
- Account bearer tokens and reservation management capabilities have different
  scopes. Never substitute one for the other, log either, or put capabilities in
  shared-preferences booking metadata.
- Waitlist confirmation is retryable on the server. Only persist a returned
  booking if the same account still owns the active session after asynchronous
  steps. Keep the guards before and after secure-storage writes.
- Booking refresh uses a revision guard to avoid replacing a newly created or
  cancelled booking with an earlier response. Do not remove this to simplify code.
- A successful server mutation remains successful when metadata persistence
  fails; retain the in-memory result and surface the separate storage warning.
- Table capacity does not imply permission to join tables. Restaurant-configured
  combinations and maximum party/table limits apply.
- Server cancellation deadlines override local estimates. Times are interpreted
  in the restaurant's time zone; selected dates are calendar dates, not instants.
- Route extraction must preserve widget state, mounted checks, request generation
  guards, storage keys and public constructors.

Comments should explain these reasons and boundaries rather than narrate syntax.
Keep names aligned with business vocabulary: booking, offer, draft, capability.

## Verification

From `mobile/` run `flutter analyze` and `flutter test` using the installed Flutter
SDK. `reservation_policy_test.dart` exercises restaurant-local midnight, extra
waitlist lead time, and permitted combinations without HTTP or widgets. Existing
repository, cancellation, preorder, account and waitlist tests cover the adapters
and UI workflows. Tests use synthetic guests and mocked HTTP; they do not prove
production email delivery or iPhone UI behavior.

## Remaining debt / next safe steps

`AppController` still coordinates several features; move one complete workflow at
a time behind an application service, retaining session and persistence guards.
Waitlist/menu API payloads still use maps in several places; introduce typed DTOs
per endpoint with contract tests before changing consumers. Menu and preorder
widgets still perform some persistence and network orchestration; extract it with
tests for lost responses and duplicate submission, rather than just moving code.
The large discovery/support screen files and `SeatMapRepository` remain candidates
for further feature separation. Storage keys and public routes require migration
compatibility. No backend aggregates or state machines should be duplicated in
mobile merely to make the folder structure look symmetrical.
