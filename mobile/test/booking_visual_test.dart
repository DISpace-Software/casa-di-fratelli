import 'dart:io';
import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:seatmap_mobile/l10n/language.dart';
import 'package:seatmap_mobile/data/seatmap_repository.dart';
import 'package:seatmap_mobile/domain/models.dart';
import 'package:seatmap_mobile/state/app_controller.dart';
import 'package:seatmap_mobile/ui/screens/support_screens.dart';
import 'package:seatmap_mobile/ui/screens/seat_map_screen.dart';
import 'package:seatmap_mobile/ui/theme.dart';

void main() {
  testWidgets(
    'review cancellation states and Casa live landmarks at phone size',
    (tester) async {
      tester.view.physicalSize = Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await (FontLoader(
        'Inter',
      )..addFont(rootBundle.load('assets/fonts/Inter.ttf'))).load();
      await (FontLoader(
        'MaterialIcons',
      )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
      var now = DateTime.now().toUtc();
      final repository = SeatMapRepository(baseUrl: '', now: () => now);
      final controller = AppController(
        repository: repository,
        initialLanguage: 'bg',
      );
      final day = DateTime.now().add(Duration(days: 2));
      final booking = Booking(
        id: 'cofein:17',
        restaurantId: 'cofein',
        restaurantName: 'Cofein',
        restaurantImage: 'assets/images/cofein.webp',
        date: day,
        time: '19:00',
        guests: 2,
        tableIds: ['3'],
        tableLabel: '3',
        guestName: 'Synthetic guest',
        phone: '+3595550199',
        restaurantPhone: '0893300305',
        demo: false,
        managementToken: 'test-only',
      );
      controller.bookings = [booking];
      final boundaryKey = GlobalKey();
      Future<void> show(Widget page) async {
        await tester.pumpWidget(
          RepaintBoundary(
            key: boundaryKey,
            child: MaterialApp(
              debugShowCheckedModeBanner: false,
              locale: Locale('bg'),
              supportedLocales: AppLocalizations.supportedLocales,
              localizationsDelegates: [
                AppLocalizations.delegate,
                ...GlobalMaterialLocalizations.delegates,
              ],
              theme: seatMapTheme(),
              home: Scaffold(body: SafeArea(child: page)),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      }

      Future<void> capture(String name) async {
        await tester.runAsync(() async {
          final image =
              await (boundaryKey.currentContext!.findRenderObject()!
                      as RenderRepaintBoundary)
                  .toImage(pixelRatio: 2);
          final data = (await image.toByteData(
            format: ui.ImageByteFormat.png,
          ))!;
          final file = File('.local/visual-$name.png');
          await file.parent.create(recursive: true);
          await file.writeAsBytes(data.buffer.asUint8List());
          image.dispose();
        });
      }

      now = repository.bookingStartsAt(booking).subtract(Duration(hours: 4));
      await show(BookingsScreen(controller: controller));
      expect(find.text(appStrings.msgCancel), findsOneWidget);
      await tester.runAsync(
        () => precacheImage(
          AssetImage('assets/images/cofein.webp'),
          tester.element(find.byType(BookingsScreen)),
        ),
      );
      await tester.pumpAndSettle();
      await capture('booking-cancel');
      now = repository.bookingStartsAt(booking).subtract(Duration(hours: 2));
      await tester.pump(Duration(seconds: 31));
      await tester.pumpAndSettle();
      await capture('booking-contact');
      final source = File('.local/casa-map.json');
      if (source.existsSync()) {
        final plan = repository.parseFloorPlan(
          jsonDecode(source.readAsStringSync()) as Map<String, dynamic>,
        );
        final garden = plan.zones.singleWhere((z) => z.id == 'garden');
        final firstGarden = plan.copyWith(
          zones: [garden, ...plan.zones.where((z) => z.id != 'garden')],
        );
        final mapController = AppController(
          repository: _MapRepository(firstGarden),
          initialLanguage: 'bg',
        );
        await show(
          SeatMapScreen(
            controller: mapController,
            restaurant: Restaurant(
              id: 'casa-di-fratelli',
              name: 'Casa di Fratelli',
              floorPlan: firstGarden,
            ),
          ),
        );
        expect(find.text('Телевизор'), findsOneWidget);
        await capture('casa-garden');
      }
      await tester.pumpWidget(SizedBox.shrink());
    },
    skip: !const bool.fromEnvironment('CAPTURE_BOOKING_VISUALS'),
  );
}

class _MapRepository extends SeatMapRepository {
  _MapRepository(this.plan) : super(baseUrl: 'https://example.test');
  final FloorPlan plan;
  @override
  Future<FloorPlan> loadAvailability(
    Restaurant restaurant, {
    required DateTime date,
    required String time,
    required int guests,
  }) async => plan;
}
