using SeatMap.Api.Services.Tenancy;

namespace SeatMap.Api.Services.Reservations;

public static class RestaurantPublicLinks
{
    public static string GetFrontendUrl(ICurrentTenant tenant, IConfiguration configuration)
    {
        if (!string.IsNullOrWhiteSpace(tenant.FrontendUrl)) return tenant.FrontendUrl.TrimEnd('/');
        var configured = configuration["FRONTEND_URL"];
        return string.IsNullOrWhiteSpace(configured) ? "https://casadifratelli.bg" : configured.TrimEnd('/');
    }
}
