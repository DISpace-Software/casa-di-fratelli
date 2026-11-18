using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SeatMap.Api.Platform;
using SeatMap.Api.Platform.Auth;
using SeatMap.Api.Platform.Models;

namespace SeatMap.Api.Controllers;

[RequestSizeLimit(16_384)]
[ApiController, Route("api/v1/guest"), PlatformEndpoint, GuestPlatformAvailable, GuestAuthErrors]
public sealed class GuestAccountController(IServiceProvider services) : ControllerBase
{
    private GuestAuthService Auth => services.GetRequiredService<GuestAuthService>();
    private GuestSession Session => (GuestSession)HttpContext.Items[typeof(GuestSession)]!;

    [HttpPost("register"), EnableRateLimiting("guest-auth")]
    public async Task<IActionResult> Register(GuestRegisterRequest request, CancellationToken ct) =>
        StatusCode(201, await Auth.RegisterAsync(request, ct));

    [HttpPost("login"), EnableRateLimiting("guest-auth")]
    public async Task<IActionResult> Login(GuestLoginRequest request, CancellationToken ct) =>
        Ok(await Auth.LoginAsync(request, ct));

    [HttpGet("me"), GuestAuthorize]
    public IActionResult Me() => Ok(GuestProfileDto.From(Session.Profile));

    [HttpPut("me"), GuestAuthorize, EnableRateLimiting("guest-auth")]
    public async Task<IActionResult> Update(GuestProfileRequest request, CancellationToken ct) =>
        Ok(await Auth.UpdateAsync(Session, request, ct));

    [HttpPost("logout"), GuestAuthorize]
    public async Task<IActionResult> Logout(CancellationToken ct)
    { await Auth.LogoutAsync(Session, ct); return NoContent(); }

    [HttpPost("password"), GuestAuthorize, EnableRateLimiting("guest-auth")]
    public async Task<IActionResult> Password(GuestPasswordRequest request, CancellationToken ct)
    { await Auth.ChangePasswordAsync(Session, request, ct); return NoContent(); }

    [HttpDelete("me"), GuestAuthorize, EnableRateLimiting("guest-auth")]
    public async Task<IActionResult> Delete(GuestDeleteRequest request, CancellationToken ct)
    { await Auth.DeleteAsync(Session, request.CurrentPassword, ct); return NoContent(); }
}
