using CasaDiFratelli.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace CasaDiFratelli.Api.Services;

public sealed record TableConflict(int Id, string ReservedTime, List<string> TableIds);

public class ReservationConflictService
{
    private const int TableBufferMinutes = 180;
    private readonly AppDbContext _db;

    public ReservationConflictService(AppDbContext db)
    {
        _db = db;
    }

    public static List<string> NormalizeTableIds(IEnumerable<string>? tableIds)
    {
        return (tableIds ?? Enumerable.Empty<string>())
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public static List<string> NormalizeTimes(IEnumerable<string>? times)
    {
        return (times ?? Enumerable.Empty<string>())
            .Where(time => !string.IsNullOrWhiteSpace(time))
            .Select(time => time.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public static object ToConflictResponse(TableConflict conflict)
    {
        return new
        {
            message = "One or more selected tables are reserved less than three hours from this time.",
            conflict.ReservedTime,
            conflict.TableIds
        };
    }

    public static bool IsWithinHallBlock(string range, TimeOnly time)
    {
        foreach (var part in range.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var bounds = part.Split(" - ", StringSplitOptions.TrimEntries);
            if (!TimeOnly.TryParse(bounds[0], out var start)) continue;
            if (bounds.Length == 1) { if (time == start) return true; continue; }
            if (!TimeOnly.TryParse(bounds[1], out var end)) continue;
            if (start <= end ? time >= start && time <= end : time >= start || time <= end) return true;
        }
        return false;
    }

    private static List<TimeOnly> ExpandReservationTimes(string reservedTime)
    {
        var values = new List<TimeOnly>();

        foreach (var part in reservedTime.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (part.Contains(" - ", StringComparison.Ordinal))
            {
                var range = part.Split(" - ", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                if (range.Length == 2 &&
                    TimeOnly.TryParse(range[0], out var start) &&
                    TimeOnly.TryParse(range[1], out var end))
                {
                    var startMinutes = start.Hour * 60 + start.Minute;
                    var endMinutes = end.Hour * 60 + end.Minute;
                    if (endMinutes < startMinutes)
                        endMinutes += 24 * 60;

                    for (var minute = startMinutes; minute <= endMinutes; minute += 60)
                    {
                        values.Add(TimeOnly.FromTimeSpan(TimeSpan.FromMinutes(minute % (24 * 60))));
                    }
                }

                continue;
            }

            if (TimeOnly.TryParse(part, out var time))
                values.Add(time);
        }

        return values;
    }

    public async Task<TableConflict?> FindTableConflictAsync(
        DateOnly reservedDate,
        string reservedTime,
        List<string> tableIds,
        int? excludeReservationId = null)
    {
        var candidates = await _db.Reservations
            .Include(x => x.Tables)
            .Where(x =>
                x.Status == "Approved" &&
                x.ReservedDate == reservedDate &&
                (!excludeReservationId.HasValue || x.Id != excludeReservationId.Value) &&
                x.Tables.Any(t => tableIds.Contains(t.TableCode)))
            .ToListAsync();

        var targetTimes = ExpandReservationTimes(reservedTime);

        if (targetTimes.Count == 0)
        {
            var sameTimeConflict = candidates.FirstOrDefault(x => x.ReservedTime == reservedTime);
            return sameTimeConflict == null
                ? null
                : new TableConflict(
                    sameTimeConflict.Id,
                    sameTimeConflict.ReservedTime,
                    sameTimeConflict.Tables.Select(t => t.TableCode).ToList());
        }

        foreach (var candidate in candidates)
        {
            if (candidate.CreatedByAdmin && candidate.Phone == "admin" && candidate.GuestName == "Admin block")
            {
                if (targetTimes.Any(time => IsWithinHallBlock(candidate.ReservedTime, time)))
                    return new TableConflict(candidate.Id, candidate.ReservedTime, candidate.Tables.Select(t => t.TableCode).ToList());
                continue;
            }

            var candidateTimes = ExpandReservationTimes(candidate.ReservedTime);
            if (candidateTimes.Count == 0)
                continue;

            foreach (var candidateTime in candidateTimes)
            {
                foreach (var targetTime in targetTimes)
                {
                    var distance = Math.Abs((candidateTime - targetTime).TotalMinutes);
                    var minutes = Math.Min(distance, 24 * 60 - distance);
                    if (minutes < TableBufferMinutes)
                    {
                        return new TableConflict(
                            candidate.Id,
                            candidate.ReservedTime,
                            candidate.Tables.Select(t => t.TableCode).ToList());
                    }
                }
            }
        }

        return null;
    }
}
