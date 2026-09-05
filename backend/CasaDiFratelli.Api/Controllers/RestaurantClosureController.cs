using CasaDiFratelli.Api.Filters;
using CasaDiFratelli.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace CasaDiFratelli.Api.Controllers;

[ApiController]
[Route("api/restaurant-closure")]
public class RestaurantClosureController : ControllerBase
{
    private readonly RestaurantClosureService _closures;

    public RestaurantClosureController(RestaurantClosureService closures)
    {
        _closures = closures;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var settings = await _closures.GetAsync();
        return Ok(ToResponse(settings));
    }

    [HttpPut]
    [AdminAuthorize(AdminRoleAccess.Administrator, AdminRoleAccess.Owner, AdminRoleAccess.Developer)]
    public async Task<IActionResult> Save([FromBody] RestaurantClosureSettings request)
    {
        if (request.StartDate == default || request.EndDate == default)
            return BadRequest(new { message = "Началната и крайната дата са задължителни." });
        if (request.EndDate < request.StartDate)
            return BadRequest(new { message = "Крайната дата не може да бъде преди началната." });
        if (string.IsNullOrWhiteSpace(request.Message))
            return BadRequest(new { message = "Текстът на уведомлението е задължителен." });

        return Ok(ToResponse(await _closures.SaveAsync(request)));
    }

    private static object ToResponse(RestaurantClosureSettings settings) => new
    {
        settings.Enabled,
        settings.StartDate,
        settings.EndDate,
        settings.ReopenDate,
        settings.Message,
        IsActive = RestaurantClosureService.IsCurrentlyActive(settings)
    };
}
