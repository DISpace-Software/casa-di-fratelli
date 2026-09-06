namespace CasaDiFratelli.Api.Services;

public static class MarketingBirthdayRules
{
    // Celebrate February 29 on February 28 in non-leap years.
    public static DateOnly BirthdayInYear(DateOnly birthDate, int year) =>
        new(year, birthDate.Month, Math.Min(birthDate.Day, DateTime.DaysInMonth(year, birthDate.Month)));

    public static DateOnly NextBirthday(DateOnly birthDate, DateOnly today)
    {
        var birthday = BirthdayInYear(birthDate, today.Year);
        return birthday < today ? BirthdayInYear(birthDate, today.Year + 1) : birthday;
    }

    public static bool IsWithinSendingWindow(DateOnly birthday, DateOnly today, int daysBefore) =>
        birthday >= today && birthday.DayNumber - today.DayNumber <= Math.Clamp(daysBefore, 0, 60);
}
