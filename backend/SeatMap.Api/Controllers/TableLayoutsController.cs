using SeatMap.Api.Dtos;
using SeatMap.Api.Filters;
using SeatMap.Api.Services;
using SeatMap.Api.Services.FloorPlans;
using Microsoft.AspNetCore.Mvc;

namespace SeatMap.Api.Controllers;

[ApiController]
[Route("api/table-layouts")]
public class TableLayoutsController(FloorPlanService plans, AuditService audit) : ControllerBase
{
    [HttpGet]
    [HttpGet("~/api/v1/restaurants/{restaurantId}/layout")]
    public async Task<IActionResult> Get()
    {
        var plan = await plans.GetAsync();
        Response.Headers.ETag = $"\"{plan.Revision}\"";
        return Ok(plan.Tables);
    }

    [HttpPut]
    [AdminAuthorize(AdminRoleAccess.Administrator, AdminRoleAccess.Owner, AdminRoleAccess.Developer)]
    public async Task<IActionResult> Save([FromBody] List<TableLayoutItem> layout)
    {
        // Legacy adapter retains all zone and combination settings. A revision is mandatory.
        var current = await plans.GetAsync();
        if (Request.Headers.IfMatch.ToString().Trim('"') != current.Revision)
            return StatusCode(428, new { message = "Reload the map and include its ETag in If-Match." });
        try
        {
            var saved = await plans.SaveAsync(current with { Tables = layout });
            await audit.RecordAsync(HttpContext, "save", "FloorPlan", "1", after: saved);
            Response.Headers.ETag = $"\"{saved.Revision}\"";
            return Ok(saved.Tables);
        }
        catch (ArgumentException e) { return BadRequest(new { message = e.Message }); }
        catch (FloorPlanConflictException e) { return Conflict(new { message = e.Message }); }
    }

    [HttpPost("reset")]
    [AdminAuthorize(AdminRoleAccess.Administrator, AdminRoleAccess.Owner, AdminRoleAccess.Developer)]
    public IActionResult Reset() => Conflict(new { message = "Reset is disabled to protect restaurant-specific maps. Edit and save the current floor plan." });
}
