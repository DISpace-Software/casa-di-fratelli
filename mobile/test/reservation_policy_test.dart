import 'package:flutter_test/flutter_test.dart';
import 'package:seatmap_mobile/domain/models.dart';
import 'package:seatmap_mobile/domain/reservation_policy.dart';
import 'package:timezone/data/latest.dart' as tzdata;

void main() {
  setUpAll(tzdata.initializeTimeZones);

  test('slots use restaurant calendar day when UTC is still yesterday', () {
    const restaurant = Restaurant(
      id: 'test',
      name: 'Test',
      opensAt: '00:00',
      closesAt: '01:00',
    );
    expect(
      ReservationPolicy.timesFor(
        restaurant,
        DateTime(2026, 11, 26),
        now: DateTime.utc(2026, 11, 25, 22),
      ),
      ['00:15', '00:30', '00:45', '01:00'],
    );
    expect(
      ReservationPolicy.timesFor(
        restaurant,
        DateTime(2026, 11, 25),
        now: DateTime.utc(2026, 11, 25, 22),
      ),
      isEmpty,
    );
  });

  test('waitlist lead time advances to the next valid quarter-hour', () {
    const restaurant = Restaurant(
      id: 'test',
      name: 'Test',
      opensAt: '18:00',
      closesAt: '19:00',
    );
    expect(
      ReservationPolicy.timesFor(
        restaurant,
        DateTime(2026, 11, 26),
        now: DateTime.utc(2026, 11, 26, 16),
        extraLeadMinutes: 5,
      ),
      ['18:30', '18:45', '19:00'],
    );
  });

  test('capacity cannot authorize an unconfigured table combination', () {
    const tables = [
      SeatTable(id: '1', zoneId: 'main', label: '1', x: 0, y: 0),
      SeatTable(id: '2', zoneId: 'main', label: '2', x: 1, y: 0),
    ];
    expect(
      ReservationPolicy.canSelect(
        const FloorPlan(publicMaxTables: 2),
        tables,
        4,
      ),
      isFalse,
    );
    expect(
      ReservationPolicy.canSelect(
        const FloorPlan(
          publicMaxTables: 2,
          combinations: [
            ['1', '2'],
          ],
        ),
        tables,
        4,
      ),
      isTrue,
    );
  });
}
