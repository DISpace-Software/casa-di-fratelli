import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:seatmap_mobile/data/seatmap_repository.dart';
import 'package:seatmap_mobile/data/demo_data.dart';
import 'package:seatmap_mobile/state/app_controller.dart';

const plan = {
  'schemaVersion': 1,
  'revision': 'revision-1',
  'publicMaxGuests': 6,
  'publicMaxTables': 2,
  'zones': [
    {'id': 'salon', 'name': 'Салон', 'presentation': 'plain', 'isActive': true},
  ],
  'tables': [
    {
      'id': '1',
      'area': 'salon',
      'x': 20,
      'y': 30,
      'seats': 2,
      'wide': false,
      'isActive': true,
    },
    {
      'id': '2',
      'area': 'salon',
      'x': 60,
      'y': 30,
      'seats': 4,
      'wide': true,
      'isActive': true,
    },
  ],
  'combinations': [
    ['1', '2'],
  ],
};
const brand = {
  'name': 'Cofein',
  'addressRu': 'София',
  'phone': '+359888000000',
  'timeZoneId': 'Europe/Sofia',
  'walkInOpeningTime': '10:00',
  'publicLatestReservationTime': '21:00',
  'publicLeadMinutes': 15,
  'publicMaxReservationDaysAhead': 10,
};
http.Response jsonResponse(Object value, [int status = 200]) => http.Response(
  jsonEncode(value),
  status,
  headers: {'content-type': 'application/json'},
);
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
    'live booking sends the exact public backend DTO and string table IDs',
    () async {
      Map<String, dynamic>? submitted;
      final repository = SeatMapRepository(
        baseUrl: 'https://seatmap.example.test',
        now: () => DateTime.utc(2026, 11, 18, 10),
        client: MockClient((request) async {
          expect(request.headers['X-Admin-Token'], isNull);
          if (request.method == 'POST') {
            submitted = jsonDecode(request.body) as Map<String, dynamic>;
            return jsonResponse({
              ...submitted!,
              'id': 19,
              'status': 'Approved',
              'requiresEmailConfirmation': false,
            });
          }
          if (request.url.path.endsWith('/branding')) {
            return jsonResponse(brand);
          }
          if (request.url.path.endsWith('/floor-plan')) {
            return jsonResponse(plan);
          }
          if (request.url.path.endsWith('/blocked-slots')) {
            return jsonResponse([]);
          }
          if (request.url.path.endsWith('/zones')) {
            return jsonResponse({'closedAreas': []});
          }
          if (request.url.path.endsWith('/closure')) {
            return jsonResponse({'enabled': false});
          }
          return jsonResponse({
            'restaurants': [
              {'id': 'cofein', 'name': 'Cofein'},
            ],
          });
        }),
      );
      final restaurants = await repository.getRestaurants();
      final restaurant = await repository.loadRestaurantDetail(
        restaurants.single,
      );
      expect(restaurant.floorPlan.tables.first.zoneId, 'salon');
      final booking = await repository.createBooking(
        restaurant: restaurant,
        tableIds: ['1'],
        date: DateTime(2026, 11, 19),
        time: '19:30',
        guests: 2,
        guestName: 'Test Guest',
        phone: '+359888123456',
        email: 'guest@example.test',
      );
      expect(booking.demo, isFalse);
      expect(booking.status, 'confirmed');
      expect(submitted, containsPair('guestName', 'Test Guest'));
      expect(submitted, containsPair('guestCount', 2));
      expect(submitted, containsPair('area', 'salon'));
      expect(submitted, containsPair('reservedDate', '2026-11-19'));
      expect(submitted, containsPair('reservedTime', '19:30'));
      expect(submitted, containsPair('tableIds', ['1']));
      expect(submitted, containsPair('privacyConsent', true));
      expect(submitted!.keys, isNot(contains('createdByAdmin')));
      expect(submitted!.keys, isNot(contains('userId')));
      repository.close();
    },
  );
  test(
    'real API failure never creates a fake successful local booking',
    () async {
      final repository = SeatMapRepository(
        baseUrl: 'https://seatmap.example.test',
        now: () => DateTime.utc(2026, 11, 18, 10),
        client: MockClient((request) async {
          if (request.method == 'POST') {
            return jsonResponse({'message': 'Conflict'}, 409);
          }
          if (request.url.path.endsWith('/floor-plan')) {
            return jsonResponse(plan);
          }
          if (request.url.path.endsWith('/blocked-slots')) {
            return jsonResponse([]);
          }
          if (request.url.path.endsWith('/zones')) {
            return jsonResponse({'closedAreas': []});
          }
          if (request.url.path.endsWith('/closure')) {
            return jsonResponse({'enabled': false});
          }
          return jsonResponse({'restaurants': []});
        }),
      );
      final controller = AppController(
        initialLanguage: 'ru',
        repository: repository,
      );
      await controller.initialize();
      controller.setSearch(date: DateTime(2026, 11, 19));
      final restaurant = demoRestaurants.first.copyWith(
        floorPlan: repository.parseFloorPlan(plan),
      );
      await expectLater(
        controller.submitBooking(
          restaurant: restaurant,
          tableIds: ['1'],
          guestName: 'Test User',
          phone: '+359888123456',
          email: 'guest@example.test',
        ),
        throwsA(isA<SeatMapException>()),
      );
      expect(controller.bookings, isEmpty);
      repository.close();
    },
  );
  test('blocked slots respect 180 minute buffer, exact hall ranges and overnight ranges', () {
    expect(SeatMapRepository.blockedAt('19:00', '21:45'), isTrue);
    expect(SeatMapRepository.blockedAt('19:00', '22:00'), isFalse);
    expect(
      SeatMapRepository.blockedAt('18:15 - 20:45', '20:45', isHallBlock: true),
      isTrue,
    );
    expect(
      SeatMapRepository.blockedAt('18:15 - 20:45', '21:00', isHallBlock: true),
      isFalse,
    );
    expect(
      SeatMapRepository.blockedAt('22:00 - 01:00', '00:30', isHallBlock: true),
      isTrue,
    );
  });
  test('public holds and closed zones are applied from actual backend response shapes', () async {
    final repository = SeatMapRepository(
      baseUrl: 'https://seatmap.example.test',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/floor-plan')) {
          return jsonResponse(plan);
        }
        if (request.url.path.endsWith('/blocked-slots')) {
          return jsonResponse([
            {
              'reservedDate': '2026-11-19',
              'reservedTime': '00:00 - 23:59',
              'tableIds': ['1'],
              'isPublicHold': true,
            },
          ]);
        }
        if (request.url.path.endsWith('/zones')) {
          return jsonResponse({'closedAreas': []});
        }
        return jsonResponse({'enabled': false});
      }),
    );
    final result = await repository.loadAvailability(
      demoRestaurants.first,
      date: DateTime(2026, 11, 19),
      time: '19:30',
      guests: 2,
    );
    expect(result.tables.first.occupied, isTrue);
    expect(result.tables.last.occupied, isFalse);
    repository.close();
  });
  test('demo booking persists, blocks availability after restart and frees on cancellation', () async {
    final controller = AppController(
      initialLanguage: 'ru',
      repository: SeatMapRepository(baseUrl: ''),
    );
    await controller.initialize();
    controller.setSearch(date: DateTime.now().add(const Duration(days: 1)));
    final restaurant = controller.restaurants.first;
    final booking = await controller.submitBooking(
      restaurant: restaurant,
      tableIds: ['08'],
      guestName: 'Demo Guest',
      phone: '+359888123456',
      email: 'demo@seatmap.app',
    );
    final restored = AppController(
      initialLanguage: 'ru',
      repository: SeatMapRepository(baseUrl: ''),
    );
    await restored.initialize();
    restored.setSearch(date: controller.selectedDate);
    expect(restored.bookings.single.id, booking.id);
    expect(
      (await restored.loadAvailability(restaurant)).tables
          .firstWhere((table) => table.id == '08')
          .occupied,
      isTrue,
    );
    await restored.cancelBooking(booking.id);
    expect(
      (await restored.loadAvailability(restaurant)).tables
          .firstWhere((table) => table.id == '08')
          .occupied,
      isFalse,
    );
  });
  test(
    'incorrect demo credentials fail and favorites/profile are durable',
    () async {
      final controller = AppController(
        initialLanguage: 'ru',
        repository: SeatMapRepository(baseUrl: ''),
      );
      await controller.initialize();
      expect(await controller.login('demo@seatmap.app', 'wrong'), isFalse);
      expect(controller.isLoggedIn, isFalse);
      expect(
        await controller.login('demo@seatmap.app', 'SeatMap2026!'),
        isTrue,
      );
      await controller.toggleFavorite('cosmos');
      final restored = AppController(
        initialLanguage: 'ru',
        repository: SeatMapRepository(baseUrl: ''),
      );
      await restored.initialize();
      expect(restored.isLoggedIn, isTrue);
      expect(restored.favorites, contains('cosmos'));
    },
  );
}
