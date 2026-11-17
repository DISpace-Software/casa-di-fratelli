using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using SeatMap.Api.Controllers;
using SeatMap.Api.Services.Tenancy;

internal static class ReservationDictationChecks
{
    public static void Run()
    {
        foreach (var tenantId in new[] { "casa-di-fratelli", "cofein", "future-restaurant" })
        {
            var controller = Controller(tenantId);
            var body = Body(controller.GetContext());
            var capability = body.GetProperty("reservationDictation");
            Check(body.GetProperty("tenantId").GetString() == tenantId && capability.GetProperty("enabled").GetBoolean(),
                $"Default on-device dictation is available to {tenantId} without plan, branding or worker lookups");
            Check(capability.EnumerateObject().Select(item => item.Name).Order().SequenceEqual(new[] { "enabled", "fields", "languages", "mode" }) &&
                capability.GetProperty("mode").GetString() == "on-device" &&
                capability.GetProperty("languages").EnumerateArray().Select(item => item.GetString()).SequenceEqual(new[] { "bg" }) &&
                capability.GetProperty("fields").EnumerateArray().Select(item => item.GetString()).SequenceEqual(new[] { "guestName", "phone" }),
                $"{tenantId} receives only the Bulgarian name/phone capability, with no upload endpoint or credentials");
            Check(controller.Response.Headers.CacheControl == "no-store", $"{tenantId} bootstrap is not cached");
        }

        foreach (var configured in new[] { "false", "FALSE", "", "yes", "1", "invalid" })
        {
            var controller = Controller("cofein", configured);
            Check(!Body(controller.GetContext()).GetProperty("reservationDictation").GetProperty("enabled").GetBoolean(),
                $"Global rollback fails closed for configured value '{configured}'");
        }
        Check(Body(Controller("future-restaurant", "true").GetContext()).GetProperty("reservationDictation").GetProperty("enabled").GetBoolean(),
            "Explicit true enables a future restaurant without per-tenant provisioning");

        var unresolved = Controller(null);
        Check(unresolved.GetContext() is NotFoundObjectResult && unresolved.Response.Headers.CacheControl == "no-store",
            "Unresolved tenant bootstrap remains unavailable and uncached");
    }

    private static AdminAuthController Controller(string? tenantId, string? enabled = null)
    {
        var current = new CurrentTenant();
        if (tenantId is not null) current.Resolve(new TenantDefinition { Id = tenantId, Slug = tenantId });
        var settings = new Dictionary<string, string?>
        {
            // Disabled/Casa-only server speech must not govern on-device availability.
            ["ReservationSpeech:Enabled"] = "false",
            ["ReservationSpeech:AllowedTenants:0"] = "casa-di-fratelli"
        };
        if (enabled is not null) settings["ReservationDictation:Enabled"] = enabled;
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
        // This public bootstrap must not consult tenant data, authentication or product tier.
        return new AdminAuthController(null!, null!, null!, null!, configuration, null!, current, null!)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
    }

    private static JsonElement Body(IActionResult result) => result is OkObjectResult ok
        ? JsonSerializer.SerializeToElement(ok.Value, new JsonSerializerOptions(JsonSerializerDefaults.Web))
        : throw new Exception("Expected successful restaurant bootstrap");

    private static void Check(bool condition, string scenario)
    {
        if (!condition) throw new Exception(scenario);
        Console.WriteLine($"PASS {scenario}");
    }
}
