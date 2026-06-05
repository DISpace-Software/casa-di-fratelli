using CasaDiFratelli.Api.Filters;
using CasaDiFratelli.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace CasaDiFratelli.Api.Controllers;

[ApiController]
[Route("api/product-tier")]
public class ProductTierController : ControllerBase
{
    private readonly ProductTierService _tiers;
    private readonly AuditService _audit;

    public ProductTierController(ProductTierService tiers, AuditService audit)
    {
        _tiers = tiers;
        _audit = audit;
    }

    [HttpGet]
    [AdminAuthorize]
    public async Task<IActionResult> Get()
    {
        var tier = await _tiers.GetTierAsync();
        return Ok(new { tier, isPro = tier == ProductTierService.Pro });
    }

    [HttpPost("unlock-pro")]
    [AdminAuthorize]
    public async Task<IActionResult> UnlockPro([FromBody] UnlockProRequest request)
    {
        var admin = AdminAuthService.Current(HttpContext);
        if (AdminRoleAccess.Normalize(admin?.Role) != AdminRoleAccess.Developer)
            return Forbid();

        if (request.Code != "2215")
            return BadRequest(new { message = "Invalid unlock code." });

        var before = await _tiers.GetTierAsync();
        var tier = await _tiers.UnlockProAsync();
        await _audit.RecordAsync(HttpContext, "unlock-pro", "ProductTier", "ProductTier", before: new { tier = before }, after: new { tier });

        return Ok(new { tier, isPro = true });
    }
}

public class UnlockProRequest
{
    public string Code { get; set; } = string.Empty;
}
