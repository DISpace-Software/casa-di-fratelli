using SeatMap.Api.Dtos;
using SeatMap.Api.Services.Reservations;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace SeatMap.Api.Controllers;

[ApiController]
[Route("api/v1/restaurants/{restaurantId}/reservations")]
public sealed class RestaurantReservationsController(ReservationBookingService booking) : ControllerBase
{
    // Anonymous booking contract. Profile-backed booking will require a verified
    // guest identity; it must never trust a guest UUID supplied by the client.
    [HttpPost]
    public async Task<IActionResult> Create(PublicCreateReservationRequest request)
    {
        Response.Headers.CacheControl = "no-store";
        return (await booking.CreateAsync(request.ToBookingRequest())).ToActionResult();
    }

    [HttpGet("confirm")]
    public async Task<IActionResult> ConfirmByEmail([FromQuery] string token) =>
        (await booking.ConfirmByEmailAsync(token)).ToActionResult();

    [HttpGet("{id:int}/guest"), EnableRateLimiting("guest-reservations")]
    public async Task<IActionResult> GuestStatus(int id, [FromServices] GuestReservationService guests)
    {
        Response.Headers.CacheControl = "no-store";
        return (await guests.GetAsync(id, Request.Headers["X-Reservation-Token"].FirstOrDefault())).ToActionResult();
    }

    [HttpPost("{id:int}/cancel"), EnableRateLimiting("guest-reservations")]
    public async Task<IActionResult> GuestCancel(int id, [FromServices] GuestReservationService guests)
    {
        Response.Headers.CacheControl = "no-store";
        return (await guests.CancelAsync(id, Request.Headers["X-Reservation-Token"].FirstOrDefault())).ToActionResult();
    }
}
