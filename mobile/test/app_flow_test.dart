import 'package:seatmap_mobile/data/seatmap_repository.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:seatmap_mobile/main.dart';
import 'package:seatmap_mobile/state/app_controller.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  testWidgets('discover, choose a seat, submit a demo booking, open bookings', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final controller = AppController(
      initialLanguage: 'ru',
      repository: SeatMapRepository(baseUrl: ''),
    );
    await tester.pumpWidget(SeatMapApp(controller: controller));
    await tester.pumpAndSettle();
    expect(find.text('Где поужинаем?'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('Cosmos').first);
    await tester.pumpAndSettle();
    expect(find.text('Забронировать стол'), findsOneWidget);
    await tester.tap(find.text('Выбрать столик'));
    await tester.pumpAndSettle();
    expect(find.text('Выберите столик'), findsOneWidget);
    expect(find.text('Стол 08'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('Продолжить'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Заполнить тестом'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Заполнить тестом'));
    await tester.pumpAndSettle();
    final consent = find.byType(CheckboxListTile);
    await tester.ensureVisible(consent);
    await tester.pumpAndSettle();
    await tester.tap(consent);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Создать тестовую бронь'));
    await tester.pumpAndSettle();
    expect(controller.bookings, hasLength(1));
    expect(find.text('Ваш тестовый\nстолик забронирован'), findsOneWidget);
    await tester.tap(find.text('К моим броням'));
    await tester.pumpAndSettle();
    expect(find.text('Мои брони'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('profile demo login and search work at a narrow phone size', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 780);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final controller = AppController(
      initialLanguage: 'ru',
      repository: SeatMapRepository(baseUrl: ''),
    );
    await tester.pumpWidget(SeatMapApp(controller: controller));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Профиль').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Войти в SeatMap'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Войти в тестовый аккаунт →'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Войти в тестовый аккаунт →'));
    await tester.pumpAndSettle();
    expect(controller.isLoggedIn, isTrue);
    expect(find.text('ТЕСТОВЫЙ ПРОФИЛЬ'), findsOneWidget);
    await tester.tap(find.text('Поиск').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'Made');
    await tester.pumpAndSettle();
    expect(find.text('Made in Blue'), findsOneWidget);
    expect(find.text('Cosmos'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
