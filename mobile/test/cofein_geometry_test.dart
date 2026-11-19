import 'dart:convert';
import 'dart:io';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:seatmap_mobile/domain/cofein_geometry.dart';
import 'package:seatmap_mobile/domain/models.dart';

SeatTable table(
  String id,
  String zoneId,
  double x,
  double y, {
  bool wide = false,
  bool occupied = false,
}) => SeatTable(
  id: id,
  zoneId: zoneId,
  label: id,
  x: x,
  y: y,
  wide: wide,
  occupied: occupied,
);

void nearPoint(Offset actual, Offset expected) {
  expect(actual.dx, closeTo(expected.dx, .05));
  expect(actual.dy, closeTo(expected.dy, .05));
}

void main() {
  const zones = [
    Zone(id: 'interior', name: 'Интериор'),
    Zone(id: 'exterior', name: 'Екстериор'),
  ];
  final fixture = jsonDecode(
    File('../docs/cofein-floor-plan.initial.json').readAsStringSync(),
  ) as Map<String, dynamic>;
  final originalTables = (fixture['tables'] as List).map((value) {
    final item = value as Map<String, dynamic>;
    return SeatTable(
      id: item['id'] as String,
      label: item['id'] as String,
      zoneId: item['area'] as String,
      x: (item['x'] as num).toDouble(),
      y: (item['y'] as num).toDouble(),
      capacity: item['seats'] as int,
      wide: item['wide'] as bool,
    );
  }).toList();

  test(
    'the original 30-table fixture uses the approved photographed layout',
    () {
      final geometry = getCofeinMapGeometry(zones, originalTables);
      expect(originalTables, hasLength(30));
      expect(geometry.world, cofeinMapWorld);
      final positions = {
        'T01': const Offset(135, 425),
        'T12': const Offset(135, 1495),
        'T19': const Offset(410, 434),
        'T24': const Offset(707.5, 997.5),
        'T25': const Offset(357.5, 1217.5),
        'F03': const Offset(610, 1130),
      };
      for (final item in originalTables) {
        final placement = projectCofeinTable(item, geometry)!;
        if (positions.containsKey(item.id)) {
          nearPoint(placement.center, positions[item.id]!);
        }
        nearPoint(
          unprojectCofeinPoint(item.zoneId, placement.center, geometry)!,
          Offset(item.x, item.y),
        );
        expect((Offset.zero & geometry.world).contains(placement.center), true);
      }
      final views = zones
          .expand(
            (zone) => getCofeinBookingViews(geometry, zone.id, originalTables),
          )
          .toList();
      expect(views, hasLength(4));
      // Captured from the current JS geometry using this same API fixture.
      final webCrops = {
        'interior-main': const Rect.fromLTWH(260, 329, 300, 555.9893333333333),
        'interior-angled': const Rect.fromLTWH(
          337.99722222222226,
          782.984,
          481.50277777777774,
          459.016,
        ),
        'exterior-upper': const Rect.fromLTWH(
          39,
          329.0355555555555,
          382.7222222222222,
          781.01,
        ),
        'exterior-lower': const Rect.fromLTWH(
          39,
          1030.017777777778,
          513,
          559.9822222222222,
        ),
      };
      expect(
        views.expand((view) => view.tableIds).toSet(),
        originalTables.map((item) => item.id).toSet(),
      );
      for (final view in views) {
        nearPoint(view.bounds.topLeft, webCrops[view.id]!.topLeft);
        nearPoint(view.bounds.bottomRight, webCrops[view.id]!.bottomRight);
        for (final id in view.tableIds) {
          final placement = projectCofeinTable(
            originalTables.singleWhere((table) => table.id == id),
            geometry,
          )!;
          expect(view.bounds.contains(placement.bounds.topLeft), true);
          expect(view.bounds.contains(placement.bounds.bottomRight), true);
        }
      }
    },
  );

  test(
    'furniture matches paired chairs, booths, angled seating and the open end',
    () {
      CofeinTablePlacement place(String id, {bool wide = false}) =>
          projectCofeinTable(table(id, 'interior', 50, 50, wide: wide))!;
      expect(place('T01').kind, 'paired');
      expect(place('T13').kind, 'square');
      expect(place('T19').kind, 'booth');
      expect(place('T19').size, const Size(78, 98));
      expect(place('T24').kind, 'u-booth');
      expect(place('T24').rotationDegrees, 45);
      expect(place('F01').rotationDegrees, 45);
      expect(place('F04').compact, true);
      expect(place('F04').size, const Size(48, 48));
      expect(place('T18').openEnd, true);
      expect(place('NEW', wide: true).kind, 'booth');
      expect(place('T015').kind, 'square');
      expect(place('t24').rotationDegrees, 45);
    },
  );

  test(
    'API moves, additions and removals update furniture and crop membership',
    () {
      final old = table('T01', 'exterior', 5, 5);
      final moved = table('T01', 'exterior', 20, 90);
      final added = table('NEW', 'interior', 90, 20, wide: true);
      final before = getCofeinMapGeometry(zones, [old]);
      final after = getCofeinMapGeometry(zones, [moved, added]);
      final oldPlacement = projectCofeinTable(old, before)!;
      final movedPlacement = projectCofeinTable(moved, after)!;
      expect(movedPlacement.x, greaterThan(oldPlacement.x));
      expect(movedPlacement.fragmentId, 'exterior-lower');
      nearPoint(
        unprojectCofeinPoint('exterior', movedPlacement.center, after)!,
        const Offset(20, 90),
      );
      expect(
        getCofeinBookingViews(before, 'exterior', [old]).single.id,
        'exterior-upper',
      );
      expect(
        getCofeinBookingViews(after, 'exterior', [moved, added]).single.id,
        'exterior-lower',
      );
      expect(
        getCofeinBookingViews(after, 'interior', [
          moved,
          added,
        ]).single.tableIds,
        ['NEW'],
      );
      expect(getCofeinBookingViews(after, 'exterior', [added]), isEmpty);
    },
  );

  test('availability never changes camera crops or placement geometry', () {
    final occupied = originalTables
        .map((table) => table.copyWith(occupied: true))
        .toList();
    final availableGeometry = getCofeinMapGeometry(zones, originalTables);
    final occupiedGeometry = getCofeinMapGeometry(zones, occupied);
    for (final zone in zones) {
      final availableViews = getCofeinBookingViews(
        availableGeometry,
        zone.id,
        originalTables,
      );
      final occupiedViews = getCofeinBookingViews(
        occupiedGeometry,
        zone.id,
        occupied,
      );
      expect(
        occupiedViews.map((view) => view.bounds),
        availableViews.map((view) => view.bounds),
      );
      expect(
        occupiedViews.map((view) => view.tableIds),
        availableViews.map((view) => view.tableIds),
      );
    }
  });

  test('new halls have stable world positions when another hall is closed', () {
    const beforeZones = [
      ...zones,
      Zone(id: 'roof', name: 'Roof'),
      Zone(id: 'garden', name: 'Garden'),
    ];
    const afterZones = [
      Zone(id: 'interior', name: 'Интериор', active: false),
      Zone(id: 'exterior', name: 'Екстериор'),
      Zone(id: 'roof', name: 'Roof', active: false),
      Zone(id: 'garden', name: 'Garden'),
    ];
    final before = getCofeinMapGeometry(beforeZones);
    final after = getCofeinMapGeometry(afterZones);
    final roof = table('R1', 'roof', 50, 50);
    final garden = table('G1', 'garden', 20, 80);
    expect(projectCofeinTable(roof, after), isNull);
    expect(after.views.containsKey('zone:roof'), false);
    expect(after.views.containsKey('interior-main'), false);
    expect(
      projectCofeinTable(garden, before)!.center,
      projectCofeinTable(garden, after)!.center,
    );
    expect(getCofeinBookingViews(after, 'interior', originalTables), isEmpty);
    expect(
      projectCofeinTable(originalTables.first, before)!.center,
      projectCofeinTable(originalTables.first)!.center,
    );
  });

  test(
    'sparse dynamic halls use readable crops and reserved names do not collide',
    () {
      const zones = [
        Zone(id: 'interior', name: 'Inside'),
        Zone(id: 'interior-main', name: 'New hall'),
        Zone(id: 'constructor', name: 'Custom hall'),
      ];
      final tables = [
        table('NEW', 'interior-main', 50, 50),
        table('T24', 'constructor', 95, 95),
      ];
      final geometry = getCofeinMapGeometry(zones, tables);
      expect(geometry.views['interior-main']!.zoneId, 'interior');
      expect(geometry.views['zone:interior-main']!.zoneId, 'interior-main');
      expect(
        geometry.views['zone:interior-main']!.bounds.size,
        const Size(360, 400),
      );
      expect(projectCofeinTable(tables.last, geometry)!.rotationDegrees, 0);
      final view = getCofeinBookingViews(
        geometry,
        'interior-main',
        tables,
      ).single;
      expect(view.bounds.size, const Size(300, 320));
      expect(view.label('en'), 'New hall');
      expect(view.tableIds, ['NEW']);
    },
  );

  test(
    'projection round trips API bounds and rejects missing or invalid geometry',
    () {
      for (final zone in ['interior', 'exterior', 'roof']) {
        final geometry = getCofeinMapGeometry([Zone(id: zone, name: zone)]);
        for (final point in [
          const Offset(5, 5),
          const Offset(95, 95),
          const Offset(5, 95),
          const Offset(95, 5),
          const Offset(32.17, 75.22),
        ]) {
          final placement = projectCofeinTable(
            table('NEW', zone, point.dx, point.dy),
            geometry,
          )!;
          nearPoint(
            unprojectCofeinPoint(zone, placement.center, geometry)!,
            point,
          );
        }
        expect(
          unprojectCofeinPoint(zone, const Offset(-10000, 10000), geometry),
          const Offset(5, 95),
        );
      }
      expect(projectCofeinTable(table('T01', 'missing', 50, 50)), isNull);
      expect(
        projectCofeinTable(table('T01', 'interior', double.nan, 50)),
        isNull,
      );
      expect(
        unprojectCofeinPoint('interior', const Offset(1, double.infinity)),
        isNull,
      );
      expect(
        projectCofeinTable(
          table('T01', 'interior', 5, 5),
          getCofeinMapGeometry([]),
        ),
        isNull,
      );
    },
  );

  test('fifty dynamic halls remain bounded and view labels cover all app languages', () {
    final zones = List.generate(
      50,
      (index) => Zone(id: 'hall-$index', name: 'Hall $index'),
    );
    final geometry = getCofeinMapGeometry(zones);
    expect(geometry.zones, hasLength(50));
    expect(geometry.minScale * geometry.world.height, lessThanOrEqualTo(200));
    for (final zone in geometry.zones) {
      expect(
        (Offset.zero & geometry.world).contains(zone.bounds.topLeft),
        true,
      );
      expect(
        (Offset.zero & geometry.world).contains(zone.bounds.bottomRight),
        true,
      );
    }
    final preset = getCofeinMapGeometry(const [
      Zone(id: 'interior', name: 'Inside'),
    ]);
    final view = getCofeinBookingViews(preset, 'interior', [
      table('T19', 'interior', 5, 5),
    ]).single;
    expect(view.label('bg'), 'Основна част');
    expect(view.label('en'), 'Main part');
    expect(view.label('ru'), 'Основная часть');
    expect(view.label('de'), 'Основна част');
  });
}
