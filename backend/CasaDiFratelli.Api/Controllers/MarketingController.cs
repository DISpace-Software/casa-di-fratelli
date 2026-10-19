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

    [HttpGet("history")]
    public async Task<IActionResult> GetHistory([FromQuery] string? campaign = null, [FromQuery] string? search = null,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        if (!CanManageMarketing()) return Forbid();
        if (page < 1 || pageSize < 1 || pageSize > 100) return BadRequest(new { Message = "Invalid page or page size." });
        var query = _db.MarketingMessageLogs.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(campaign)) query = query.Where(x => x.CampaignKey == campaign.Trim());
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(x => x.Email.ToLower().Contains(term) || x.Subject.ToLower().Contains(term)
                || _db.CustomerProfiles.Any(c => c.Email != null && c.Email.Trim().ToLower() == x.CustomerKey
                    && c.GuestName != null && c.GuestName.ToLower().Contains(term)));
        }
        var total = await query.CountAsync();
        var pages = Math.Max(1, (int)Math.Ceiling(total / (double)pageSize));
        page = Math.Min(page, pages);
        var logs = await query.OrderByDescending(x => x.SentAtUtc).ThenByDescending(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        var keys = logs.Select(x => x.CustomerKey).Distinct().ToArray();
        var customers = await _db.CustomerProfiles.AsNoTracking()
            .Where(x => x.Email != null && keys.Contains(x.Email.Trim().ToLower()))
            .Select(x => new { x.Email, x.GuestName }).ToListAsync();
        var names = customers.GroupBy(x => x.Email!.Trim().ToLowerInvariant())
            .ToDictionary(x => x.Key, x => x.FirstOrDefault(c => !string.IsNullOrWhiteSpace(c.GuestName))?.GuestName);
        return Ok(new { Total = total, Page = page, PageSize = pageSize, Items = logs.Select(x => new
        {
            x.Id, x.CampaignKey, x.Email, GuestName = names.GetValueOrDefault(x.CustomerKey),
            SentAtUtc = DateTime.SpecifyKind(x.SentAtUtc, DateTimeKind.Utc), x.SentForDate, x.Subject, x.DiscountPercent
        }) });
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

    [HttpPost("birthday/{customerId:int}/send")]
    public async Task<IActionResult> SendBirthday(int customerId)
    {
        if (!CanManageMarketing()) return Forbid();

        var result = await _marketing.SendBirthdayAsync(customerId);
        if (!result.Sent && !result.AlreadySent)
            return BadRequest(new { result.Message });

        await _audit.RecordAsync(
            HttpContext,
            result.Sent ? "send-birthday" : "birthday-already-sent",
            "CustomerProfile",
            customerId.ToString(),
            after: result);
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
