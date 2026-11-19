import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:seatmap_mobile/data/seatmap_repository.dart';
import 'package:seatmap_mobile/domain/models.dart';
import 'package:seatmap_mobile/state/app_controller.dart';
import 'package:seatmap_mobile/ui/restaurant_contact.dart';

Booking booking({
  bool demo = false,
  String token = 'private-booking-capability',
}) => Booking(
  id: 'cofein:17',
  restaurantId: 'cofein',
  restaurantName: 'Cofein',
  restaurantImage: 'assets/images/cofein.webp',
  date: DateTime(2026, 11, 20),
  time: '19:00',
  guests: 2,
  tableIds: ['3'],
  tableLabel: '3',
  guestName: 'Synthetic guest',
  phone: '+3595550199',
  restaurantPhone: '0893300305',
  managementToken: token,
  demo: demo,
);
Map<String, Object> status(String value, {bool canCancel = true}) => {
  'id': 17,
  'status': value,
  'reservedDate': '2026-11-20',
  'reservedTime': '19:00',
  'startsAtUtc': '2026-11-20T17:00:00Z',
  'cancellationDeadlineUtc': '2026-11-20T14:00:00Z',
  'guestCount': 4,
  'tableIds': ['7', '8'],
  'cancellationLeadMinutes': 180,
  'canCancel': canCancel,
  'restaurantPhone': '0893300305',
};
http.Response response(Object value, [int code = 200]) => http.Response.bytes(
  utf8.encode(jsonEncode(value)),
  code,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

void main() {
  test(
    'cancellation policy uses restaurant time and exact three-hour boundary',
    () {
      var now = DateTime.utc(2026, 11, 20, 14);
      final repository = SeatMapRepository(baseUrl: '', now: () => now);
      expect(repository.canCancelBooking(booking(demo: true)), isTrue);
      now = now.add(Duration(microseconds: 1));
      expect(repository.canCancelBooking(booking(demo: true)), isFalse);
      expect(repository.canCancelBooking(booking(token: '')), isFalse);
    },
  );

  test(
    'real cancellation sends capability in a header and uses server result',
    () async {
      final repository = SeatMapRepository(
        baseUrl: 'https://api.example.test',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(
            request.url.path,
            '/api/v1/restaurants/cofein/reservations/17/cancel',
          );
          expect(
            request.headers['X-Reservation-Token'],
            'private-booking-capability',
          );
          expect(
            request.url.toString(),
            isNot(contains('private-booking-capability')),
          );
          return response(status('Cancelled', canCancel: false));
        }),
      );
      final cancelled = await repository.cancelBooking(booking());
      expect(cancelled.status, 'cancelled');
      expect(cancelled.guests, 4);
      expect(cancelled.tableLabel, '7 + 8');
      expect(cancelled.serverCanCancel, isFalse);
      expect(
        jsonEncode(cancelled.toJson()),
        isNot(contains('private-booking-capability')),
      );
      expect(Booking.fromJson(cancelled.toJson()).managementToken, isEmpty);
    },
  );

  test(
    'late cancellation is not reported as success and preserves the booking',
    () async {
      final repository = SeatMapRepository(
        baseUrl: 'https://api.example.test',
        client: MockClient((request) async {
          if (request.method == 'GET') {
            return response(status('Approved', canCancel: false));
          }
          return response({
            'code': 'CONTACT_RESTAURANT',
            'reservation': status('Approved', canCancel: false),
          }, 409);
        }),
      );
      final controller = AppController(repository: repository)
        ..bookings = [booking()];
      await expectLater(
        controller.cancelBooking('cofein:17'),
        throwsA(isA<SeatMapException>()),
      );
      expect(controller.bookings.single.status, 'confirmed');
      expect(repository.canCancelBooking(controller.bookings.single), isFalse);
      expect(
        controller.restaurantPhoneFor(controller.bookings.single),
        '0893300305',
      );
    },
  );

  test('lost cancellation response recovers actual cancelled status', () async {
    final repository = SeatMapRepository(
      baseUrl: 'https://api.example.test',
      client: MockClient((request) async {
        if (request.method == 'POST') {
          throw http.ClientException('connection lost');
        }
        return response(status('Cancelled', canCancel: false));
      }),
    );
    final controller = AppController(repository: repository)
      ..bookings = [booking()];
    await controller.cancelBooking('cofein:17');
    expect(controller.bookings.single.status, 'cancelled');
  });

  test(
    'maps retain restaurant-specific landmarks during availability copies',
    () {
      final repository = SeatMapRepository(baseUrl: '');
      final plan = repository.parseFloorPlan({
        'schemaVersion': 1,
        'revision': 'revision-2',
        'publicMaxGuests': 8,
        'publicMaxTables': 1,
        'zones': [
          {'id': 'garden', 'name': 'Garden', 'isActive': true},
        ],
        'tables': [],
        'combinations': [],
        'landmarks': [
          {
            'id': 'tv',
            'zoneId': 'garden',
            'kind': 'tv',
            'x': 3,
            'y': 46,
            'width': 3,
            'height': 8,
          },
        ],
      });
      expect(plan.copyWith(tables: []).landmarks.single.kind, 'tv');
      expect(plan.landmarks.single.zoneId, 'garden');
    },
  );

  test('Cofein and Casa phones become international tel numbers', () {
    expect(dialableRestaurantPhone('0893 300 305'), '+359893300305');
    expect(dialableRestaurantPhone('+359888218318'), '+359888218318');
    expect(dialableRestaurantPhone('00359 893 300305'), '+359893300305');
  });
}
