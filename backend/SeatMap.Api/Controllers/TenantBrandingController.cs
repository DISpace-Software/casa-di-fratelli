using SeatMap.Api.Filters;
using SeatMap.Api.Services;
using SeatMap.Api.Services.Tenancy;
using Microsoft.AspNetCore.Mvc;

namespace SeatMap.Api.Controllers;

[ApiController]
[Route("api/branding")]
[Route("api/tenant-branding")]
public sealed class TenantBrandingController : ControllerBase
{
    private readonly TenantBrandingService _branding;
    private readonly AuditService _audit;
    public TenantBrandingController(TenantBrandingService branding, AuditService audit)
    {
        _branding = branding;
        _audit = audit;
    }

    [HttpGet]
    [HttpGet("~/api/v1/restaurants/{restaurantId}/branding")]
    public async Task<IActionResult> Get() => Ok(await _branding.GetAsync());

    [HttpPut]
    [AdminAuthorize(AdminRoleAccess.Owner, AdminRoleAccess.Developer)]
    public async Task<IActionResult> Update(TenantBrandingSettings settings)
    {
        var error = TenantBrandingService.Validate(settings);
        if (error != null) return BadRequest(new { message = error });
        var before = await _branding.GetAsync();
        await _branding.SaveAsync(settings);
        await _audit.RecordAsync(HttpContext, "update-branding", "TenantBranding", TenantBrandingService.SettingsKey, before, settings);
        return Ok(settings);
    }
}
