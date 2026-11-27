using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SeatMap.Api.Application.Waitlist;
using SeatMap.Api.Filters;
using SeatMap.Api.Platform.Auth;
using SeatMap.Api.Platform.Models;

namespace SeatMap.Api.Controllers;

[ApiController, Route("api/v1/guest/waitlist"), SeatMap.Api.Platform.PlatformEndpoint]
[GuestPlatformAvailable, GuestAuthErrors, GuestAuthorize, EnableRateLimiting("guest-reservations")]
public sealed class GuestWaitlistInboxController(GetGuestWaitlistInbox inbox) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var guest = ((GuestSession)HttpContext.Items[typeof(GuestSession)]!).Profile;
        return Ok(await inbox.ExecuteAsync(guest.Id, HttpContext.RequestAborted));
    }
}
