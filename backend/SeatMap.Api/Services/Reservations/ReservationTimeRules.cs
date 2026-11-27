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

    public static bool IsPast(DateOnly date, string value, DateTime now) =>
        SeatMap.Domain.Reservations.ReservationTimePolicy.IsPast(date, value, now);

    public static bool IsTooSoon(DateOnly date, string value, DateTime now, int leadMinutes) =>
        SeatMap.Domain.Reservations.ReservationTimePolicy.IsTooSoon(date, value, now, leadMinutes);

    public static bool IsAllowed(string value, bool administrator, TenantBrandingSettings brand) =>
        SeatMap.Domain.Reservations.ReservationTimePolicy.IsAllowed(
            value, administrator ? brand.AdminLatestReservationTime : brand.PublicLatestReservationTime);
}
