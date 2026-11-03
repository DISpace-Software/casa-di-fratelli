using SeatMap.Api.Services.Reservations;
using Microsoft.AspNetCore.Mvc;

namespace SeatMap.Api.Controllers;

public static class ReservationBookingResultExtensions
{
    public static IActionResult ToActionResult(this ReservationBookingResult result) => result.Kind switch
    {
        ReservationBookingResultKind.Success => new OkObjectResult(result.Value),
        ReservationBookingResultKind.Invalid => new BadRequestObjectResult(result.Value),
        ReservationBookingResultKind.Unauthorized => new UnauthorizedObjectResult(result.Value),
        ReservationBookingResultKind.NotFound => new NotFoundObjectResult(result.Value),
        ReservationBookingResultKind.Conflict => new ConflictObjectResult(result.Value),
        ReservationBookingResultKind.RateLimited => new ObjectResult(result.Value) { StatusCode = StatusCodes.Status429TooManyRequests },
        _ => throw new ArgumentOutOfRangeException(nameof(result))
    };
}
