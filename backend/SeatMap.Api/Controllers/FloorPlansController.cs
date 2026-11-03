using SeatMap.Api.Filters;
using SeatMap.Api.Services;
using SeatMap.Api.Services.FloorPlans;
using Microsoft.AspNetCore.Mvc;

namespace SeatMap.Api.Controllers;

[ApiController]
[Route("api/floor-plan")]
public sealed class FloorPlansController(FloorPlanService plans, AuditService audit) : ControllerBase
{
    [HttpGet]
    [HttpGet("~/api/v1/restaurants/{restaurantId}/floor-plan")]
    public async Task<IActionResult> Get()
    {
        Response.Headers.CacheControl = "no-store";
        return Ok(await plans.GetAsync());
    }

    [HttpPut]
    [AdminAuthorize(AdminRoleAccess.Administrator, AdminRoleAccess.Owner, AdminRoleAccess.Developer)]
    public async Task<IActionResult> Save([FromBody] FloorPlan plan)
    {
        try
        {
            var saved = await plans.SaveAsync(plan);
            await audit.RecordAsync(HttpContext, "save", "FloorPlan", "1", after: saved);
            return Ok(saved);
        }
        catch (ArgumentException e) { return BadRequest(new { message = e.Message }); }
        catch (FloorPlanConflictException e) { return Conflict(new { message = e.Message }); }
    }
}
