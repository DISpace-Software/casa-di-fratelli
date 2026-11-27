using Microsoft.AspNetCore.Mvc;
using SeatMap.Api.Application.Waitlist;
using SeatMap.Api.Filters;
using SeatMap.Api.Services;
using SeatMap.Api.Services.Reservations;
using SeatMap.Api.Services.Waitlist;

namespace SeatMap.Api.Controllers;

[ApiController, Route("api/waitlist"), RequestSizeLimit(8192)]
[AdminAuthorize(AdminRoleAccess.Owner, AdminRoleAccess.Administrator, AdminRoleAccess.Developer)]
public sealed class AdminWaitlistController(AdministerWaitlist administration) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] DateOnly? date)
    {
        Response.Headers.CacheControl = "no-store";
        return Ok(await administration.ListAsync(date));
    }

    [HttpPost]
    public async Task<IActionResult> Join(AdministerWaitlist.StaffJoinRequest request)
    {
        var result = await administration.JoinAsync(request, HttpContext);
        return result.ToActionResult();
    }

    [HttpPut("settings")]
    public async Task<IActionResult> Settings(WaitlistSettings settings) =>
        (await administration.UpdateSettingsAsync(settings, HttpContext)).ToActionResult();

    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, AdministerWaitlist.CloseRequest request) =>
        (await administration.CancelAsync(id, request, HttpContext)).ToActionResult();
}
