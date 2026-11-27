import 'package:timezone/timezone.dart' as tz;

import 'models.dart';

/// Client-side reservation rules for immediate feedback and demo behavior.
/// The server remains authoritative for availability and permission to mutate.
/// Time-zone data is initialized by the application data adapter.
abstract final class ReservationPolicy {
  /// Hall closures use inclusive ranges; reservations block a three-hour
  /// neighborhood, including overlaps across midnight. Matches the API contract.
  static bool blockedAt(
    String value,
    String target, {
    bool isHallBlock = false,
  }) {
    final minute = _minutes(target);
    for (final part in value.split(',')) {
      final range = part.trim().split(' - '),
          start = _minutes(part.trim().split(' - ').first);
      final end = range.length > 1 ? _minutes(range[1]) : start;
      if (isHallBlock) {
        if (start <= end
            ? minute >= start && minute <= end
            : minute >= start || minute <= end) {
          return true;
        }
      } else {
        final last = end < start ? end + 1440 : end;
        for (var point = start; point <= last; point += 60) {
          final distance = ((point % 1440) - minute).abs();
          if (distance < 180 || 1440 - distance < 180) return true;
        }
      }
    }
    return false;
  }

  static int _minutes(String value) {
    if (!RegExp(r'^([01]\d|2[0-3]):[0-5]\d$').hasMatch(value)) {
      throw const FormatException('Restaurant times must use HH:mm.');
    }
    return int.parse(value.substring(0, 2)) * 60 +
        int.parse(value.substring(3));
  }

  static DateTime restaurantNow(Restaurant restaurant, DateTime now) =>
      tz.TZDateTime.from(now.toUtc(), tz.getLocation(restaurant.timeZone));

  /// [date] is a restaurant calendar date, not an instant in the device zone.
  /// Waitlist callers reserve extra lead time for the offer confirmation window.
  static List<String> timesFor(
    Restaurant restaurant,
    DateTime date, {
    required DateTime now,
    int extraLeadMinutes = 0,
  }) {
    now = restaurantNow(restaurant, now);
    final day = DateTime(date.year, date.month, date.day),
        today = DateTime(now.year, now.month, now.day);
    if (day.isBefore(today) ||
        day.isAfter(today.add(Duration(days: restaurant.maxDaysAhead)))) {
      return [];
    }
    final times = <String>[];
    for (
      var minute = _minutes(restaurant.opensAt);
      minute <= _minutes(restaurant.closesAt);
      minute += 15
    ) {
      if (day == today &&
          minute <
              now.hour * 60 +
                  now.minute +
                  restaurant.leadMinutes +
                  extraLeadMinutes) {
        continue;
      }
      times.add(
        '${(minute ~/ 60).toString().padLeft(2, '0')}:${(minute % 60).toString().padLeft(2, '0')}',
      );
    }
    return times;
  }

  static DateTime bookingStartsAt(Booking booking) {
    if (booking.startsAtUtc != null) return booking.startsAtUtc!;
    final parts = booking.time.split(':');
    return tz.TZDateTime(
      tz.getLocation(booking.timeZone),
      booking.date.year,
      booking.date.month,
      booking.date.day,
      int.parse(parts[0]),
      int.parse(parts[1]),
    ).toUtc();
  }

  // Prefer the server deadline: local calculation is only a legacy/demo fallback.
  static DateTime cancellationDeadline(Booking booking) =>
      booking.cancellationDeadlineUtc ??
      bookingStartsAt(booking)
          .subtract(Duration(minutes: booking.cancellationLeadMinutes));

  static bool canCancelBooking(Booking booking, DateTime now) =>
      (booking.demo || booking.managementToken.isNotEmpty) &&
      booking.serverCanCancel &&
      ['confirmed', 'pending'].contains(booking.status) &&
      !now.toUtc().isAfter(cancellationDeadline(booking));

  /// Capacity alone does not authorize combining tables. Only combinations
  /// explicitly configured by the restaurant may be selected together.
  static bool canSelect(FloorPlan plan, List<SeatTable> tables, int guests) {
    if (tables.isEmpty ||
        tables.any((table) => table.occupied) ||
        tables.length > plan.publicMaxTables ||
        guests < 1 ||
        guests > plan.publicMaxGuests ||
        tables.map((table) => table.zoneId).toSet().length != 1 ||
        tables.fold(0, (sum, table) => sum + table.capacity) < guests) {
      return false;
    }
    final ids = tables.map((table) => table.id).toSet();
    return tables.length == 1 ||
        plan.combinations.any(
          (group) => group.length == ids.length && ids.containsAll(group),
        );
  }
}
