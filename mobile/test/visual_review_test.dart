import 'package:seatmap_mobile/l10n/language.dart';
import 'package:seatmap_mobile/data/seatmap_repository.dart';

import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:seatmap_mobile/main.dart';
import 'package:seatmap_mobile/state/app_controller.dart';

// Manual visual QA artifact generation; excluded from ordinary test runs.
void main() {
  const enabled = bool.fromEnvironment('CAPTURE_VISUALS');
  testWidgets('capture the three supplied design frames', (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await (FontLoader(
      'Inter',
    )..addFont(rootBundle.load('assets/fonts/Inter.ttf'))).load();
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
    final key = GlobalKey();
    final controller = AppController(
      initialLanguage: const String.fromEnvironment(
        'CAPTURE_LANGUAGE',
        defaultValue: 'ru',
      ),
      repository: SeatMapRepository(baseUrl: ''),
    )..setSearch(date: DateTime.now());
    await tester.pumpWidget(
      RepaintBoundary(
        key: key,
        child: SeatMapApp(controller: controller, previewChrome: true),
      ),
    );
    await tester.pumpAndSettle();
    await tester.runAsync(() async {
      for (final asset in [
        'assets/images/cosmos.png',
        'assets/images/made_in_blue.png',
        'assets/images/cofein.webp',
        'assets/images/casa.webp',
      ]) {
        await precacheImage(AssetImage(asset), key.currentContext!);
      }
    });
    await tester.pumpAndSettle();
    Future<void> capture(String name) async {
      await tester.runAsync(() async {
        final boundary =
            key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
        final image = await boundary.toImage(pixelRatio: 2);
        final bytes = (await image.toByteData(format: ui.ImageByteFormat.png))!;
        const language = String.fromEnvironment(
          'CAPTURE_LANGUAGE',
          defaultValue: 'ru',
        );
        final suffix = language == 'ru' ? '' : '-$language';
        final file = File('docs/screenshots/$name$suffix.png');
        await file.parent.create(recursive: true);
        await file.writeAsBytes(bytes.buffer.asUint8List());
        image.dispose();
      });
    }

    await capture('01-discovery');
    await tester.tap(find.text('Cosmos').first);
    await tester.pumpAndSettle();
    await capture('02-restaurant');
    await tester.tap(find.text(appStrings.msgChooseATable));
    await tester.pumpAndSettle();
    await capture('03-seat-map');
    expect(tester.takeException(), isNull);
  }, skip: !enabled);
}
