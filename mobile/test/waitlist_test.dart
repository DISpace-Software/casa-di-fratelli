import 'dart:convert';
import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:seatmap_mobile/data/guest_account_repository.dart';
import 'package:seatmap_mobile/data/seatmap_repository.dart';
import 'package:seatmap_mobile/domain/models.dart';
import 'package:seatmap_mobile/state/app_controller.dart';
import 'package:seatmap_mobile/ui/screens/waitlist_screen.dart';
import 'package:seatmap_mobile/ui/theme.dart';

import 'guest_account_test.dart' as auth;
import 'menu_preorder_test.dart' as fixture;

class QueueController extends AppController {
  QueueController({super.accounts, SeatMapRepository? repository})
    : super(
        initialLanguage: 'en',
        repository: repository ?? fixture.MenuRepository(),
      );
  int confirmed = 0;
  @override
  Future<void> refreshWaitlist() async {}
  @override
  Future<void> confirmWaitlist(
    Restaurant restaurant,
    String entryId,
    String offerId,
  ) async {
    confirmed++;
    waitlistEntries = [];
    notifyListeners();
  }
}

class TimeRepository extends fixture.MenuRepository {
  List<String> slots = ['19:00', '19:15', '19:30', '19:45', '20:00', '20:15'];
  @override
  List<String> timesFor(
    Restaurant restaurant,
    DateTime date, {
    int extraLeadMinutes = 0,
  }) => slots;
}

void main() {
  test('confirmation response after account change cannot save another guest booking', () async {
    SharedPreferences.setMockInitialValues({});
    final response = Completer<http.Response>();
    final started = Completer<void>();
    final api = GuestAccountRepository(
      baseUrl: 'https://api.example.test',
      store: auth.MemorySessions()..token = auth.token,
      client: MockClient((request) async {
        if (request.url.path.endsWith('/confirm')) {
          started.complete();
          return response.future;
        }
        return http.Response('{}', 200);
      }),
    );
    final controller = AppController(
      initialLanguage: 'en',
      accounts: api,
      repository: fixture.MenuRepository(),
    );
    await controller.initialize();
    controller.isLoggedIn = true;
    controller.profile = auth.profile;
    final operation = controller.confirmWaitlist(
      fixture.restaurant,
      'entry',
      'offer',
    );
    await started.future;
    controller.profile = const GuestProfile(id: 'different-guest');
    response.complete(http.Response('{}', 200));
    await operation;
    expect(controller.bookings, isEmpty);
    controller.dispose();
  });

  testWidgets(
    'join removes invisible inherited time and submits only five selected times',
    (tester) async {
      fixture.phone(tester);
      SharedPreferences.setMockInitialValues({});
      final requests = <Map<String, dynamic>>[];
      final sessions = auth.MemorySessions()..token = auth.token;
      final api = GuestAccountRepository(
        baseUrl: 'https://api.example.test',
        store: sessions,
        client: MockClient((request) async {
          if (request.method == 'POST') {
            requests.add(Map<String, dynamic>.from(jsonDecode(request.body)));
          }
          return http.Response('{}', 200);
        }),
      );
      final repo = TimeRepository();
      final controller = QueueController(accounts: api, repository: repo);
      await controller.initialize();
      controller.isLoggedIn = true;
      controller.selectedTime = '18:00';
      await tester.pumpWidget(
        MaterialApp(
          theme: seatMapTheme(),
          home: WaitlistScreen(
            controller: controller,
            restaurant: fixture.restaurant,
            area: 'inside',
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull,
      );
      for (final time in repo.slots) {
        await tester.ensureVisible(find.text(time));
        await tester.tap(find.text(time));
        await tester.pump();
      }
      expect(
        tester
            .widget<FilterChip>(find.widgetWithText(FilterChip, '20:15'))
            .selected,
        false,
      );
      final scroll = tester
          .state<ScrollableState>(find.byType(Scrollable).first)
          .position;
      scroll.jumpTo(scroll.maxScrollExtent);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byType(FilledButton));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(FilledButton));
      await tester.pumpAndSettle();
      expect(requests.single['times'], repo.slots.take(5).toList());
      expect(requests.single['area'], 'inside');
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      controller.dispose();
    },
  );
  testWidgets('slot expiring while form is open is not sent', (tester) async {
    fixture.phone(tester);
    SharedPreferences.setMockInitialValues({});
    var calls = 0;
    final api = GuestAccountRepository(
      baseUrl: 'https://api.example.test',
      store: auth.MemorySessions()..token = auth.token,
      client: MockClient((request) async {
        calls++;
        return http.Response('{}', 200);
      }),
    );
    final repo = TimeRepository();
    final controller = QueueController(accounts: api, repository: repo);
    await controller.initialize();
    controller.isLoggedIn = true;
    controller.selectedTime = '19:00';
    await tester.pumpWidget(
      MaterialApp(
        theme: seatMapTheme(),
        home: WaitlistScreen(
          controller: controller,
          restaurant: fixture.restaurant,
          area: 'inside',
        ),
      ),
    );
    await tester.pumpAndSettle();
    calls = 0;
    repo.slots = ['19:15'];
    final scroll = tester
        .state<ScrollableState>(find.byType(Scrollable).first)
        .position;
    scroll.jumpTo(scroll.maxScrollExtent);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byType(FilledButton));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FilledButton));
    await tester.pumpAndSettle();
    expect(calls, 0);
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );
    await tester.pumpWidget(const SizedBox());
    controller.dispose();
  });
  test(
    'waitlist uses authenticated restaurant route and offer version',
    () async {
      final sessions = auth.MemorySessions()..token = auth.token;
      final api = GuestAccountRepository(
        baseUrl: 'https://api.example.test',
        store: sessions,
        client: MockClient((request) async {
          expect(
            request.url.path,
            '/api/v1/restaurants/cofein/waitlist/entry/confirm',
          );
          expect(request.headers['authorization'], 'Bearer ${auth.token}');
          expect(jsonDecode(request.body)['offerId'], 'offer-version');
          return http.Response('{}', 200);
        }),
      );
      await api.waitlist(
        'cofein',
        path: '/entry/confirm',
        method: 'POST',
        body: {'offerId': 'offer-version'},
      );
      api.close();
    },
  );
  testWidgets(
    'offer requires explicit confirmation; expired offer cannot be confirmed',
    (tester) async {
      fixture.phone(tester);
      SharedPreferences.setMockInitialValues({});
      final controller = QueueController();
      await controller.initialize();
      controller.isLoggedIn = true;
      controller.restaurants = [fixture.restaurant];
      controller.waitlistEntries = [
        {
          'id': 'entry',
          'offerId': 'offer',
          'restaurantId': fixture.restaurant.id,
          'date': '2026-11-28',
          'guests': 4,
          'area': 'inside',
          'times': ['19:00', '19:30'],
          'status': 'offered',
          'offerTime': '19:30',
          'expiresAtUtc': DateTime.now()
              .toUtc()
              .add(const Duration(minutes: 5))
              .toIso8601String(),
        },
      ];
      await tester.pumpWidget(
        MaterialApp(
          theme: seatMapTheme(),
          home: Scaffold(
            body: SingleChildScrollView(
              child: WaitlistCards(controller: controller, history: false),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(controller.confirmed, 0);
      expect(find.text('Confirm booking'), findsOneWidget);
      controller.waitlistEntries.first['expiresAtUtc'] = DateTime.now()
          .toUtc()
          .subtract(const Duration(seconds: 1))
          .toIso8601String();
      await tester.pump(const Duration(seconds: 1));
      expect(find.text('Confirm booking'), findsNothing);
      controller.waitlistEntries.first['expiresAtUtc'] = DateTime.now()
          .toUtc()
          .add(const Duration(minutes: 5))
          .toIso8601String();
      await tester.pump(const Duration(seconds: 1));
      await tester.tap(find.text('Confirm booking'));
      await tester.pumpAndSettle();
      expect(controller.confirmed, 1);
      controller.waitlistEntries = [
        {
          'id': 'entry',
          'offerId': 'offer',
          'restaurantId': fixture.restaurant.id,
          'reservationId': 42,
          'date': '2026-11-28',
          'guests': 4,
          'times': ['19:30'],
          'status': 'booked',
        },
      ];
      await tester.pumpWidget(
        MaterialApp(
          theme: seatMapTheme(),
          home: Scaffold(
            body: WaitlistCards(
              key: const ValueKey('recovery'),
              controller: controller,
              history: true,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Restore booking in the app'), findsOneWidget);
      await tester.tap(find.text('Restore booking in the app'));
      await tester.pumpAndSettle();
      expect(controller.confirmed, 2);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      controller.dispose();
    },
  );
  testWidgets('waitlist offer layout', (tester) async {
    fixture.phone(tester);
    SharedPreferences.setMockInitialValues({});
    if (const bool.fromEnvironment('CAPTURE_VISUALS')) {
      await (FontLoader(
        'Inter',
      )..addFont(rootBundle.load('assets/fonts/Inter.ttf'))).load();
      await (FontLoader(
        'MaterialIcons',
      )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
    }
    final controller = QueueController();
    await controller.initialize();
    controller.isLoggedIn = true;
    controller.restaurants = [fixture.restaurant];
    controller.waitlistEntries = [
      {
        'id': 'entry',
        'offerId': 'offer',
        'restaurantId': fixture.restaurant.id,
        'date': '2026-11-28',
        'guests': 4,
        'area': 'inside',
        'times': ['19:00', '19:30'],
        'status': 'offered',
        'offerTime': '19:30',
        'expiresAtUtc': DateTime.now()
            .toUtc()
            .add(const Duration(minutes: 5))
            .toIso8601String(),
      },
    ];
    await tester.pumpWidget(
      MaterialApp(
        theme: seatMapTheme(),
        home: Scaffold(
          appBar: AppBar(title: const Text('Reservations')),
          body: Padding(
            padding: const EdgeInsets.all(24),
            child: WaitlistCards(controller: controller, history: false),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    if (const bool.fromEnvironment('CAPTURE_VISUALS')) {
      await tester.runAsync(() async {
        final boundary = tester.renderObject<RenderRepaintBoundary>(
          find.byType(RepaintBoundary).first,
        );
        final image = await boundary.toImage(pixelRatio: 2);
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        await Directory('.local').create(recursive: true);
        await File('.local/waitlist-offer.png')
            .writeAsBytes(bytes!.buffer.asUint8List());
        image.dispose();
      });
    }
    await tester.pumpWidget(const SizedBox());
    controller.dispose();
  });
}
