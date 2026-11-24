import 'dart:convert';

import 'package:seatmap_mobile/data/seatmap_repository.dart';
import 'package:seatmap_mobile/ui/screens/menu_screen.dart';

import 'package:intl/date_symbol_data_local.dart';

import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:seatmap_mobile/domain/models.dart';
import 'package:seatmap_mobile/state/app_controller.dart';
import 'package:seatmap_mobile/ui/screens/discovery_screens.dart';
import 'package:seatmap_mobile/ui/theme.dart';

import 'menu_preorder_test.dart' as fixture;

Booking visit(
  String id,
  DateTime date, {
  String status = 'confirmed',
  bool demo = true,
  String token = '',
}) => Booking(
  id: id,
  demo: demo,
  managementToken: token,
  restaurantId: fixture.restaurant.id,
  restaurantName: fixture.restaurant.name,
  restaurantImage: 'assets/images/casa.webp',
  date: date,
  time: '19:30',
  guests: 2,
  tableIds: ['08'],
  tableLabel: '08',
  guestName: 'Guest',
  phone: '',
  status: status,
);
Map<String, dynamic> order(String id, String name) => {
  'id': id,
  'status': 'Draft',
  'totalMinor': 1250,
  'notes': '',
  'items': [
    {
      'menuItemId': 1,
      'name': name,
      'quantity': 1,
      'unitMinor': 1250,
      'notes': 'No bacon',
    },
  ],
};

class PartialOrdersRepository extends fixture.MenuRepository {
  bool recovered = false;
  @override
  Future<List<Map<String, dynamic>>> preorderDrafts(Booking booking) async {
    if (booking.id == 'denied') {
      throw const SeatMapException(
        'Old generic error',
        code: 'RESERVATION_NOT_FOUND',
      );
    }
    if (booking.id == 'offline' && !recovered) {
      throw const SeatMapException('Network failure');
    }
    return [order(booking.id, 'Saved dish')];
  }
}

void main() {
  setUpAll(() async {
    for (final lang in ['en', 'bg', 'ru']) {
      await initializeDateFormatting(lang);
    }
  });
  testWidgets(
    'five tabs, live badge and active/history filtering preserve orders',
    (tester) async {
      fixture.phone(tester);
      final future = DateTime.now().add(const Duration(days: 3));
      final past = DateTime.now().subtract(const Duration(days: 3));
      SharedPreferences.setMockInitialValues({
        'demo-preorders-upcoming': jsonEncode([order('a', 'Upcoming dish')]),
        'demo-preorders-past': jsonEncode([order('b', 'Past dish')]),
        'demo-preorders-cancelled': jsonEncode([order('c', 'Cancelled dish')]),
      });
      final controller = AppController(
        initialLanguage: 'en',
        repository: fixture.MenuRepository(),
      );
      await controller.initialize();
      controller.restaurants = [
        fixture.restaurant.copyWith(imageAsset: 'assets/images/casa.webp'),
      ];
      controller.bookings = [
        visit('upcoming', future),
        visit('past', past),
        visit('cancelled', future, status: 'cancelled'),
      ];
      await tester.pumpWidget(
        MaterialApp(
          theme: seatMapTheme(),
          home: AppShell(controller: controller),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('navigation-tab-4')), findsOneWidget);
      expect(
        find.descendant(
          of: find.byKey(const ValueKey('orders-count')),
          matching: find.text('1'),
        ),
        findsOneWidget,
      );
      await tester.tap(find.byKey(const ValueKey('navigation-tab-3')));
      await tester.pumpAndSettle();
      expect(find.text('1 × Upcoming dish'), findsOneWidget);
      expect(find.text('1 × Past dish'), findsNothing);
      expect(find.text('1 × Cancelled dish'), findsNothing);
      await tester.tap(find.byKey(const ValueKey('orders-history')));
      await tester.pumpAndSettle();
      expect(find.text('1 × Upcoming dish'), findsNothing);
      expect(find.byKey(const ValueKey('preorder-c')), findsOneWidget);
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('preorder-b')),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('1 × Past dish'), findsOneWidget);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        'demo-preorders-upcoming',
        jsonEncode([order('a', 'Upcoming dish'), order('d', 'New dish')]),
      );
      controller.preordersChanged();
      await tester.pumpAndSettle();
      expect(
        find.descendant(
          of: find.byKey(const ValueKey('orders-count')),
          matching: find.text('2'),
        ),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      controller.dispose();
    },
  );

  testWidgets(
    'partial failures are scoped to bookings and history; retry recovers',
    (tester) async {
      fixture.phone(tester);
      SharedPreferences.setMockInitialValues({});
      final repository = PartialOrdersRepository();
      final controller = AppController(
        initialLanguage: 'en',
        repository: repository,
      );
      await controller.initialize();
      final future = DateTime.now().add(const Duration(days: 3));
      controller.bookings = [
        visit('good', future, demo: false, token: 'token'),
        visit(
          'denied',
          DateTime.now().subtract(const Duration(days: 3)),
          demo: false,
          token: 'token',
        ),
        visit('offline', future, demo: false, token: 'token'),
        visit('missing', future, demo: false),
      ];
      await tester.pumpWidget(
        MaterialApp(
          theme: seatMapTheme(),
          home: PreordersScreen(controller: controller),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('preorder-good')), findsOneWidget);
      expect(find.text('Old generic error'), findsNothing);
      expect(find.byKey(const ValueKey('order-issue-denied')), findsNothing);
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('order-issue-offline')),
        250,
      );
      expect(find.byKey(const ValueKey('order-issue-offline')), findsOneWidget);
      repository.recovered = true;
      controller.preordersChanged();
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('order-issue-offline')), findsNothing);
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('order-issue-missing')),
        250,
      );
      expect(
        find.descendant(
          of: find.byKey(const ValueKey('order-issue-missing')),
          matching: find.text('Try again'),
        ),
        findsNothing,
      );
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('orders-history')),
        -400,
      );
      await tester.tap(find.byKey(const ValueKey('orders-history')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('order-issue-denied')), findsOneWidget);
      expect(find.byKey(const ValueKey('preorder-good')), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      controller.dispose();
    },
  );

  testWidgets('capture five-tab orders at iPhone size', (tester) async {
    fixture.phone(tester);
    SharedPreferences.setMockInitialValues({
      'demo-preorders-preview': jsonEncode([order('preview', 'Burrata')]),
    });
    await (FontLoader(
      'Inter',
    )..addFont(rootBundle.load('assets/fonts/Inter.ttf'))).load();
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
    final controller = AppController(
      initialLanguage: 'bg',
      repository: fixture.MenuRepository(),
    );
    await controller.initialize();
    controller.restaurants = [
      fixture.restaurant.copyWith(imageAsset: 'assets/images/casa.webp'),
    ];
    controller.bookings = [
      visit('preview', DateTime.now().add(const Duration(days: 3))),
    ];
    final key = GlobalKey();
    await tester.pumpWidget(
      RepaintBoundary(
        key: key,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: seatMapTheme(),
          home: AppShell(controller: controller),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('navigation-tab-3')));
    await tester.pumpAndSettle();
    Future<void> capture(String name) async {
      await tester.runAsync(() async {
        final boundary =
            key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
        final image = await boundary.toImage(pixelRatio: 2);
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        Directory('.local').createSync(recursive: true);
        File('.local/$name.png').writeAsBytesSync(bytes!.buffer.asUint8List());
        image.dispose();
      });
    }

    await capture('orders-tab');
    tester.platformDispatcher.textScaleFactorTestValue = 1.6;
    await tester.pumpAndSettle();
    await capture('orders-tab-large');
    expect(tester.takeException(), isNull);
    tester.platformDispatcher.clearTextScaleFactorTestValue();
    await tester.pumpWidget(const SizedBox());
    controller.dispose();
  }, skip: !const bool.fromEnvironment('CAPTURE_VISUALS'));
}
