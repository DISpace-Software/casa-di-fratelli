using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using SeatMap.Api.Application.Waitlist;
using SeatMap.Api.Data;
using SeatMap.Api.Filters;
using SeatMap.Api.Platform.Auth;
using SeatMap.Api.Platform.Models;
using SeatMap.Api.Services.Reservations;
using SeatMap.Api.Services.Waitlist;

namespace SeatMap.Api.Controllers;

[ApiController, Route("api/v1/restaurants/{restaurantId}/waitlist"), RequestSizeLimit(8192)]
[GuestPlatformAvailable, GuestAuthErrors, GuestAuthorize, EnableRateLimiting("guest-reservations")]
public sealed class WaitlistController(AppDbContext db, WaitlistService waitlist, ConfirmWaitlistOffer confirmation) : ControllerBase
{
    private GuestProfile Guest => ((GuestSession)HttpContext.Items[typeof(GuestSession)]!).Profile;
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var entries = await db.WaitlistEntries.AsNoTracking().Where(x => x.GuestId == Guest.Id).OrderByDescending(x => x.CreatedAtUtc).Take(100).ToListAsync();
        return Ok(new { entries = entries.Select(WaitlistService.Describe), settings = await waitlist.SettingsAsync(), serverTimeUtc = DateTime.UtcNow, notificationChannel = "email" });
    }
    [HttpPost] public async Task<IActionResult> Join(WaitlistRequest request) => (await waitlist.JoinAsync(Guest, request)).ToActionResult();
    [HttpPut("{id:guid}")] public async Task<IActionResult> Edit(Guid id, WaitlistRequest request) => (await waitlist.ChangeAsync(id, Guest.Id, "edit", request)).ToActionResult();
    [HttpPost("{id:guid}/{operation:regex(^(cancel|decline|resume)$)}")]
    public async Task<IActionResult> Change(Guid id, string operation) => (await waitlist.ChangeAsync(id, Guest.Id, operation)).ToActionResult();
    public sealed record AcceptOfferRequest(Guid OfferId);
    [HttpPost("{id:guid}/confirm")]
    public async Task<IActionResult> Confirm(Guid id, AcceptOfferRequest request) =>
        (await confirmation.ExecuteAsync(id, Guest, request.OfferId)).ToActionResult();
}
