import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:seatmap_mobile/l10n/language.dart';
import 'package:seatmap_mobile/data/seatmap_repository.dart';
import 'package:seatmap_mobile/state/app_controller.dart';
import 'package:seatmap_mobile/main.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
    'Bulgarian country and region override device language; manual choice wins',
    () {
      expect(
        resolveAppLanguage(
          deviceLocales: [const Locale('en', 'US')],
          countryCode: 'BG',
        ),
        'bg',
      );
      expect(
        resolveAppLanguage(deviceLocales: [const Locale('ru', 'BG')]),
        'bg',
      );
      expect(
        resolveAppLanguage(
          deviceLocales: [const Locale('ru', 'BG')],
          saved: 'en',
          countryCode: 'BG',
        ),
        'en',
      );
      expect(
        resolveAppLanguage(deviceLocales: [const Locale('de', 'DE')]),
        'en',
      );
      expect(
        resolveAppLanguage(deviceLocales: [const Locale('ru', 'RU')]),
        'ru',
      );
    },
  );
  test(
    'guest count uses the actual Russian, Bulgarian and English plural rules',
    () {
      expect(
        lookupAppLocalizations(const Locale('ru')).guestCount(21),
        '21 гость',
      );
      expect(
        lookupAppLocalizations(const Locale('bg')).guestCount(1),
        '1 гост',
      );
      expect(
        lookupAppLocalizations(const Locale('en')).guestCount(2),
        '2 guests',
      );
    },
  );
  for (final language in ['bg', 'en']) {
    testWidgets('$language discovery, restaurant and table-map flow', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final controller = AppController(
        initialLanguage: language,
        repository: SeatMapRepository(baseUrl: ''),
      );
      final strings = lookupAppLocalizations(Locale(language));
      await tester.pumpWidget(SeatMapApp(controller: controller));
      await tester.pumpAndSettle();
      expect(find.text(strings.msgWhereShallWeDine), findsOneWidget);
      expect(find.text('Где поужинаем?'), findsNothing);
      await tester.tap(find.text('Cosmos').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text(strings.msgChooseATable));
      await tester.pumpAndSettle();
      expect(find.text(strings.msgChooseYourTable), findsOneWidget);
      expect(find.text(strings.msgContinue), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets('manual app language changes immediately and survives restart', (
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
    await controller.setAppLanguage('bg');
    await tester.pumpAndSettle();
    expect(find.text('Къде ще вечеряме?'), findsOneWidget);
    final restored = AppController(repository: SeatMapRepository(baseUrl: ''));
    await restored.initialize();
    expect(restored.appLanguageCode, 'bg');
  });
}
