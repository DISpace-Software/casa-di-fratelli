using CasaDiFratelli.Api.Filters;
using CasaDiFratelli.Api.Services;
using CasaDiFratelli.Api.Services.Tenancy;
using Microsoft.AspNetCore.Mvc;

namespace CasaDiFratelli.Api.Controllers;

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
