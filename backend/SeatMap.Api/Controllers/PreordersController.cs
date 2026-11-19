using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using SeatMap.Api.Data;
using SeatMap.Api.Filters;
using SeatMap.Api.Services;
using SeatMap.Api.Services.Preorders;
using SeatMap.Api.Services.Tenancy;

namespace SeatMap.Api.Controllers;

public sealed class PreorderErrorsAttribute : ExceptionFilterAttribute
{
    public override void OnException(ExceptionContext context)
    {
        if (context.Exception is not PreorderException error) return;
        context.Result = new ObjectResult(new { code = error.Code, message = error.Message }) { StatusCode = error.Status };
        context.ExceptionHandled = true;
    }
}
[ApiController, PreorderErrors, RequestSizeLimit(32_768)]
[Route("api/v1/restaurants/{restaurantId}/preorders")]
public sealed class PreordersController(PreorderPolicyService policies, GuestPreorderService preorders) : ControllerBase
{
    private string? Token => Request.Headers["X-Reservation-Token"].FirstOrDefault();
    [HttpGet("settings")]
    public async Task<IActionResult> Settings() { Response.Headers.CacheControl = "no-store"; return Ok(await policies.PublicAsync()); }
    [HttpPost("~/api/v1/restaurants/{restaurantId}/reservations/{id:int}/preorders/quote"), EnableRateLimiting("guest-reservations")]
    public async Task<IActionResult> Quote(int id, PreorderDraftRequest request) { Response.Headers.CacheControl = "no-store"; return Ok(await preorders.QuoteAsync(id, Token, request)); }
    [HttpPost("~/api/v1/restaurants/{restaurantId}/reservations/{id:int}/preorders"), EnableRateLimiting("guest-reservations")]
    public async Task<IActionResult> Draft(int id, PreorderDraftRequest request) { Response.Headers.CacheControl = "no-store"; return Ok(await preorders.CreateDraftAsync(id, Token, request)); }
    [HttpGet("~/api/v1/restaurants/{restaurantId}/reservations/{id:int}/preorders"), EnableRateLimiting("guest-reservations")]
    public async Task<IActionResult> List(int id) { Response.Headers.CacheControl = "no-store"; return Ok(await preorders.ListAsync(id, Token)); }
    [HttpPost("~/api/v1/restaurants/{restaurantId}/reservations/{id:int}/preorders/{preorderId:guid}/checkout"), EnableRateLimiting("guest-reservations")]
    public async Task<IActionResult> Checkout(int id, Guid preorderId) { Response.Headers.CacheControl = "no-store"; await preorders.CheckoutAsync(id, preorderId, Token); return NoContent(); }
}

[ApiController, PreorderErrors, Route("api/preorders")]
public sealed class PreorderAdministrationController(PreorderPolicyService policies, AppDbContext db, TenantBrandingService branding) : ControllerBase
{
    [HttpGet("settings"), AdminAuthorize(AdminRoleAccess.Owner, AdminRoleAccess.Developer)]
    public async Task<IActionResult> Settings() { Response.Headers.CacheControl = "no-store"; return Ok(await policies.AdminAsync()); }
    [HttpPut("platform"), AdminAuthorize(AdminRoleAccess.Developer)]
    public async Task<IActionResult> Platform(PreorderPlatformRequest request) { await policies.SetPlatformAsync(request, AdminAuthService.Current(HttpContext)!); return Ok(await policies.AdminAsync()); }
    [HttpPut("consent"), AdminAuthorize(AdminRoleAccess.Owner)]
    public async Task<IActionResult> Consent(PreorderConsentRequest request) { await policies.SetConsentAsync(request, AdminAuthService.Current(HttpContext)!); return Ok(await policies.AdminAsync()); }
    [HttpGet("settlements"), AdminAuthorize(AdminRoleAccess.Owner, AdminRoleAccess.Developer)]
    public async Task<IActionResult> Settlements([FromQuery] string month)
    {
        Response.Headers.CacheControl = "no-store";
        if (!DateTime.TryParseExact(month, "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None, out var local) || local.Year is < 2020 or > 2100)
            return BadRequest(new { code = "SETTLEMENT_MONTH_INVALID", message = "Use YYYY-MM." });
        var zone = TimeZoneInfo.FindSystemTimeZoneById((await branding.GetAsync()).TimeZoneId);
        var from = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), zone);
        var until = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(local.AddMonths(1), DateTimeKind.Unspecified), zone);
        var payments = await db.PreorderPayments.AsNoTracking().Where(x => x.PaidAtUtc >= from && x.PaidAtUtc < until).ToListAsync();
        return Ok(new { month, currency = "EUR", payments = payments.Count,
            grossMinor = payments.Sum(x => x.GrossMinor), commissionMinor = payments.Sum(x => x.CommissionMinor),
            restaurantNetMinor = payments.Sum(x => x.RestaurantNetMinor), payoutsConnected = false, moneyMovementPerformed = false });
    }
}
