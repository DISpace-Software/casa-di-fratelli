using SeatMap.Api.Dtos;
using SeatMap.Api.Services.Reservations;
using Microsoft.AspNetCore.Mvc;

namespace SeatMap.Api.Controllers;

[ApiController]
[Route("api/v1/restaurants/{restaurantId}/reservations")]
public sealed class RestaurantReservationsController(ReservationBookingService booking) : ControllerBase
{
    // Anonymous booking contract. Profile-backed booking will require a verified
    // guest identity; it must never trust a guest UUID supplied by the client.
    [HttpPost]
    public async Task<IActionResult> Create(PublicCreateReservationRequest request) =>
        (await booking.CreateAsync(request.ToBookingRequest())).ToActionResult();

    [HttpGet("confirm")]
    public async Task<IActionResult> ConfirmByEmail([FromQuery] string token) =>
        (await booking.ConfirmByEmailAsync(token)).ToActionResult();
}
