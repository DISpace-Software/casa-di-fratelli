import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:seatmap_mobile/data/seatmap_repository.dart';
import 'package:seatmap_mobile/domain/menu.dart';
import 'package:seatmap_mobile/domain/models.dart';
import 'package:seatmap_mobile/state/app_controller.dart';
import 'package:seatmap_mobile/ui/screens/menu_screen.dart';
import 'package:seatmap_mobile/ui/theme.dart';

import 'menu_preorder_test.dart' as fixture;

// ignore: depend_on_referenced_packages
import 'package:shared_preferences_platform_interface/shared_preferences_platform_interface.dart';

final liveBooking = Booking(
  id: 'live',
  restaurantId: fixture.restaurant.id,
  restaurantName: 'Casa',
  restaurantImage: '',
  date: DateTime(2030, 1, 1),
  time: '19:00',
  guests: 2,
  tableIds: ['8'],
  tableLabel: '8',
  guestName: 'Guest',
  phone: '',
  demo: false,
  managementToken: 'token',
);

class RetryRepository extends fixture.MenuRepository {
  final bodies = <Map<String, dynamic>>[];
  @override
  Future<Map<String, dynamic>> savePreorderDraft(
    Booking booking,
    Map<String, dynamic> body,
  ) async {
    bodies.add(jsonDecode(jsonEncode(body)) as Map<String, dynamic>);
    if (bodies.length == 1) {
      throw const SeatMapException('Connection lost', uncertain: true);
    }
    return {
      ...body,
      'id': 'same-draft',
      'revision': 'revision-2',
      'status': 'Draft',
      'items': [
        {
          'menuItemId': 1,
          'quantity': 1,
          'notes': 'Latest kitchen note',
          'name': 'Burrata',
          'unitMinor': 1250,
        },
      ],
      'notes': 'Latest saved notes',
    };
  }
}

class FailAfterSaveStore extends InMemorySharedPreferencesStore {
  FailAfterSaveStore() : super.empty();
  int writes = 0;
  @override
  Future<bool> setValue(String type, String key, Object value) async {
    if (key.contains('preorder-cart-') && ++writes == 2) return false;
    return super.setValue(type, key, value);
  }
}

class SaveRepository extends fixture.MenuRepository {
  String? createKey;
  String? updateKey;
  @override
  Future<Map<String, dynamic>> savePreorderDraft(
    Booking booking,
    Map<String, dynamic> body,
  ) async {
    createKey = body['idempotencyKey'] as String;
    return {...body, 'id': 'saved-id', 'revision': 'one', 'status': 'Draft'};
  }

  @override
  Future<Map<String, dynamic>> updatePreorderDraft(
    Booking booking,
    String id,
    Map<String, dynamic> body,
  ) async {
    expect(id, 'saved-id');
    updateKey = body['idempotencyKey'] as String;
    return {...body, 'id': id, 'revision': 'two', 'status': 'Draft'};
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  testWidgets(
    'local write failure after server success retains saved draft and next edit updates with fresh key',
    (tester) async {
      fixture.phone(tester);
      final original = SharedPreferencesStorePlatform.instance;
      addTearDown(() => SharedPreferencesStorePlatform.instance = original);
      final repo = SaveRepository();
      final controller = AppController(initialLanguage: 'en', repository: repo);
      await tester.pumpWidget(
        MaterialApp(
          theme: seatMapTheme(),
          home: PreorderCartScreen(
            controller: controller,
            restaurant: fixture.restaurant,
            booking: liveBooking,
            dishes: fixture.dishes,
            quantities: const {1: 1},
            policy: const PreorderSettings(enabled: true),
          ),
        ),
      );
      await tester.pumpAndSettle();
      SharedPreferencesStorePlatform.instance = FailAfterSaveStore();
      await tester.tap(find.text('Save unpaid draft'));
      await tester.pumpAndSettle();
      expect(find.text('Done'), findsOneWidget);
      await tester.enterText(
        find.byKey(const ValueKey('dish-note-1-0')),
        'No bacon',
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save unpaid draft'));
      await tester.pumpAndSettle();
      expect(repo.updateKey, isNotNull);
      expect(repo.updateKey, isNot(repo.createKey));
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'uncertain save survives restart and replays exact request then uses canonical response',
    (tester) async {
      fixture.phone(tester);
      final repo = RetryRepository();
      final controller = AppController(initialLanguage: 'en', repository: repo);
      Widget app() => MaterialApp(
        theme: seatMapTheme(),
        home: PreorderCartScreen(
          controller: controller,
          restaurant: fixture.restaurant,
          booking: liveBooking,
          dishes: fixture.dishes,
          quantities: const {1: 1},
          policy: const PreorderSettings(enabled: true),
        ),
      );
      await tester.pumpWidget(app());
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save unpaid draft'));
      await tester.pumpAndSettle();
      expect(repo.bodies, hasLength(1));
      expect(find.text('Retry saving'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
      await tester.pumpWidget(app());
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<TextFormField>(find.byKey(const ValueKey('dish-note-1')))
            .enabled,
        isFalse,
      );
      await tester.tap(find.text('Retry saving'));
      await tester.pumpAndSettle();
      expect(repo.bodies, hasLength(2));
      expect(repo.bodies[1], repo.bodies[0]);
      final prefs = await SharedPreferences.getInstance();
      final data = jsonDecode(
        prefs.getString('preorder-cart-casa-di-fratelli-live-new')!,
      ) as Map;
      expect(data['pending'], isNull);
      expect(data['draft']['id'], 'same-draft');
      expect(data['notes'], 'Latest saved notes');
      expect(data['portionNotes']['1'], ['Latest kitchen note']);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('separate portion notes persist and save as distinct lines', (
    tester,
  ) async {
    fixture.phone(tester);
    final controller = AppController(
      initialLanguage: 'en',
      repository: fixture.MenuRepository(),
    );
    Widget app() => MaterialApp(
      theme: seatMapTheme(),
      home: PreorderCartScreen(
        controller: controller,
        restaurant: fixture.restaurant,
        booking: fixture.booking,
        dishes: fixture.dishes,
        quantities: const {1: 2},
        policy: const PreorderSettings(enabled: true),
      ),
    );
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    await tester.ensureVisible(
      find.text('Different instructions for each portion'),
    );
    await tester.tap(find.text('Different instructions for each portion'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('dish-note-1-0')),
      'No bacon',
    );
    await tester.ensureVisible(find.byKey(const ValueKey('dish-note-1-1')));
    await tester.enterText(
      find.byKey(const ValueKey('dish-note-1-1')),
      'Sauce separately',
    );
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox());
    await tester.pumpAndSettle();
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    expect(find.text('No bacon'), findsOneWidget);
    await tester.tap(find.text('Save unpaid draft'));
    await tester.pumpAndSettle();
    final prefs = await SharedPreferences.getInstance();
    final drafts = jsonDecode(
      prefs.getString('demo-preorders-${fixture.booking.id}')!,
    ) as List;
    expect(drafts, hasLength(1));
    expect(drafts.single['items'], hasLength(2));
    expect((drafts.single['items'] as List).map((e) => e['notes']), [
      'No bacon',
      'Sauce separately',
    ]);
    expect(tester.takeException(), isNull);
  });
}
