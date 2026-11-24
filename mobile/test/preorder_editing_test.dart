import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:seatmap_mobile/data/seatmap_repository.dart';
import 'package:seatmap_mobile/domain/models.dart';
import 'package:seatmap_mobile/state/app_controller.dart';
import 'package:seatmap_mobile/ui/screens/discovery_screens.dart';
import 'package:seatmap_mobile/ui/screens/menu_screen.dart';
import 'package:seatmap_mobile/ui/theme.dart';

import 'menu_preorder_test.dart' as fixture;

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  testWidgets('Casa ninth guest opens contact and cannot be selected', (
    tester,
  ) async {
    final controller = AppController(
      initialLanguage: 'en',
      repository: fixture.MenuRepository(),
    );
    controller.guestCount = 8;
    await tester.pumpWidget(
      MaterialApp(
        theme: seatMapTheme(),
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => chooseGuests(
                context,
                controller,
                restaurant: fixture.restaurant.copyWith(phone: '+359888123456'),
              ),
              child: Text('Guests'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Guests'));
    await tester.pumpAndSettle();
    await tester.tap(find.byIcon(Icons.add_rounded));
    await tester.pumpAndSettle();
    expect(find.text('+359888123456'), findsOneWidget);
    expect(controller.guestCount, 8);
    expect(find.byType(AlertDialog), findsOneWidget);
  });
  test('edit request targets existing preorder and includes private capability and revision', () async {
    final repo = SeatMapRepository(
      baseUrl: 'https://api.test',
      client: MockClient((request) async {
        expect(request.method, 'POST');
        expect(
          request.url.path,
          '/api/v1/restaurants/casa-di-fratelli/reservations/17/preorders/order-id',
        );
        expect(request.headers['X-Reservation-Token'], 'private-token');
        final body = jsonDecode(request.body);
        expect(body['expectedRevision'], 'revision-1');
        expect(body['notes'], 'Pasta: no bacon');
        return http.Response('{"id":"order-id","revision":"revision-2"}', 200);
      }),
    );
    final booking = Booking(
      id: 'casa-di-fratelli:17',
      restaurantId: 'casa-di-fratelli',
      restaurantName: 'Casa',
      restaurantImage: '',
      date: DateTime(2026, 12, 1),
      time: '19:00',
      guests: 2,
      tableIds: ['8'],
      tableLabel: '8',
      guestName: 'Guest',
      phone: '',
      demo: false,
      managementToken: 'private-token',
    );
    final result = await repo.updatePreorderDraft(booking, 'order-id', {
      'expectedRevision': 'revision-1',
      'notes': 'Pasta: no bacon',
    });
    expect(result['id'], 'order-id');
    repo.close();
  });
  testWidgets(
    'saved preorder opens with quantities and notes then updates same draft',
    (tester) async {
      fixture.phone(tester);
      final draft = {
        'id': 'saved-1',
        'status': 'Draft',
        'notes': 'No bacon',
        'totalMinor': 1250,
        'items': [
          {
            'menuItemId': 1,
            'name': 'Burrata',
            'quantity': 1,
            'unitMinor': 1250,
          },
        ],
      };
      SharedPreferences.setMockInitialValues({
        'demo-preorders-${fixture.booking.id}': jsonEncode([draft]),
      });
      final controller = AppController(
        initialLanguage: 'en',
        repository: fixture.MenuRepository(),
      );
      controller.bookings = [fixture.booking];
      controller.restaurants = [fixture.restaurant];
      await tester.pumpWidget(
        MaterialApp(
          theme: seatMapTheme(),
          home: PreordersScreen(controller: controller),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('No bacon'), findsOneWidget);
      await tester.tap(find.text('Edit preorder'));
      await tester.pumpAndSettle();
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -350));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byTooltip('Add to preorder').last);
      await tester.tap(find.byTooltip('Add to preorder').last);
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Your order ·'));
      await tester.pumpAndSettle();
      expect(find.text('Burrata\n× 1'), findsOneWidget);
      final field = find.byType(TextField);
      await tester.ensureVisible(field);
      await tester.enterText(field, 'No bacon; sauce separately');
      await tester.scrollUntilVisible(
        find.byType(CheckboxListTile),
        200,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.tap(find.byType(CheckboxListTile));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save unpaid draft'));
      await tester.pumpAndSettle();
      final prefs = await SharedPreferences.getInstance();
      final saved = jsonDecode(
        prefs.getString('demo-preorders-${fixture.booking.id}')!,
      ) as List;
      expect(saved.length, 1);
      expect(saved.single['items'], hasLength(2));
      expect(saved.single['id'], 'saved-1');
      expect(saved.single['notes'], 'No bacon; sauce separately');
      expect(tester.takeException(), isNull);
    },
  );
}
