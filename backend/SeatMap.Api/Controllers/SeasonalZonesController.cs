using SeatMap.Api.Filters;
using SeatMap.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace SeatMap.Api.Controllers;

[ApiController]
[Route("api/seasonal-zones")]
public class SeasonalZonesController(SeasonalZoneService zones, AuditService audit) : ControllerBase
{
    [HttpGet]
    [HttpGet("~/api/v1/restaurants/{restaurantId}/zones")]
    public async Task<IActionResult> Get() => Ok(new { closedAreas = await zones.GetClosedAreasAsync() });

    public sealed record ChangeZoneRequest(bool Closed);

    [HttpPut("{area}")]
    [AdminAuthorize(AdminRoleAccess.Administrator, AdminRoleAccess.Owner, AdminRoleAccess.Developer)]
    public async Task<IActionResult> Set(string area, [FromBody] ChangeZoneRequest request)
    {
        if (!(await zones.GetAreasAsync()).Contains(area)) return BadRequest(new { message = "Unknown zone." });
        var before = (await zones.GetClosedAreasAsync()).Contains(area);
        await zones.SetClosedAsync(area, request.Closed);
        await audit.RecordAsync(HttpContext, request.Closed ? "close" : "reopen", "SeasonalZone", area,
            before: new { closed = before }, after: new { closed = request.Closed });
        return Ok(new { closedAreas = await zones.GetClosedAreasAsync() });
    }
}
