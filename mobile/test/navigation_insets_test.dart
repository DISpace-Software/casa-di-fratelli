import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:seatmap_mobile/data/seatmap_repository.dart';
import 'package:seatmap_mobile/main.dart';
import 'package:seatmap_mobile/state/app_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('native tabs stay visible and usable above system navigation', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPadding);
    addTearDown(tester.view.resetViewPadding);
    final controller = AppController(
      initialLanguage: 'en',
      repository: SeatMapRepository(baseUrl: ''),
    );
    await tester.pumpWidget(
      SeatMapApp(controller: controller, previewChrome: false),
    );
    await tester.pumpAndSettle();

    // Three-button Android navigation, iOS home indicator, and no system bar.
    for (final inset in [48.0, 34.0, 0.0]) {
      tester.view.padding = FakeViewPadding(bottom: inset);
      tester.view.viewPadding = FakeViewPadding(bottom: inset);
      await tester.pumpAndSettle();
      final safeBottom = 844 - inset;
      final navigation = find.byKey(const ValueKey('app-bottom-navigation'));
      for (var index = 0; index < 4; index++) {
        final tab = find.byKey(ValueKey('navigation-tab-$index'));
        final label = find.descendant(of: tab, matching: find.byType(Text));
        expect(label, findsOneWidget);
        expect(tester.getRect(label).bottom, lessThanOrEqualTo(safeBottom));
        expect(tester.getRect(tab).bottom, lessThanOrEqualTo(safeBottom));
        expect(tester.getRect(tab).height, greaterThanOrEqualTo(48));
        await tester.tap(tab);
        await tester.pumpAndSettle();
        expect(tester.widget<Semantics>(tab).properties.selected, isTrue);
      }
      expect(tester.getRect(navigation).bottom, 844);
      expect(tester.takeException(), isNull);
    }

    final overlays = tester.widgetList<AnnotatedRegion<SystemUiOverlayStyle>>(
      find.byType(AnnotatedRegion<SystemUiOverlayStyle>),
    );
    expect(overlays, isNotEmpty);
    expect(
      overlays.any(
        (overlay) =>
            overlay.value.systemNavigationBarIconBrightness ==
                Brightness.light &&
            overlay.value.systemNavigationBarContrastEnforced == false,
      ),
      isTrue,
    );
    await tester.pumpWidget(const SizedBox.shrink());
    controller.dispose();
  });
}
