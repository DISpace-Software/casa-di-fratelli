using SeatMap.Domain.Reservations;

// These checks need no API host, database, clock, or third-party test package.
var date = new DateOnly(2026, 11, 26);
var evening = date.ToDateTime(new TimeOnly(20, 0));
var checks = new (string Name, bool Passed)[]
{
    ("A selected time equal to now is already past", ReservationTimePolicy.IsPast(date, "20:00", evening)),
    ("Early morning belongs to the next business night", !ReservationTimePolicy.IsPast(date, "01:00", evening)),
    ("Morning selection has no rollover before 10am", ReservationTimePolicy.IsPast(date, "01:00", date.ToDateTime(new TimeOnly(9, 0)))),
    ("Lead-time lower boundary is inclusive", !ReservationTimePolicy.IsTooSoon(date, "20:30", evening, 30)),
    ("Time inside lead-time window is rejected", ReservationTimePolicy.IsTooSoon(date, "20:29", evening, 30)),
    ("Tomorrow does not inherit today's lead-time window", !ReservationTimePolicy.IsTooSoon(date.AddDays(1), "00:00", evening, 1440)),
    ("Latest allowed time is inclusive", ReservationTimePolicy.IsAllowed("22:00", "22:00")),
    ("Later times are rejected", !ReservationTimePolicy.IsAllowed("22:01", "22:00")),
    ("Invalid input is rejected by allowed-time rule", !ReservationTimePolicy.IsAllowed("invalid", "22:00")),
};
foreach (var (name, passed) in checks)
{
    if (!passed) throw new InvalidOperationException(name);
    Console.WriteLine($"PASS {name}");
}
Console.WriteLine($"{checks.Length} domain checks passed.");
