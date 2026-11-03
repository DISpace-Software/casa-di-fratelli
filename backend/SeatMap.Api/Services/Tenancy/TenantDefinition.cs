namespace SeatMap.Api.Services.Tenancy;

public enum ReservationConfirmationMode
{
    EmailForFirstVisit,
    Automatic
}

public sealed class TenantDefinition
{
    public string Id { get; set; } = "casa-di-fratelli";

    public string Name { get; set; } = "Casa di Fratelli";

    public string Slug { get; set; } = "casa-di-fratelli";

    public string? Domain { get; set; } = "casadifratelli.bg";

    public List<string> FrontendOrigins { get; set; } = new();

    public string? FrontendUrl { get; set; }

    public bool IsActive { get; set; } = true;

    // Publishing in the SeatMap directory is an explicit opt-in.
    public bool IsListed { get; set; }

    public bool SeedDefaultMenu { get; set; }

    // Infrastructure policy: existing tenants retain the original email workflow.
    public ReservationConfirmationMode ReservationConfirmationMode { get; set; } = ReservationConfirmationMode.EmailForFirstVisit;

    public bool NotificationsEnabled { get; set; } = true;

    public string AdminEmailConfigurationKey { get; set; } = "ADMIN_EMAIL";

    public string AdminPasswordConfigurationKey { get; set; } = "ADMIN_PASSWORD";

    public string DatabaseMode { get; set; } = "DedicatedDatabase";

    public string ConnectionStringKey { get; set; } = "DefaultConnection";
}
