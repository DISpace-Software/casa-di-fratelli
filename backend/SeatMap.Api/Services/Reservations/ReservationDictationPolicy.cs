namespace SeatMap.Api.Services.Reservations;

// Platform capability, independent of restaurant branding, plan and server ASR.
public static class ReservationDictationPolicy
{
    public static ReservationDictationCapabilities Get(IConfiguration configuration)
    {
        var configured = configuration["ReservationDictation:Enabled"];
        // A missing setting enables every restaurant; malformed rollback values fail closed.
        var enabled = configured is null || bool.TryParse(configured, out var parsed) && parsed;
        return new(enabled, "on-device", ["bg"], ["guestName", "phone"]);
    }
}

public sealed record ReservationDictationCapabilities(bool Enabled, string Mode, string[] Languages, string[] Fields);
