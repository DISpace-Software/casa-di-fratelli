using System.Text.Json.Serialization;
using CasaDiFratelli.Api.Data;
using CasaDiFratelli.Api.Filters;
using CasaDiFratelli.Api.Models;
using CasaDiFratelli.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Controllers;

[ApiController]
[Route("api/admin/push")]
[AdminAuthorize]
public class AdminPushController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly PushNotificationService _push;
    private readonly AuditService _audit;

    public AdminPushController(AppDbContext db, PushNotificationService push, AuditService audit)
    {
        _db = db;
        _push = push;
        _audit = audit;
    }

    [HttpGet("config")]
    public async Task<IActionResult> GetConfig()
    {
        var publicKey = await _push.GetPublicKeyAsync();
        return Ok(new { publicKey });
    }

    [HttpPost("subscriptions")]
    public async Task<IActionResult> SaveSubscription([FromBody] AdminPushSubscriptionRequest request)
    {
        var admin = AdminAuthService.Current(HttpContext);
        if (admin == null)
            return Unauthorized();

        if (string.IsNullOrWhiteSpace(request.Endpoint) ||
            string.IsNullOrWhiteSpace(request.Keys?.P256Dh) ||
            string.IsNullOrWhiteSpace(request.Keys?.Auth))
        {
            return BadRequest(new { message = "Invalid push subscription." });
        }

        var subscription = await _db.AdminPushSubscriptions
            .FirstOrDefaultAsync(x => x.Endpoint == request.Endpoint);

        if (subscription == null)
        {
            subscription = new AdminPushSubscription
            {
                Endpoint = request.Endpoint.Trim(),
                CreatedAtUtc = DateTime.UtcNow
            };
            _db.AdminPushSubscriptions.Add(subscription);
        }

        subscription.AdminUserId = admin.Id;
        subscription.P256Dh = request.Keys.P256Dh.Trim();
        subscription.Auth = request.Keys.Auth.Trim();
        subscription.UserAgent = Request.Headers.UserAgent.ToString();
        subscription.IsActive = true;
        subscription.LastUsedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "subscribe-push", "AdminPushSubscription", subscription.Id.ToString(), after: new { SubscriptionId = subscription.Id, AdminUserId = admin.Id, admin.Name });

        return Ok(new { subscription.Id, subscription.IsActive });
    }

    [HttpDelete("subscriptions")]
    public async Task<IActionResult> DeleteSubscription([FromBody] AdminPushDeleteRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Endpoint))
            return BadRequest(new { message = "Endpoint is required." });

        var subscription = await _db.AdminPushSubscriptions.FirstOrDefaultAsync(x => x.Endpoint == request.Endpoint);
        if (subscription == null)
            return NoContent();

        subscription.IsActive = false;
        await _db.SaveChangesAsync();
        await _audit.RecordAsync(HttpContext, "unsubscribe-push", "AdminPushSubscription", subscription.Id.ToString(), before: new { subscription.Id });

        return NoContent();
    }
}

public class AdminPushSubscriptionRequest
{
    [JsonPropertyName("endpoint")]
    public string Endpoint { get; set; } = string.Empty;

    [JsonPropertyName("keys")]
    public AdminPushSubscriptionKeys? Keys { get; set; }
}

public class AdminPushSubscriptionKeys
{
    [JsonPropertyName("p256dh")]
    public string P256Dh { get; set; } = string.Empty;

    [JsonPropertyName("auth")]
    public string Auth { get; set; } = string.Empty;
}

public class AdminPushDeleteRequest
{
    [JsonPropertyName("endpoint")]
    public string Endpoint { get; set; } = string.Empty;
}
