using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Filters;
using CasaDiFratelli.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Controllers;

[ApiController]
[Route("api/marketing")]
[AdminAuthorize]
public class MarketingController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly MarketingCampaignService _marketing;
    private readonly AuditService _audit;

    public MarketingController(AppDbContext db, MarketingCampaignService marketing, AuditService audit)
    {
        _db = db;
        _marketing = marketing;
        _audit = audit;
    }

    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings()
    {
        if (!CanManageMarketing()) return Forbid();

        var settings = await _marketing.GetSettingsAsync();
        var stats = await BuildStatsAsync();
        return Ok(new { Settings = settings, Stats = stats });
    }

    [HttpPut("settings")]
    public async Task<IActionResult> SaveSettings([FromBody] MarketingSettings settings)
    {
        if (!CanManageMarketing()) return Forbid();

        var before = await _marketing.GetSettingsAsync();
        var saved = await _marketing.SaveSettingsAsync(settings);
        await _audit.RecordAsync(HttpContext, "save-marketing-settings", "Marketing", "campaigns", before, saved);
        return Ok(saved);
    }

    [HttpPost("run")]
    public async Task<IActionResult> Run([FromQuery] bool dryRun = true)
    {
        if (!CanManageMarketing()) return Forbid();

        var result = await _marketing.RunAsync(dryRun);
        await _audit.RecordAsync(HttpContext, dryRun ? "preview-marketing" : "run-marketing", "Marketing", "campaigns", after: result);
        return Ok(result);
    }

    private bool CanManageMarketing()
    {
        var admin = AdminAuthService.Current(HttpContext);
        var role = AdminRoleAccess.Normalize(admin?.Role);
        return role == AdminRoleAccess.Owner || role == AdminRoleAccess.Developer;
    }

    private async Task<object> BuildStatsAsync()
    {
        var subscribers = await _db.CustomerProfiles.CountAsync(x => x.MarketingConsent && !string.IsNullOrWhiteSpace(x.Email));
        var totalSent = await _db.MarketingMessageLogs.CountAsync();
        var lastSent = await _db.MarketingMessageLogs
            .OrderByDescending(x => x.SentAtUtc)
            .Select(x => new { x.CampaignKey, x.Email, x.SentAtUtc, x.Subject })
            .FirstOrDefaultAsync();

        return new { Subscribers = subscribers, TotalSent = totalSent, LastSent = lastSent };
    }
}
