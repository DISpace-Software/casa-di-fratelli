import 'dart:math' as math;
import 'dart:ui';

import 'models.dart';

/// Presentation geometry shared with the Cofein web map. Table positions,
/// capacities and availability always come from the current API floor plan.
const cofeinMapWorld = Size(900, 1600);

class CofeinMapView {
  const CofeinMapView({
    required this.id,
    required this.bounds,
    required this.rawLabel,
    this.zoneId,
    this.names = const {},
    this.tableIds = const [],
  });
  final String id, rawLabel;
  final String? zoneId;
  final Rect bounds;
  final Map<String, String> names;
  final List<String> tableIds;
  double get x => bounds.left;
  double get y => bounds.top;
  double get width => bounds.width;
  double get height => bounds.height;
  String label([String language = 'bg']) =>
      names[language] ?? names['bg'] ?? rawLabel;
}

class CofeinZoneGeometry {
  const CofeinZoneGeometry({
    required this.zone,
    required this.bounds,
    required this.preset,
    this.content,
  });
  final Zone zone;
  final Rect bounds;
  final Rect? content;
  final bool preset;
  String get id => zone.id;
  String get name => zone.name;
  String get viewId => cofeinZoneViewId(id);
}

class CofeinMapGeometry {
  const CofeinMapGeometry({
    required this.world,
    required this.zones,
    required this.views,
    required this.detailViews,
    required this.hasPreset,
    required this.minScale,
  });
  final Size world;
  final List<CofeinZoneGeometry> zones;
  final Map<String, CofeinMapView> views;
  final List<String> detailViews;
  final bool hasPreset;
  final double minScale;
}

class CofeinTablePlacement {
  const CofeinTablePlacement({
    required this.center,
    required this.size,
    required this.rotationDegrees,
    required this.kind,
    required this.fragmentId,
    this.compact = false,
    this.openEnd = false,
  });
  final Offset center;
  final Size size;
  final double rotationDegrees;
  final String kind, fragmentId;
  final bool compact, openEnd;
  double get x => center.dx;
  double get y => center.dy;
  double get width => size.width;
  double get height => size.height;
  Rect get bounds =>
      Rect.fromCenter(center: center, width: size.width, height: size.height);
}

const cofeinMapViews = <String, CofeinMapView>{
  'all': CofeinMapView(
    id: 'all',
    bounds: Rect.fromLTWH(0, 0, 900, 1600),
    rawLabel: 'Цялата карта',
    names: {'bg': 'Цялата карта', 'en': 'Whole map', 'ru': 'Вся карта'},
  ),
  'exterior': CofeinMapView(
    id: 'exterior',
    zoneId: 'exterior',
    bounds: Rect.fromLTWH(35, 315, 555, 1270),
    rawLabel: 'Външна зала',
  ),
  'interior': CofeinMapView(
    id: 'interior',
    zoneId: 'interior',
    bounds: Rect.fromLTWH(290, 35, 600, 1240),
    rawLabel: 'Вътрешна зала',
  ),
  'exterior-upper': CofeinMapView(
    id: 'exterior-upper',
    zoneId: 'exterior',
    bounds: Rect.fromLTWH(35, 305, 390, 785),
    rawLabel: 'Външна зала · към градината',
    names: {
      'bg': 'Външна зала · към градината',
      'en': 'Exterior hall · garden side',
      'ru': 'Внешний зал · со стороны сада',
    },
  ),
  'exterior-lower': CofeinMapView(
    id: 'exterior-lower',
    zoneId: 'exterior',
    bounds: Rect.fromLTWH(35, 1025, 555, 560),
    rawLabel: 'Външна зала · към улицата',
    names: {
      'bg': 'Външна зала · към улицата',
      'en': 'Exterior hall · street side',
      'ru': 'Внешний зал · со стороны улицы',
    },
  ),
  'interior-main': CofeinMapView(
    id: 'interior-main',
    zoneId: 'interior',
    bounds: Rect.fromLTWH(300, 35, 590, 875),
    rawLabel: 'Вътрешна · основна',
    names: {
      'bg': 'Вътрешна · основна',
      'en': 'Interior · main',
      'ru': 'Внутренний · основная',
    },
  ),
  'interior-angled': CofeinMapView(
    id: 'interior-angled',
    zoneId: 'interior',
    bounds: Rect.fromLTWH(315, 765, 520, 515),
    rawLabel: 'Вътрешна · ъглова',
    names: {
      'bg': 'Вътрешна · ъглова',
      'en': 'Interior · angled',
      'ru': 'Внутренний · угловая',
    },
  ),
};

const _transforms = <String, Rect>{
  'exterior': Rect.fromLTRB(1010, 1200, 1620, 3340),
  'interior': Rect.fromLTRB(1560, 1218, 2155, 2610),
};
const _detailViews = <String, List<String>>{
  'exterior': ['exterior-upper', 'exterior-lower'],
  'interior': ['interior-main', 'interior-angled'],
};
const _bookingViewNames = <String, Map<String, String>>{
  'exterior-upper': {
    'bg': 'Към градината',
    'en': 'Garden side',
    'ru': 'Со стороны сада',
  },
  'exterior-lower': {
    'bg': 'Към улицата',
    'en': 'Street side',
    'ru': 'Со стороны улицы',
  },
  'interior-main': {
    'bg': 'Основна част',
    'en': 'Main part',
    'ru': 'Основная часть',
  },
  'interior-angled': {
    'bg': 'Ъглова част',
    'en': 'Corner part',
    'ru': 'Угловая часть',
  },
};

String cofeinZoneViewId(String zoneId) => 'zone:$zoneId';

CofeinZoneGeometry? _zoneById(List<CofeinZoneGeometry>? zones, String id) {
  if (zones == null) return null;
  for (final zone in zones) {
    if (zone.id == id) return zone;
  }
  return null;
}

CofeinTablePlacement? projectCofeinTable(
  SeatTable table, [
  CofeinMapGeometry? geometry,
]) => _projectTable(table, geometry?.zones);

CofeinTablePlacement? _projectTable(
  SeatTable table,
  List<CofeinZoneGeometry>? zones,
) {
  final zone = _zoneById(zones, table.zoneId);
  if (zones != null && zone == null) return null;
  if (!table.x.isFinite || !table.y.isFinite) return null;
  final transform = _transforms[table.zoneId];
  if (transform == null) {
    final content = zone?.content;
    if (content == null) return null;
    return CofeinTablePlacement(
      center: Offset(
        content.left + (table.x - 5) / 90 * content.width,
        content.top + (table.y - 5) / 90 * content.height,
      ),
      size: table.wide ? const Size(98, 98) : const Size(80, 78),
      rotationDegrees: 0,
      kind: table.wide ? 'booth' : 'square',
      fragmentId: zone!.viewId,
    );
  }
  final rawX = transform.left + (table.x - 5) / 90 * transform.width;
  final rawY = transform.top + (table.y - 5) / 90 * transform.height;
  final id = table.id.toUpperCase();
  final number = id.startsWith('T') ? int.tryParse(id.substring(1)) : null;
  final paired =
      number != null && number >= 1 && number <= 12 && id.length == 3;
  final square = id == 'T13' || id == 'T14' || id == 'F04';
  final booth =
      (number != null && number >= 15 && number <= 22 && id.length == 3) ||
      RegExp(r'^F0[1-3]$').hasMatch(id);
  final uBooth = RegExp(r'^T2[3-6]$').hasMatch(id);
  final kind = paired
      ? 'paired'
      : square
      ? 'square'
      : booth
      ? 'booth'
      : uBooth
      ? 'u-booth'
      : table.wide
      ? 'booth'
      : 'square';
  final rotated = RegExp(r'^F0[1-3]$').hasMatch(id) || uBooth;
  final compact = id == 'F04';
  final size = compact
      ? const Size(48, 48)
      : rotated
      ? const Size(112, 112)
      : kind == 'booth'
      ? const Size(78, 98)
      : const Size(80, 78);
  final fragmentId = table.zoneId == 'exterior'
      ? (rawY >= 2460 ? 'exterior-lower' : 'exterior-upper')
      : (rawY >= 2050 ? 'interior-angled' : 'interior-main');
  return CofeinTablePlacement(
    center: Offset((rawX - 740) / 2, (rawY - 350) / 2),
    size: size,
    rotationDegrees: rotated ? 45 : 0,
    kind: kind,
    fragmentId: fragmentId,
    compact: compact,
    openEnd: id == 'T18',
  );
}

Rect _enclosing(Iterable<CofeinTablePlacement> tables) =>
    tables.map((table) => table.bounds).reduce((a, b) => a.expandToInclude(b));

Rect _frame(
  Rect furniture,
  Rect container,
  double minWidth,
  double minHeight,
  double padding,
) {
  final width = math.min(
    container.width,
    math.max(minWidth, furniture.width + padding),
  );
  final height = math.min(
    container.height,
    math.max(minHeight, furniture.height + padding),
  );
  return Rect.fromLTWH(
    (furniture.center.dx - width / 2).clamp(
      container.left,
      container.right - width,
    ),
    (furniture.center.dy - height / 2).clamp(
      container.top,
      container.bottom - height,
    ),
    width,
    height,
  );
}

CofeinMapGeometry getCofeinMapGeometry(
  List<Zone> zones, [
  List<SeatTable> tables = const [],
]) {
  final hasPreset = zones.any((zone) => _transforms.containsKey(zone.id));
  final extras = zones
      .where((zone) => !_transforms.containsKey(zone.id))
      .toList();
  // Include closed halls in slot allocation, so seasonal closure does not move
  // neighbouring halls. Only active halls are exposed to the booking UI.
  final extraBounds = <String, Rect>{
    for (var index = 0; index < extras.length; index++)
      extras[index].id: Rect.fromLTWH(
        (hasPreset ? 980.0 : 60.0) + (index % 2) * 1280,
        60.0 + (index ~/ 2) * 1280,
        1200,
        1200,
      ),
  };
  final active = zones
      .where((zone) => zone.active)
      .map((zone) {
        final preset = _transforms.containsKey(zone.id);
        final bounds = preset
            ? cofeinMapViews[zone.id]!.bounds
            : extraBounds[zone.id]!;
        return CofeinZoneGeometry(
          zone: zone,
          bounds: bounds,
          preset: preset,
          content: preset
              ? null
              : Rect.fromLTWH(
                  bounds.left + 70,
                  bounds.top + 110,
                  bounds.width - 140,
                  bounds.height - 180,
                ),
        );
      })
      .toList(growable: false);
  final annexes = active.where((zone) => !zone.preset).toList();
  final world = annexes.isEmpty
      ? cofeinMapWorld
      : Size(
          annexes.fold(
            hasPreset ? cofeinMapWorld.width : 0.0,
            (value, zone) => math.max(value, zone.bounds.right + 60),
          ),
          annexes.fold(
            hasPreset ? cofeinMapWorld.height : 0.0,
            (value, zone) => math.max(value, zone.bounds.bottom + 60),
          ),
        );
  final views = <String, CofeinMapView>{
    'all': CofeinMapView(
      id: 'all',
      bounds: Offset.zero & world,
      rawLabel: 'Цялата карта',
      names: cofeinMapViews['all']!.names,
    ),
  };
  final detailViews = ['all'];
  for (final zone in active) {
    final placed = tables
        .where((table) => table.zoneId == zone.id)
        .map((table) => _projectTable(table, active))
        .whereType<CofeinTablePlacement>()
        .toList();
    final bounds = zone.preset || placed.isEmpty
        ? zone.bounds
        : _frame(_enclosing(placed), zone.bounds, 360, 400, 140);
    final view = CofeinMapView(
      id: zone.viewId,
      zoneId: zone.id,
      bounds: bounds,
      rawLabel: zone.name,
    );
    views[zone.viewId] = view;
    if (zone.preset) {
      views[zone.id] = view;
      for (final id in _detailViews[zone.id]!) {
        views[id] = cofeinMapViews[id]!;
        detailViews.add(id);
      }
    } else {
      detailViews.add(zone.viewId);
    }
  }
  return CofeinMapGeometry(
    world: world,
    zones: List.unmodifiable(active),
    views: Map.unmodifiable(views),
    detailViews: List.unmodifiable(detailViews),
    hasPreset: hasPreset,
    minScale: math.min(0.12, 200 / math.max(world.width, world.height)),
  );
}

/// Occupied tables deliberately remain in crop calculations. Availability can
/// hide their interactive furniture without making the room jump or resize.
List<CofeinMapView> getCofeinBookingViews(
  CofeinMapGeometry geometry,
  String zoneId, [
  List<SeatTable> tables = const [],
]) {
  final zone = _zoneById(geometry.zones, zoneId);
  if (zone == null) return const [];
  final placed = <({SeatTable table, CofeinTablePlacement placement})>[
    for (final table in tables.where((table) => table.zoneId == zoneId))
      if (projectCofeinTable(table, geometry) case final placement?)
        (table: table, placement: placement),
  ];
  final views = <CofeinMapView>[];
  for (final id in _detailViews[zoneId] ?? [zone.viewId]) {
    final furniture = placed
        .where((item) => item.placement.fragmentId == id)
        .toList();
    if (furniture.isEmpty) continue;
    final names = _bookingViewNames[id] ?? const <String, String>{};
    views.add(
      CofeinMapView(
        id: id,
        zoneId: zoneId,
        bounds: _frame(
          _enclosing(furniture.map((item) => item.placement)),
          Offset.zero & geometry.world,
          300,
          320,
          112,
        ),
        names: names,
        rawLabel: names['bg'] ?? zone.name,
        tableIds: List.unmodifiable(furniture.map((item) => item.table.id)),
      ),
    );
  }
  return List.unmodifiable(views);
}

Offset? unprojectCofeinPoint(
  String zoneId,
  Offset point, [
  CofeinMapGeometry? geometry,
]) {
  final zone = _zoneById(geometry?.zones, zoneId);
  if (geometry != null && zone == null) return null;
  if (!point.dx.isFinite || !point.dy.isFinite) return null;
  double bound(double value) => value.clamp(5, 95);
  final transform = _transforms[zoneId];
  if (transform == null) {
    final content = zone?.content;
    if (content == null) return null;
    return Offset(
      bound(5 + (point.dx - content.left) / content.width * 90),
      bound(5 + (point.dy - content.top) / content.height * 90),
    );
  }
  return Offset(
    bound(5 + (point.dx * 2 + 740 - transform.left) / transform.width * 90),
    bound(5 + (point.dy * 2 + 350 - transform.top) / transform.height * 90),
  );
}
