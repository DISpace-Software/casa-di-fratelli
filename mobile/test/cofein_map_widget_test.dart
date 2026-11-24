import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:seatmap_mobile/data/seatmap_repository.dart';
import 'package:seatmap_mobile/domain/models.dart';
import 'package:seatmap_mobile/l10n/language.dart';
import 'package:seatmap_mobile/state/app_controller.dart';
import 'package:seatmap_mobile/ui/components.dart';
import 'package:seatmap_mobile/ui/maps/cofein_seat_map.dart';
import 'package:seatmap_mobile/ui/screens/seat_map_screen.dart';
import 'package:seatmap_mobile/ui/theme.dart';

const _plan = FloorPlan(
  zones: [
    Zone(id: 'interior', name: 'Interior'),
    Zone(id: 'exterior', name: 'Exterior'),
    Zone(id: 'rooftop', name: 'Roof garden'),
  ],
  tables: [
    SeatTable(
      id: 'T19',
      zoneId: 'interior',
      label: 'T19',
      x: 60,
      y: 20,
      capacity: 4,
    ),
    SeatTable(
      id: 'T20',
      zoneId: 'interior',
      label: 'T20',
      x: 60,
      y: 35,
      capacity: 4,
    ),
    SeatTable(
      id: 'T23',
      zoneId: 'interior',
      label: 'T23',
      x: 65,
      y: 80,
      capacity: 6,
    ),
    SeatTable(
      id: 'T01',
      zoneId: 'exterior',
      label: 'T01',
      x: 20,
      y: 15,
      capacity: 4,
    ),
    SeatTable(
      id: 'T11',
      zoneId: 'exterior',
      label: 'T11',
      x: 25,
      y: 85,
      capacity: 4,
    ),
    SeatTable(
      id: 'R01',
      zoneId: 'rooftop',
      label: 'R01',
      x: 50,
      y: 50,
      capacity: 2,
    ),
  ],
  publicMaxGuests: 8,
  publicMaxTables: 2,
  combinations: [
    ['T19', 'T20'],
  ],
);

Widget _app(Widget child, {String language = 'en'}) => MaterialApp(
  debugShowCheckedModeBanner: false,
  locale: Locale(language),
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: [
    AppLocalizations.delegate,
    ...GlobalMaterialLocalizations.delegates,
  ],
  theme: seatMapTheme(),
  home: Scaffold(
    body: SafeArea(
      child: SingleChildScrollView(
        child: Padding(padding: const EdgeInsets.all(20), child: child),
      ),
    ),
  ),
);

void _phone(WidgetTester tester, [Size size = const Size(390, 844)]) {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Finder _table(String id) => find.byKey(ValueKey('cofein-table-$id'));
Finder _view(String id) => find.byKey(ValueKey('cofein-view-$id'));

void main() {
  testWidgets(
    'Casa map shows six-seat tables for six guests and restores smaller tables for two',
    (tester) async {
      _phone(tester);
      final repository = _MapRepository(_plan);
      final controller = AppController(
        repository: repository,
        initialLanguage: 'en',
      );
      controller.setSearch(guests: 6);
      await tester.pumpWidget(
        MaterialApp(
          theme: seatMapTheme(),
          home: SeatMapScreen(
            controller: controller,
            restaurant: const Restaurant(
              id: 'casa-di-fratelli',
              name: 'Casa di Fratelli',
              floorPlan: _plan,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('T19'), findsNothing);
      expect(find.text('T20'), findsNothing);
      expect(find.text('T23'), findsOneWidget);
      controller.setSearch(guests: 2);
      await tester.pump(const Duration(seconds: 3));
      await tester.pumpAndSettle();
      expect(find.text('T19'), findsOneWidget);
      expect(find.text('T20'), findsOneWidget);
      expect(find.text('T23'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      repository.close();
    },
  );

  testWidgets(
    'six guests hide smaller tables even when a combination is configured',
    (tester) async {
      _phone(tester);
      const plan = FloorPlan(
        zones: [Zone(id: 'interior', name: 'Interior')],
        tables: [
          SeatTable(
            id: 'A',
            zoneId: 'interior',
            label: 'A',
            x: 15,
            y: 20,
            capacity: 2,
          ),
          SeatTable(
            id: 'B',
            zoneId: 'interior',
            label: 'B',
            x: 40,
            y: 20,
            capacity: 4,
          ),
          SeatTable(
            id: 'C',
            zoneId: 'interior',
            label: 'C',
            x: 65,
            y: 20,
            capacity: 6,
          ),
          SeatTable(
            id: 'D',
            zoneId: 'interior',
            label: 'D',
            x: 90,
            y: 20,
            capacity: 8,
          ),
        ],
        publicMaxGuests: 8,
        publicMaxTables: 3,
        combinations: [
          ['A', 'B', 'C'],
        ],
      );
      final repository = _MapRepository(plan);
      final controller = AppController(
        repository: repository,
        initialLanguage: 'en',
      );
      controller.setSearch(guests: 6);
      await tester.pumpWidget(
        MaterialApp(
          theme: seatMapTheme(),
          home: SeatMapScreen(
            controller: controller,
            restaurant: const Restaurant(
              id: 'cofein',
              name: 'Cofein',
              floorPlan: plan,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      Future<void> select(String id) async {
        await tester.ensureVisible(_table(id));
        await tester.tap(_table(id));
        await tester.pumpAndSettle();
      }

      expect(_table('A'), findsNothing);
      expect(_table('B'), findsNothing);
      expect(_table('C'), findsOneWidget);
      expect(_table('D'), findsOneWidget);
      await select('C');
      expect(find.text('Table C'), findsOneWidget);
      expect(
        tester.widget<PrimaryButton>(find.byType(PrimaryButton)).onPressed,
        isNotNull,
      );
      controller.setSearch(guests: 8);
      await tester.pump(const Duration(seconds: 3));
      await tester.pumpAndSettle();
      expect(_table('C'), findsNothing);
      expect(_table('D'), findsOneWidget);
      expect(find.text('Table C'), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      repository.close();
    },
  );

  testWidgets(
    'Cofein screen polling removes a busy selection and a closed hall',
    (tester) async {
      _phone(tester);
      final repository = _MapRepository(_plan);
      final controller = AppController(
        repository: repository,
        initialLanguage: 'en',
      );
      await tester.pumpWidget(
        MaterialApp(
          theme: seatMapTheme(),
          home: SeatMapScreen(
            controller: controller,
            restaurant: const Restaurant(
              id: 'cofein',
              name: 'Cofein',
              floorPlan: _plan,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(CofeinSeatMap), findsOneWidget);
      await tester.ensureVisible(_table('T19'));
      await tester.tap(_table('T19'));
      await tester.pump();
      expect(find.text('Table T19'), findsOneWidget);
      repository.plan = _plan.copyWith(
        tables: [
          for (final table in _plan.tables)
            table.id == 'T19' ? table.copyWith(occupied: true) : table,
        ],
      );
      await tester.pump(const Duration(seconds: 3));
      await tester.pumpAndSettle();
      expect(_table('T19'), findsNothing);
      expect(find.text('Table T19'), findsNothing);
      repository.plan = repository.plan.copyWith(
        zones: [
          const Zone(id: 'interior', name: 'Interior', active: false),
          ..._plan.zones.where((zone) => zone.id != 'interior'),
        ],
      );
      await tester.pump(const Duration(seconds: 3));
      await tester.pumpAndSettle();
      expect(find.text('Interior'), findsNothing);
      expect(
        tester.widget<CofeinSeatMap>(find.byType(CofeinSeatMap)).zoneId,
        'exterior',
      );
      expect(_table('T01'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      repository.close();
    },
  );

  testWidgets(
    'Cofein hall fragments preserve the real table IDs and selection semantics',
    (tester) async {
      _phone(tester);
      final tapped = <String>[];
      await tester.pumpWidget(
        _app(
          CofeinSeatMap(
            plan: _plan,
            zoneId: 'interior',
            selected: const {'T19'},
            onTap: (table) => tapped.add(table.id),
            language: 'en',
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(_table('T19'), findsOneWidget);
      expect(_table('T23'), findsNothing);
      expect(_table('T01'), findsNothing);
      expect(_view('interior-main'), findsOneWidget);
      expect(_view('interior-angled'), findsOneWidget);
      final semantics = tester.ensureSemantics();
      expect(
        tester.getSemantics(_table('T19')).flagsCollection.isSelected,
        ui.Tristate.isTrue,
      );
      await tester.tap(_table('T19'));
      expect(tapped, ['T19']);
      await tester.tap(_view('interior-angled'));
      await tester.pumpAndSettle();
      expect(_table('T23'), findsOneWidget);
      expect(_table('T19'), findsNothing);
      await tester.tap(_table('T23'));
      expect(tapped, ['T19', 'T23']);
      semantics.dispose();
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'availability refresh hides occupied furniture without resetting the camera',
    (tester) async {
      _phone(tester);
      var current = _plan;
      late StateSetter redraw;
      await tester.pumpWidget(
        _app(
          StatefulBuilder(
            builder: (context, setState) {
              redraw = setState;
              return CofeinSeatMap(
                plan: current,
                zoneId: 'interior',
                selected: const {},
                onTap: (_) {},
                language: 'en',
              );
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('cofein-zoom-in')));
      await tester.pumpAndSettle();
      final viewer = tester.widget<InteractiveViewer>(
        find.byType(InteractiveViewer),
      );
      final camera = List<double>.from(
        viewer.transformationController!.value.storage,
      );
      redraw(
        () => current = current.copyWith(
          tables: [
            for (final table in current.tables)
              table.id == 'T19' ? table.copyWith(occupied: true) : table,
          ],
        ),
      );
      await tester.pumpAndSettle();
      expect(_table('T19'), findsNothing);
      expect(_table('T20'), findsOneWidget);
      final refreshed = tester.widget<InteractiveViewer>(
        find.byType(InteractiveViewer),
      );
      expect(
        refreshed.transformationController!.value.storage,
        orderedEquals(camera),
      );
      redraw(
        () => current = current.copyWith(
          tables: [
            for (final table in current.tables) table.copyWith(occupied: false),
          ],
        ),
      );
      await tester.pumpAndSettle();
      expect(_table('T19'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('saved moves, new tables and removals update the native map', (
    tester,
  ) async {
    _phone(tester);
    var current = _plan;
    late StateSetter redraw;
    await tester.pumpWidget(
      _app(
        StatefulBuilder(
          builder: (context, setState) {
            redraw = setState;
            return CofeinSeatMap(
              plan: current,
              zoneId: 'interior',
              selected: const {},
              onTap: (_) {},
              language: 'en',
            );
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    final before = tester.getCenter(_table('T19'));
    redraw(
      () => current = current.copyWith(
        tables: [
          for (final table in current.tables)
            if (table.id == 'T19')
              const SeatTable(
                id: 'T19',
                zoneId: 'interior',
                label: 'T19',
                x: 80,
                y: 20,
                capacity: 4,
              )
            else if (table.id != 'T20')
              table,
          const SeatTable(
            id: 'NEW',
            zoneId: 'interior',
            label: 'NEW',
            x: 30,
            y: 30,
            capacity: 2,
          ),
        ],
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.getCenter(_table('T19')), isNot(before));
    expect(_table('T20'), findsNothing);
    expect(_table('NEW'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('additional API halls render without preset IDs', (tester) async {
    _phone(tester);
    String? tapped;
    await tester.pumpWidget(
      _app(
        CofeinSeatMap(
          plan: _plan,
          zoneId: 'rooftop',
          selected: const {},
          onTap: (table) => tapped = table.id,
          language: 'en',
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(_table('R01'), findsOneWidget);
    expect(_table('T19'), findsNothing);
    await tester.tap(_table('R01'));
    expect(tapped, 'R01');
    expect(tester.takeException(), isNull);
  });

  testWidgets('a fully occupied part still allows switching to another part', (
    tester,
  ) async {
    _phone(tester);
    final busyPart = _plan.copyWith(
      tables: [
        for (final table in _plan.tables)
          ['T19', 'T20'].contains(table.id)
              ? table.copyWith(occupied: true)
              : table,
      ],
    );
    await tester.pumpWidget(
      _app(
        CofeinSeatMap(
          plan: busyPart,
          zoneId: 'interior',
          selected: const {},
          onTap: (_) {},
          language: 'en',
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(_table('T19'), findsNothing);
    expect(_table('T20'), findsNothing);
    expect(_view('interior-angled'), findsOneWidget);
    await tester.tap(_view('interior-angled'));
    await tester.pumpAndSettle();
    expect(_table('T23'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  for (final language in ['bg', 'en', 'ru']) {
    for (final width in [320.0, 390.0, 430.0]) {
      testWidgets('$language Cofein map fits a ${width.toInt()} pt phone', (
        tester,
      ) async {
        _phone(tester, Size(width, 844));
        await tester.pumpWidget(
          _app(
            CofeinSeatMap(
              plan: _plan,
              zoneId: 'exterior',
              selected: const {},
              onTap: (_) {},
              language: language,
            ),
            language: language,
          ),
        );
        await tester.pumpAndSettle();
        expect(_table('T01'), findsOneWidget);
        final viewport = tester.getRect(
          find.byKey(const ValueKey('cofein-map-viewport')),
        );
        expect(viewport.left, greaterThanOrEqualTo(0));
        expect(viewport.right, lessThanOrEqualTo(width));
        expect(tester.takeException(), isNull);
        await tester.tap(_view('exterior-lower'));
        await tester.pumpAndSettle();
        expect(_table('T11'), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('capture the live Cofein architecture at phone size', (
    tester,
  ) async {
    _phone(tester);
    await (FontLoader(
      'Inter',
    )..addFont(rootBundle.load('assets/fonts/Inter.ttf'))).load();
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
    AppLanguage.code = 'bg';
    final repository = SeatMapRepository(baseUrl: '')..languageCode = 'bg';
    final plan = repository.parseFloorPlan(
      jsonDecode(File('.local/cofein-map.json').readAsStringSync())
          as Map<String, dynamic>,
    );
    final boundary = GlobalKey();
    Future<void> capture(String zoneId, String? viewId) async {
      await tester.pumpWidget(
        RepaintBoundary(
          key: boundary,
          child: _app(
            CofeinSeatMap(
              key: ValueKey(zoneId),
              plan: plan,
              zoneId: zoneId,
              selected: const {'T19'},
              onTap: (_) {},
              language: 'bg',
            ),
            language: 'bg',
          ),
        ),
      );
      await tester.pumpAndSettle();
      if (viewId != null) {
        await tester.tap(_view(viewId));
        await tester.pumpAndSettle();
      }
      expect(tester.takeException(), isNull);
      await tester.runAsync(() async {
        final image =
            await (boundary.currentContext!.findRenderObject()!
                    as RenderRepaintBoundary)
                .toImage(pixelRatio: 2);
        final png = await image.toByteData(format: ui.ImageByteFormat.png);
        final output = File('.local/visual-cofein-${viewId ?? zoneId}.png');
        await output.writeAsBytes(png!.buffer.asUint8List());
        image.dispose();
      });
    }

    await capture('interior', null);
    await capture('interior', 'interior-angled');
    await capture('exterior', null);
    await capture('exterior', 'exterior-lower');
    final controller = AppController(
      repository: _MapRepository(plan),
      initialLanguage: 'bg',
    );
    await tester.pumpWidget(
      RepaintBoundary(
        key: boundary,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          locale: const Locale('bg'),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: [
            AppLocalizations.delegate,
            ...GlobalMaterialLocalizations.delegates,
          ],
          theme: seatMapTheme(),
          home: SeatMapScreen(
            controller: controller,
            restaurant: Restaurant(
              id: 'cofein',
              name: 'Cofein',
              floorPlan: plan,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.runAsync(() async {
      final image =
          await (boundary.currentContext!.findRenderObject()!
                  as RenderRepaintBoundary)
              .toImage(pixelRatio: 2);
      final png = await image.toByteData(format: ui.ImageByteFormat.png);
      await File('.local/visual-cofein-screen.png')
          .writeAsBytes(png!.buffer.asUint8List());
      image.dispose();
    });
    await tester.tap(_table('T19'));
    await tester.pumpAndSettle();
    expect(find.text('Маса T19'), findsOneWidget);
    await tester.runAsync(() async {
      final image =
          await (boundary.currentContext!.findRenderObject()!
                  as RenderRepaintBoundary)
              .toImage(pixelRatio: 2);
      final png = await image.toByteData(format: ui.ImageByteFormat.png);
      await File('.local/visual-cofein-screen-selected.png')
          .writeAsBytes(png!.buffer.asUint8List());
      image.dispose();
    });
    await tester.pumpWidget(const SizedBox());
  }, skip: !const bool.fromEnvironment('CAPTURE_COFEIN_VISUALS'));
}

class _MapRepository extends SeatMapRepository {
  _MapRepository(this.plan) : super(baseUrl: 'https://example.test');
  FloorPlan plan;
  @override
  Future<FloorPlan> loadAvailability(
    Restaurant restaurant, {
    required DateTime date,
    required String time,
    required int guests,
  }) async => plan;
}
