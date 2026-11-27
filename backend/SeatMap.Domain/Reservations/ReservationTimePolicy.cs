namespace SeatMap.Domain.Reservations;

/// <summary>Pure business-day rules shared by reservations and waitlist allocation.</summary>
/// <remarks>Callers supply restaurant-local time. This policy never reads a clock or configuration.</remarks>
public static class ReservationTimePolicy
{
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

    public static bool IsAllowed(string value, string latestReservationTime) =>
        TimeOnly.TryParse(value, out var time) && time <= TimeOnly.Parse(latestReservationTime);
}
