namespace SeatMap.Api.Services.Reservations;

public enum ReservationBookingResultKind { Success, Invalid, Unauthorized, NotFound, Conflict, RateLimited }

// Transport-neutral outcome; the HTTP adapter preserves existing response bodies.
public sealed record ReservationBookingResult(ReservationBookingResultKind Kind, object Value)
{
    public static ReservationBookingResult Success(object value) => new(ReservationBookingResultKind.Success, value);
    public static ReservationBookingResult Invalid(object value) => new(ReservationBookingResultKind.Invalid, value);
    public static ReservationBookingResult Unauthorized(object value) => new(ReservationBookingResultKind.Unauthorized, value);
    public static ReservationBookingResult NotFound(object value) => new(ReservationBookingResultKind.NotFound, value);
    public static ReservationBookingResult Conflict(object value) => new(ReservationBookingResultKind.Conflict, value);
    public static ReservationBookingResult RateLimited(object value) => new(ReservationBookingResultKind.RateLimited, value);
}
