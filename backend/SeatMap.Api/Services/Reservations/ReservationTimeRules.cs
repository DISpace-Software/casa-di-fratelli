using SeatMap.Api.Services.Tenancy;

namespace SeatMap.Api.Services.Reservations;

public static class ReservationTimeRules
{
    public static DateTime GetRestaurantNow(TenantBrandingSettings brand, TimeProvider time)
    {
        try
        {
            return TimeZoneInfo.ConvertTime(time.GetUtcNow(), TimeZoneInfo.FindSystemTimeZoneById(brand.TimeZoneId)).DateTime;
        }
        catch (TimeZoneNotFoundException) { return time.GetLocalNow().DateTime; }
        catch (InvalidTimeZoneException) { return time.GetLocalNow().DateTime; }
    }

    // Preserve the restaurant's existing business-day convention after midnight.
    private static DateTime SelectedDateTime(DateOnly date, TimeOnly time, DateTime now)
    {
        var selected = date.ToDateTime(time);
        return date == DateOnly.FromDateTime(now) && time.Hour <= 3 && now.Hour >= 10
            ? selected.AddDays(1) : selected;
    }

    public static bool IsPast(DateOnly date, string value, DateTime now)
    {
        if (!TimeOnly.TryParse(value, out var time)) return false;
        return SelectedDateTime(date, time, now) <= now;
    }

    public static bool IsTooSoon(DateOnly date, string value, DateTime now, int leadMinutes) =>
        date == DateOnly.FromDateTime(now) && TimeOnly.TryParse(value, out var time) &&
        SelectedDateTime(date, time, now) < now.AddMinutes(leadMinutes);

    public static bool IsAllowed(string value, bool administrator, TenantBrandingSettings brand) =>
        TimeOnly.TryParse(value, out var time) &&
        time <= TimeOnly.Parse(administrator ? brand.AdminLatestReservationTime : brand.PublicLatestReservationTime);
}
