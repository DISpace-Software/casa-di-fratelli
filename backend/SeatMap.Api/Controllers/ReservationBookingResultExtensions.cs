using SeatMap.Api.Services.Reservations;
using Microsoft.AspNetCore.Mvc;

namespace SeatMap.Api.Controllers;

public static class ReservationBookingResultExtensions
{
    public static IActionResult ToActionResult(this ReservationBookingResult result) => result.Kind switch
    {
        ReservationBookingResultKind.Success => new OkObjectResult(result.Value),
        ReservationBookingResultKind.Invalid => result.Value == null ? new BadRequestResult() : new BadRequestObjectResult(result.Value),
        ReservationBookingResultKind.Unauthorized => new UnauthorizedObjectResult(result.Value),
        ReservationBookingResultKind.NotFound => result.Value == null ? new NotFoundResult() : new NotFoundObjectResult(result.Value),
        ReservationBookingResultKind.Conflict => new ConflictObjectResult(result.Value),
        ReservationBookingResultKind.RateLimited => new ObjectResult(result.Value) { StatusCode = StatusCodes.Status429TooManyRequests },
        ReservationBookingResultKind.Unavailable => new StatusCodeResult(StatusCodes.Status503ServiceUnavailable),
        _ => throw new ArgumentOutOfRangeException(nameof(result))
    };
}
