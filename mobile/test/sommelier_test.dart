import 'package:flutter/services.dart';

import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:seatmap_mobile/domain/models.dart';
import 'package:seatmap_mobile/state/app_controller.dart';
import 'package:seatmap_mobile/ui/screens/sommelier_screen.dart';
import 'package:seatmap_mobile/ui/theme.dart';

import 'menu_preorder_test.dart' as fixture;

class WineRepository extends fixture.MenuRepository {
  String status = 'ok';
  int? requestedBudget;
  @override
  Future<Map<String, dynamic>> sommelier(
    Restaurant restaurant,
    int dishId, {
    String? serving,
    String? style,
    int? maxPriceMinor,
  }) async {
    requestedBudget = maxPriceMinor;
    final items = [
      {
        'menuItemId': 4,
        'name': 'Restaurant wine',
        'volume': '150 ml',
        'priceMinor': 800,
        'reasons': ['freshness'],
      },
    ];
    return {
      'status': status,
      'recommendations': status == 'ok' ? items : [],
      'menuOptions': status == 'consultation' ? items : [],
    };
  }
}

void main() {
  setUpAll(() async {
    if (const bool.fromEnvironment('CAPTURE_VISUALS')) {
      await (FontLoader(
        'Inter',
      )..addFont(rootBundle.load('assets/fonts/Inter.ttf'))).load();
      await (FontLoader(
        'MaterialIcons',
      )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
    }
  });
  testWidgets('verified pairing, budget and wine selection', (tester) async {
    fixture.phone(tester);
    SharedPreferences.setMockInitialValues({});
    final repository = WineRepository();
    final controller = AppController(
      initialLanguage: 'en',
      repository: repository,
    );
    await controller.initialize();
    await tester.pumpWidget(
      MaterialApp(
        theme: seatMapTheme(),
        home: SommelierScreen(
          controller: controller,
          restaurant: fixture.restaurant,
          dishes: fixture.dishes,
          dish: fixture.dishes.first,
          canOrder: true,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '10,50');
    await tester.ensureVisible(find.text('Find a wine'));
    await tester.tap(find.text('Find a wine'));
    await tester.pumpAndSettle();
    expect(repository.requestedBudget, 1050);
    await tester.scrollUntilVisible(
      find.text('Restaurant wine'),
      250,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Restaurant wine'), findsOneWidget);
    expect(
      find.text('Fresh acidity balances the richness of the dish.'),
      findsOneWidget,
    );
    if (const bool.fromEnvironment('CAPTURE_VISUALS')) {
      await tester.runAsync(() async {
        final boundary = tester.renderObject<RenderRepaintBoundary>(
          find.byType(RepaintBoundary).first,
        );
        final image = await boundary.toImage(pixelRatio: 2);
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        await Directory('.local').create(recursive: true);
        await File('.local/sommelier.png')
            .writeAsBytes(bytes!.buffer.asUint8List());
        image.dispose();
      });
    }
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    controller.dispose();
  });
  testWidgets(
    'generic assortment is not presented as a personal recommendation',
    (tester) async {
      fixture.phone(tester);
      SharedPreferences.setMockInitialValues({});
      final repository = WineRepository()..status = 'consultation';
      final controller = AppController(
        initialLanguage: 'en',
        repository: repository,
      );
      await controller.initialize();
      await tester.pumpWidget(
        MaterialApp(
          theme: seatMapTheme(),
          home: SommelierScreen(
            controller: controller,
            restaurant: fixture.restaurant,
            dishes: fixture.dishes,
            dish: fixture.dishes.first,
            canOrder: true,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Find a wine'));
      await tester.tap(find.text('Find a wine'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.textContaining('This is not a pairing recommendation'),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        find.textContaining('This is not a pairing recommendation'),
        findsOneWidget,
      );
      await tester.scrollUntilVisible(
        find.text('Restaurant wine'),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        find.widgetWithText(FilledButton, 'Add to preorder'),
        findsNothing,
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      controller.dispose();
    },
  );
}
