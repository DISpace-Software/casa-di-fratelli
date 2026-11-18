using Microsoft.AspNetCore.Mvc;
using SeatMap.Api.Platform;

namespace SeatMap.Api.Controllers;

[ApiController, Route("api/v1/platform/context"), PlatformEndpoint]
public sealed class PlatformContextController : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        // Approximate country only, supplied by the edge. No GPS or IP lookup
        // service is called; this hint never grants access or affects tenancy.
        var country = Request.Headers["CF-IPCountry"].ToString().ToUpperInvariant();
        if (country.Length != 2 || country.Any(c => c is < 'A' or > 'Z') || country is "XX" or "T1") country = "";
        Response.Headers.CacheControl = "no-store";
        return Ok(new { countryCode = country, supportedLanguages = new[] { "bg", "en", "ru" } });
    }
}
