import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:seatmap_mobile/data/seatmap_repository.dart';
import 'package:seatmap_mobile/domain/menu.dart';
import 'package:seatmap_mobile/domain/models.dart';
import 'package:seatmap_mobile/state/app_controller.dart';
import 'package:seatmap_mobile/ui/components.dart';
import 'package:seatmap_mobile/ui/screens/menu_screen.dart';
import 'package:seatmap_mobile/ui/screens/support_screens.dart';
import 'package:seatmap_mobile/ui/theme.dart';

const restaurant = Restaurant(
  id: 'casa-di-fratelli',
  name: 'Casa di Fratelli',
  websiteUrl: 'https://casadifratelli.bg',
);
final booking = Booking(
  id: 'demo',
  restaurantId: restaurant.id,
  restaurantName: restaurant.name,
  restaurantImage: '',
  date: DateTime(2026, 11, 20),
  time: '19:30',
  guests: 2,
  tableIds: ['08'],
  tableLabel: '08',
  guestName: 'Guest',
  phone: '',
);
const dishes = [
  MenuDish(
    id: 1,
    name: 'Burrata',
    priceMinor: 1250,
    category: 'salads',
    description: 'Fresh tomatoes and basil',
    weight: '300 g',
  ),
  MenuDish(
    id: 2,
    name: 'Risotto',
    priceMinor: 1800,
    category: 'mains',
    weight: '350 g',
  ),
  MenuDish(
    id: 3,
    name: 'Lemonade',
    priceMinor: 650,
    category: 'lemonades',
    drink: true,
    weight: '400 ml',
  ),
];

class MenuRepository extends SeatMapRepository {
  MenuRepository({this.enabled = true}) : super(baseUrl: '');
  final bool enabled;
  @override
  Future<List<MenuDish>> loadMenu(Restaurant restaurant) async => dishes;
  @override
  Future<PreorderSettings> preorderSettings(Restaurant restaurant) async =>
      PreorderSettings(enabled: enabled);
}

void phone(WidgetTester tester) {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
    'menu preserves server IDs, cents, departments and active photos',
    () async {
      AppController(initialLanguage: 'en');
      final repo = SeatMapRepository(
        baseUrl: 'https://api.test',
        client: MockClient(
          (r) async => http.Response(
            jsonEncode([
              {
                'id': 9,
                'name': 'Coffee',
                'price': 3.25,
                'department': 'bar',
                'category': 'hot-drinks',
                'imageUrl': '/coffee.jpg',
                'isActive': true,
              },
              {'id': 10, 'name': 'Hidden', 'price': 10, 'isActive': false},
            ]),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          ),
        ),
      );
      final result = await repo.loadMenu(restaurant);
      expect(result, hasLength(1));
      expect(result.single.id, 9);
      expect(result.single.priceMinor, 325);
      expect(result.single.drink, true);
      expect(result.single.image, 'https://casadifratelli.bg/coffee.jpg');
      repo.close();
    },
  );
  testWidgets('search, food and drink cart and explicit unpaid demo draft', (
    tester,
  ) async {
    phone(tester);
    final controller = AppController(
      initialLanguage: 'en',
      repository: MenuRepository(),
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: seatMapTheme(),
        home: MenuScreen(
          controller: controller,
          restaurant: restaurant,
          booking: booking,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Burrata'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'missing');
    await tester.pumpAndSettle();
    expect(find.text('Burrata'), findsNothing);
    await tester.enterText(find.byType(TextField), '');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byTooltip('Add to preorder').first);
    await tester.tap(find.byTooltip('Add to preorder').first);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Drinks'));
    await tester.tap(find.text('Drinks'));
    await tester.pumpAndSettle();
    expect(find.text('Burrata'), findsNothing);
    expect(find.text('Lemonade'), findsOneWidget);
    await tester.ensureVisible(find.byTooltip('Add to preorder'));
    await tester.tap(find.byTooltip('Add to preorder'));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(PrimaryButton));
    await tester.pumpAndSettle();

    expect(find.text('Burrata\n× 1'), findsOneWidget);
    expect(find.text('Lemonade\n× 1'), findsOneWidget);
    expect(
      tester.widget<PrimaryButton>(find.byType(PrimaryButton)).onPressed,
      isNotNull,
    );
    expect(find.byType(CheckboxListTile), findsNothing);
    await tester.tap(find.text('Save unpaid draft'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Demo draft prepared. No order or payment was created.'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(
      find.text('Demo draft prepared. No order or payment was created.'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(SizedBox());
  });
  testWidgets('disabled preorder service keeps menu browse-only', (
    tester,
  ) async {
    phone(tester);
    final controller = AppController(
      initialLanguage: 'en',
      repository: MenuRepository(enabled: false),
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: seatMapTheme(),
        home: MenuScreen(
          controller: controller,
          restaurant: restaurant,
          booking: booking,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byTooltip('Add to preorder'), findsNothing);
    expect(find.byType(PrimaryButton), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'live booking rereads Developer activation and offers preorders without card integration',
    (tester) async {
      phone(tester);
      const cofein = Restaurant(
        id: 'cofein',
        name: 'Cofein',
        imageAsset: 'assets/images/cofein.webp',
      );
      final liveBooking = Booking(
        id: 'cofein:17',
        restaurantId: cofein.id,
        restaurantName: cofein.name,
        restaurantImage: cofein.imageAsset,
        date: DateTime(2026, 11, 20),
        time: '19:30',
        guests: 2,
        tableIds: ['8'],
        tableLabel: '8',
        guestName: 'Synthetic guest',
        phone: '+3595550199',
        demo: false,
        managementToken: List.filled(64, 'a').join(),
      );
      var effectiveEnabled = false;
      final requests = <http.Request>[];
      final repo = SeatMapRepository(
        baseUrl: 'https://api.example.test',
        client: MockClient((request) async {
          requests.add(request);
          return http.Response(
            jsonEncode({
              'enabled': effectiveEnabled,
              'cardPaymentsAvailable': false,
              'fullPrepaymentRequired': true,
              'minLeadMinutes': 30,
              'maxServeOffsetMinutes': 120,
              'serveStepMinutes': 15,
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      );
      addTearDown(repo.close);
      final controller = AppController(initialLanguage: 'en', repository: repo);
      Future<void> openSuccess(String key) async {
        await tester.pumpWidget(
          MaterialApp(
            theme: seatMapTheme(),
            home: BookingSuccessScreen(
              key: ValueKey(key),
              booking: liveBooking,
              controller: controller,
              restaurant: cofein,
            ),
          ),
        );
        await tester.pumpAndSettle();
      }

      await openSuccess('developer-service-disabled');
      expect(controller.demoMode, isFalse);
      expect(find.text('Your table is booked!'), findsOneWidget);
      expect(find.byType(AlertDialog), findsNothing);
      expect(requests, hasLength(1));

      // A subsequent public response represents the Developer activating the
      // service. The same repository must not cache the disabled result or
      // require a separate Owner-consent flag to display the offer.
      effectiveEnabled = true;
      await openSuccess('developer-service-enabled');
      expect(requests, hasLength(2));
      expect(find.byType(AlertDialog), findsOneWidget);
      expect(find.text('Make your evening\neven better'), findsOneWidget);
      expect(find.text('Explore the menu'), findsOneWidget);
      expect(
        find.textContaining('Preorders require full card prepayment.'),
        findsOneWidget,
      );
      await tester.tap(find.text('Maybe later'));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);
      expect(find.text('Your table is booked!'), findsOneWidget);
      expect(liveBooking.status, 'confirmed');
      expect(
        requests.map((request) => '${request.method} ${request.url}'),
        everyElement(
          'GET https://api.example.test/api/v1/restaurants/cofein/preorders/settings',
        ),
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(SizedBox());
    },
  );
  testWidgets('capture menu and cart at iPhone size', (tester) async {
    phone(tester);
    await (FontLoader(
      'Inter',
    )..addFont(rootBundle.load('assets/fonts/Inter.ttf'))).load();
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
    final key = GlobalKey();
    final controller = AppController(
      initialLanguage: 'bg',
      repository: MenuRepository(),
    );
    Future<void> capture(String name) async {
      await tester.runAsync(() async {
        final boundary =
            key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
        final rendered = await boundary.toImage(pixelRatio: 2);
        final bytes = (await rendered.toByteData(
          format: ui.ImageByteFormat.png,
        ))!;
        Directory('.local').createSync(recursive: true);
        File('.local/$name.png').writeAsBytesSync(bytes.buffer.asUint8List());
        rendered.dispose();
      });
    }

    await tester.pumpWidget(
      RepaintBoundary(
        key: key,
        child: MaterialApp(
          theme: seatMapTheme(),
          home: MenuScreen(
            controller: controller,
            restaurant: restaurant,
            booking: booking,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await capture('menu-review');
    await tester.pumpWidget(
      RepaintBoundary(
        key: key,
        child: MaterialApp(
          theme: seatMapTheme(),
          home: PreorderCartScreen(
            controller: controller,
            restaurant: restaurant,
            booking: booking,
            dishes: dishes,
            quantities: const {1: 1, 3: 2},
            policy: const PreorderSettings(enabled: true),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await capture('cart-review');
    tester.platformDispatcher.textScaleFactorTestValue = 1.6;
    await tester.pumpAndSettle();
    await capture('cart-large-review');
    expect(tester.takeException(), isNull);
    tester.platformDispatcher.clearTextScaleFactorTestValue();
    await tester.pumpAndSettle();
    controller.bookings = [booking];
    controller.restaurants = [restaurant];
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'demo-preorders-${booking.id}',
      jsonEncode([
        {
          'id': 'visual-draft',
          'status': 'Draft',
          'notes': 'Паста без бекон. Сосът отделно.',
          'totalMinor': 3050,
          'items': [
            {
              'menuItemId': 1,
              'name': 'Бурата',
              'quantity': 1,
              'unitMinor': 1250,
            },
            {
              'menuItemId': 2,
              'name': 'Ризото',
              'quantity': 1,
              'unitMinor': 1800,
            },
          ],
        },
      ]),
    );
    await tester.pumpWidget(
      RepaintBoundary(
        key: key,
        child: MaterialApp(
          theme: seatMapTheme(),
          home: PreordersScreen(controller: controller),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await capture('preorders-review');

    expect(tester.takeException(), isNull);
  }, skip: !const bool.fromEnvironment('CAPTURE_VISUALS'));
}
