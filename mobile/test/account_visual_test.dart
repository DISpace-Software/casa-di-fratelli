import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:seatmap_mobile/domain/models.dart';
import 'package:seatmap_mobile/state/app_controller.dart';
import 'package:seatmap_mobile/ui/screens/account_screens.dart';
import 'package:seatmap_mobile/ui/screens/support_screens.dart';
import 'package:seatmap_mobile/ui/theme.dart';

void main() {
  testWidgets(
    'capture registration, profile and account security at phone size',
    (tester) async {
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
      final controller = AppController(initialLanguage: 'ru')
        ..profile = const GuestProfile(
          firstName: 'Мария',
          lastName: 'Иванова',
          email: 'maria@example.test',
          phone: '+359888123456',
          city: 'София',
          country: 'България',
        )
        ..isLoggedIn = true;
      Future<void> capture(Widget screen, String file) async {
        final key = GlobalKey();
        await tester.pumpWidget(
          RepaintBoundary(
            key: key,
            child: MaterialApp(
              debugShowCheckedModeBanner: false,
              theme: seatMapTheme(),
              home: screen,
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.runAsync(() async {
          final boundary =
              key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
          final screenshot = await boundary.toImage(pixelRatio: 2);
          final bytes = await screenshot.toByteData(
            format: ui.ImageByteFormat.png,
          );
          await File('docs/screenshots/$file.png')
              .writeAsBytes(bytes!.buffer.asUint8List());
        });
      }

      await capture(RegisterScreen(controller: controller), '04-registration');
      await capture(
        Scaffold(body: ProfileScreen(controller: controller)),
        '05-profile',
      );
      await capture(
        EditGuestProfileScreen(controller: controller),
        '06-edit-profile',
      );
      await capture(
        GuestSecurityScreen(controller: controller),
        '07-account-security',
      );
    },
    skip: !const bool.fromEnvironment('CAPTURE_VISUALS'),
  );
}
