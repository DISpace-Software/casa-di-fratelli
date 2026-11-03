# API Guidelines

## Controller Responsibilities

Controllers should:

- authenticate and authorize;
- validate request shape;
- call application services/use cases;
- return HTTP responses.

Controllers should not own large business workflows.

## Application Services

Creation and email confirmation are implemented in `ReservationBookingService`,
shared by the legacy website and public v1 adapters. See
[the booking contract and boundaries](shared-booking.md).

Move workflow logic into services such as:

- `MoveReservation`
- `ReleaseReservation`
- `CreateDiningOrder`
- `CompleteDiningOrder`
- `DeductInventory`
- `RunMarketingCampaigns`

## Errors

Use consistent JSON error responses:

```json
{
  "message": "Human readable message."
}
```

## Authorization

Keep role checks centralized in `AdminRoleAccess` until the system is moved into a fuller policy-based authorization model.

## Audit

Audit every admin operation that changes important restaurant state:

- reservations;
- orders;
- inventory;
- recipes;
- users;
- roles;
- product tier;
- marketing;
- map layout;
- table links.

