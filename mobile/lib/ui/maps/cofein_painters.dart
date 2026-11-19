import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import '../../domain/cofein_geometry.dart';
import '../../domain/models.dart';
import '../theme.dart';

/// The same architectural underlay as the Cofein website, drawn natively.
///
/// The supplied canvas represents the 900 × 1600 presentation world. Tables
/// are painted separately from live API data: the architecture never invents
/// booking targets or changes a table's saved location.
class CofeinArchitecturePainter extends CustomPainter {
  const CofeinArchitecturePainter({
    this.language = 'bg',
    this.zoneNames = const {},
  });

  final String language;
  final Map<String, String> zoneNames;

  static const worldSize = Size(900, 1600);
  static const backgroundColor = Color(0xFF181725);

  static final _floor = _planPath(
    'M880 730H1440L1725 455H1900V610H2190V825L2280 740L2490 945'
    'L2290 1125L2470 1230L1910 1775V1940L2340 2370L1940 2780'
    'L1820 2890L1240 3460H895V1090H880Z',
  );
  static final _outerWalls = _planPath(
    'M880 995V730H1440L1725 455H1900V610H2190V825L2280 740L2490 945'
    'L2290 1125L2470 1230L1910 1775V1940L2340 2370'
    'M895 1090V1815M895 1965V2460M1455 2190V2250L1940 2780',
  );
  static final _serviceWalls = _planPath(
    'M1065 730V945H1015M1120 955H1440L1600 955L1630 925V770L1730 680H1770'
    'M1870 680H1900V610M1900 720V740M1900 835V955H2190'
    'M1900 780H2050M2050 780H2190M2050 640V675M2050 750V780'
    'M2050 805V840M2050 920V955M1900 955V1035H2130V1090'
    'M2130 1170V1325H2045L1925 1440V1570M2190 955L2240 1005'
    'M2290 1125L2190 1045',
  );
  static final _interiorFloor = _planPath(
    'M1455 1090H2130V1325L1925 1570L1910 1940L2340 2370L1940 2780'
    'L1490 2235L1455 2135Z',
  );
  static final _serviceFloor = _planPath(
    'M880 730H1440L1725 455H1900V610H2190V825L2280 740L2490 945'
    'L2290 1125L2470 1230L1910 1775V1570L2130 1325V1090H1455'
    'V990H1120V1090H880Z',
  );
  static final _glazing = [
    _planPath('M1455 1090V2050'),
    _planPath('M895 2480V3460H1240L1750 2930'),
    _planPath('M1940 2780L2340 2370'),
    _planPath('M895 2460H1230'),
  ];
  static final _partition = _planPath('M1120 1090V1815M1120 1970V2460');
  static final _counter = _planPath(
    'M2245 835L2285 795L2425 935L2375 985L2395 1005L2450 945'
    'L2285 780L2230 835Z',
  );
  static final _directions = _planPath(
    'M30 345H62L70 358M30 782H62L70 794M550 1290H592',
  );
  static const _columns = [
    Offset(895, 1090),
    Offset(895, 1475),
    Offset(895, 1965),
    Offset(895, 2460),
    Offset(895, 2690),
    Offset(895, 2960),
    Offset(895, 3230),
    Offset(895, 3460),
    Offset(1240, 3460),
    Offset(1455, 1090),
    Offset(1455, 1475),
    Offset(1455, 1910),
    Offset(1490, 2250),
    Offset(1740, 2510),
    Offset(1940, 2780),
    Offset(2135, 2580),
    Offset(2340, 2370),
    Offset(1120, 1090),
    Offset(1120, 1475),
    Offset(1120, 1965),
    Offset(1120, 2690),
    Offset(1120, 2960),
    Offset(1120, 3230),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;
    final words = _strings[language] ?? _strings['bg']!;
    String text(String key) => zoneNames[key] ?? words[key]!;
    canvas.save();
    canvas.scale(size.width / worldSize.width, size.height / worldSize.height);
    canvas.drawRect(Offset.zero & worldSize, _fill(backgroundColor));

    canvas.save();
    // Original traced plan pixels → the shared web/mobile presentation world.
    canvas.translate(-370, -175);
    canvas.scale(.5);
    canvas.drawPath(
      _floor,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF1F1C2C), Color(0xFF211D2E), Color(0xFF201C2C)],
          stops: [0, .55, 1],
        ).createShader(_floor.getBounds()),
    );
    canvas.drawPath(_interiorFloor, _fill(const Color(0x382A253A)));
    canvas.drawPath(_serviceFloor, _fill(const Color(0xD9242132)));
    _paintTiles(canvas);

    canvas.save();
    canvas.translate(5, 8);
    final shadow = _stroke(const Color(0x4D0B0912), 22)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4);
    canvas.drawPath(_outerWalls, shadow);
    canvas.drawPath(_serviceWalls, shadow..strokeWidth = 18);
    canvas.restore();
    canvas.drawPath(_outerWalls, _stroke(const Color(0xFF303040), 22));
    canvas.drawPath(_serviceWalls, _stroke(const Color(0xFF303040), 18));
    canvas.drawPath(_outerWalls, _stroke(const Color(0xFF79708D), 4));
    canvas.drawPath(_serviceWalls, _stroke(const Color(0xFF79708D), 2.5));
    for (final path in _glazing) {
      canvas.drawPath(path, _stroke(const Color(0xFF383244), 14));
      canvas.drawPath(path, _stroke(const Color(0xFF73678E), 9));
      canvas.drawPath(path, _stroke(const Color(0xFF9B8EBE), 5));
      canvas.drawPath(path, _stroke(const Color(0xFF6B5C8A), 1.5));
    }
    canvas.drawPath(_partition, _stroke(const Color(0xFF5F566E), 4));

    _door(canvas, 895, 1090, rotation: -90, width: 95);
    _door(canvas, 895, 1965, rotation: -90, width: 150);
    _door(canvas, 1230, 2460, width: 100);
    _door(canvas, 1455, 2190, width: 140, reverse: true);
    _door(canvas, 1750, 2930, rotation: 45, width: 93);
    _door(canvas, 1880, 2800, rotation: 225, width: 93);
    _door(canvas, 1120, 955, width: 95);
    _door(canvas, 1870, 680, width: 100, reverse: true);
    _door(canvas, 2050, 750, rotation: -90, width: 75);
    _door(canvas, 2050, 920, rotation: -90, width: 80);
    _door(canvas, 2130, 1170, rotation: 180, width: 80);

    for (final rect in const [
      Rect.fromLTWH(1230, 855, 220, 68),
      Rect.fromLTWH(1235, 750, 100, 31),
      Rect.fromLTWH(1500, 882, 68, 65),
      Rect.fromLTWH(1930, 975, 180, 42),
      Rect.fromLTWH(2148, 1178, 40, 120),
    ]) {
      final shape = RRect.fromRectAndRadius(rect, const Radius.circular(2));
      canvas.drawRRect(shape, _fill(const Color(0xFF363044)));
      canvas.drawRRect(shape, _stroke(const Color(0xFF6E637F), 2));
    }
    canvas.drawPath(_counter, _fill(const Color(0xFF363044)));
    canvas.drawPath(_counter, _stroke(const Color(0xFF6E637F), 2));
    const barBounds = Rect.fromLTWH(1850, 1170, 70, 400);
    final bar = RRect.fromRectAndRadius(barBounds, const Radius.circular(5));
    canvas.drawRRect(
      bar,
      Paint()
        ..shader = const LinearGradient(
          colors: [Color(0xFF272232), Color(0xFF3B314C), Color(0xFF211C2D)],
          stops: [0, .45, 1],
        ).createShader(barBounds),
    );
    canvas.drawRRect(bar, _stroke(const Color(0xFF191522), 5));
    canvas.drawLine(
      const Offset(1860, 1182),
      const Offset(1860, 1558),
      _stroke(const Color(0x408070A1), 2),
    );
    canvas.drawLine(
      const Offset(1910, 1182),
      const Offset(1910, 1558),
      _stroke(const Color(0x408070A1), 2),
    );
    for (final y in [1200.0, 1260.0, 1320.0, 1380.0, 1440.0, 1500.0]) {
      final outer = RRect.fromRectAndRadius(
        Rect.fromLTWH(1779, y - 18, 36, 36),
        const Radius.circular(7),
      );
      final inner = RRect.fromRectAndRadius(
        Rect.fromLTWH(1783, y - 14, 28, 27),
        const Radius.circular(5),
      );
      canvas.drawRRect(outer, _fill(const Color(0xFF393047)));
      canvas.drawRRect(outer, _stroke(const Color(0xFF221E2E), 3));
      canvas.drawRRect(inner, _upholstery(inner.outerRect));
      canvas.drawRRect(inner, _stroke(const Color(0xFF807091), 1));
    }
    for (final point in _columns) {
      final rect = Rect.fromCenter(center: point, width: 24, height: 24);
      canvas.drawRect(rect, _fill(const Color(0xFF484052)));
      canvas.drawRect(rect, _stroke(const Color(0xFF24202E), 2));
      canvas.drawPath(
        Path()
          ..moveTo(point.dx - 9, point.dy + 9)
          ..lineTo(point.dx - 9, point.dy - 9)
          ..lineTo(point.dx + 9, point.dy - 9),
        _stroke(const Color(0xFF79708D), 2),
      );
    }
    canvas.restore();

    void label(
      double x,
      double y,
      String value, {
      double rotation = 0,
      double fontSize = 13,
      Color color = SeatMapColors.muted,
      FontWeight weight = FontWeight.w500,
      double spacing = 0,
      bool start = false,
    }) => _label(
      canvas,
      value,
      Offset((x - 740) / 2, (y - 350) / 2),
      rotation: rotation,
      fontSize: fontSize,
      color: color,
      weight: weight,
      spacing: spacing,
      start: start,
    );
    label(980, 840, text('storage'));
    label(1300, 825, text('storage'));
    label(1785, 550, text('storage'));
    label(2120, 715, 'WC');
    label(2120, 884, 'WC');
    label(2335, 910, text('prep'), rotation: -45);
    label(2315, 1250, text('kitchen'));
    label(2135, 1485, text('wash'), rotation: -45);
    label(
      1886,
      1370,
      text('bar'),
      rotation: -90,
      fontSize: 14,
      color: const Color(0xFFD6CBEA),
      weight: FontWeight.w600,
      spacing: 1,
    );
    for (final value in const [
      (1202.0, 1700.0, -90.0, 'exterior'),
      (1700.0, 1670.0, -90.0, 'interior'),
      (1260.0, 2880.0, -45.0, 'exterior'),
      (1920.0, 2350.0, 45.0, 'interior'),
    ]) {
      label(
        value.$1,
        value.$2,
        text(value.$4),
        rotation: value.$3,
        fontSize: 12,
        color: SeatMapColors.muted,
        weight: FontWeight.w600,
        spacing: .8,
      );
    }
    label(785, 2260, text('garden'), rotation: -90);
    label(1790, 3090, text('street'));
    canvas.drawPath(_directions, _stroke(const Color(0xFF9B8EBE), 1));
    for (final value in const [
      (795.0, 1010.0, 'gardenExit'),
      (795.0, 1885.0, 'gardenExit'),
      (1950.0, 2925.0, 'streetEntry'),
    ]) {
      label(
        value.$1,
        value.$2,
        text(value.$3),
        fontSize: 11,
        color: SeatMapColors.muted,
        start: true,
      );
    }
    canvas.restore();
  }

  static void _paintTiles(Canvas canvas) {
    canvas.save();
    canvas.clipPath(_floor);
    final light = _stroke(const Color(0x0AFFFFFF), 1.5);
    final edge = _stroke(const Color(0x065F5574), .7);
    final detail = _stroke(const Color(0x035F5574), .8);
    for (var x = 814.0; x < 2510; x += 74) {
      for (var y = 444.0; y < 3490; y += 74) {
        canvas.drawPath(
          Path()
            ..moveTo(x + 74, y)
            ..lineTo(x, y)
            ..lineTo(x, y + 74),
          light,
        );
        canvas.drawPath(
          Path()
            ..moveTo(x + 73, y + 1)
            ..lineTo(x + 1, y + 1)
            ..lineTo(x + 1, y + 73),
          edge,
        );
        canvas.drawPath(
          Path()
            ..moveTo(x + 11, y + 13)
            ..lineTo(x + 22, y + 15)
            ..lineTo(x + 28, y + 13)
            ..moveTo(x + 48, y + 48)
            ..lineTo(x + 60, y + 45),
          detail,
        );
      }
    }
    canvas.restore();
  }

  static void _door(
    Canvas canvas,
    double x,
    double y, {
    double rotation = 0,
    double width = 80,
    bool reverse = false,
  }) {
    canvas.save();
    canvas.translate(x, y);
    canvas.rotate(rotation * math.pi / 180);
    if (reverse) canvas.scale(-1, 1);
    final arc = Path()
      ..moveTo(0, 0)
      ..lineTo(0, -width)
      ..arcTo(
        Rect.fromCircle(center: Offset.zero, radius: width),
        -math.pi / 2,
        math.pi / 2,
        false,
      );
    final dash = _stroke(const Color(0xFF80738F), 2);
    for (final metric in arc.computeMetrics()) {
      for (var at = 0.0; at < metric.length; at += 7) {
        canvas.drawPath(
          metric.extractPath(at, math.min(at + 4, metric.length)),
          dash,
        );
      }
    }
    canvas.drawLine(
      Offset.zero,
      Offset(0, -width),
      _stroke(const Color(0xFF8E80A2), 4),
    );
    canvas.drawCircle(Offset.zero, 3.5, _fill(const Color(0xFF8E80A2)));
    canvas.restore();
  }

  @override
  bool shouldRepaint(CofeinArchitecturePainter oldDelegate) =>
      language != oldDelegate.language ||
      !mapEquals(zoneNames, oldDelegate.zoneNames);

  static const _strings = {
    'bg': {
      'garden': 'Градина',
      'street': 'Улица',
      'storage': 'Склад',
      'prep': 'Подготовка',
      'kitchen': 'Кухня',
      'wash': 'Миялно',
      'bar': 'Бар',
      'exterior': 'ВЪНШНА ЗАЛА',
      'interior': 'ВЪТРЕШНА ЗАЛА',
      'gardenExit': 'Към градината',
      'streetEntry': 'Вход / изход',
    },
    'en': {
      'garden': 'Garden',
      'street': 'Street',
      'storage': 'Storage',
      'prep': 'Preparation',
      'kitchen': 'Kitchen',
      'wash': 'Wash-up',
      'bar': 'Bar',
      'exterior': 'EXTERIOR',
      'interior': 'INTERIOR',
      'gardenExit': 'To the garden',
      'streetEntry': 'Entrance / exit',
    },
    'ru': {
      'garden': 'Сад',
      'street': 'Улица',
      'storage': 'Склад',
      'prep': 'Подготовка',
      'kitchen': 'Кухня',
      'wash': 'Моечная',
      'bar': 'Бар',
      'exterior': 'ВНЕШНИЙ ЗАЛ',
      'interior': 'ВНУТРЕННИЙ ЗАЛ',
      'gardenExit': 'Выход в сад',
      'streetEntry': 'Вход / выход',
    },
  };
}

/// Live landmarks supplement the traced architecture without inventing room
/// features. Their rectangles use exactly the same zone projection as tables.
///
/// The canvas represents [CofeinMapGeometry.world]; labels have already been
/// localized by the repository. Callers can pass just the current hall's items.
class CofeinLandmarksPainter extends CustomPainter {
  const CofeinLandmarksPainter({
    required this.landmarks,
    required this.geometry,
  });

  final List<FloorLandmark> landmarks;
  final CofeinMapGeometry geometry;

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty || geometry.world.isEmpty || landmarks.isEmpty) return;
    canvas.save();
    canvas.scale(
      size.width / geometry.world.width,
      size.height / geometry.world.height,
    );
    for (final item in landmarks) {
      if (!geometry.zones.any(
        (zone) => zone.id == item.zoneId && zone.zone.active,
      )) {
        continue;
      }
      if (![item.x, item.y, item.width, item.height].every((v) => v.isFinite) ||
          item.width <= 0 ||
          item.height <= 0) {
        continue;
      }
      Offset? project(double x, double y) => projectCofeinTable(
        SeatTable(id: item.id, zoneId: item.zoneId, label: '', x: x, y: y),
        geometry,
      )?.center;
      // API landmark rectangles can extend to 0/100%, whereas table centers
      // normally occupy 5..95%. Projection intentionally does not clamp them.
      final topLeft = project(item.x, item.y);
      final bottomRight = project(item.x + item.width, item.y + item.height);
      if (topLeft == null || bottomRight == null) continue;
      final rect = Rect.fromPoints(topLeft, bottomRight);
      final shape = RRect.fromRectAndRadius(rect, const Radius.circular(2));
      final vertical = rect.height > rect.width;
      switch (item.kind) {
        case 'window':
          canvas.drawRRect(shape, _fill(const Color(0x405E507C)));
          canvas.drawRRect(shape, _stroke(const Color(0xFF6B5C8A), 2));
          final frame = _stroke(const Color(0xFF6B5C8A), 1.3);
          if (vertical) {
            canvas.drawLine(
              Offset(rect.center.dx, rect.top),
              Offset(rect.center.dx, rect.bottom),
              _stroke(const Color(0x0AFFFFFF), 2),
            );
            for (var y = rect.top + 32; y < rect.bottom; y += 32) {
              canvas.drawLine(
                Offset(rect.left, y),
                Offset(rect.right, y),
                frame,
              );
            }
          } else {
            canvas.drawLine(
              Offset(rect.left, rect.center.dy),
              Offset(rect.right, rect.center.dy),
              _stroke(const Color(0x0AFFFFFF), 2),
            );
            for (var x = rect.left + 32; x < rect.right; x += 32) {
              canvas.drawLine(
                Offset(x, rect.top),
                Offset(x, rect.bottom),
                frame,
              );
            }
          }
        case 'wall':
          canvas.drawRRect(shape, _fill(const Color(0xFF79708D)));
          canvas.drawRRect(shape, _stroke(const Color(0xFF303040), 2));
          canvas.drawLine(
            vertical
                ? Offset(rect.left + 1, rect.top)
                : Offset(rect.left, rect.top + 1),
            vertical
                ? Offset(rect.left + 1, rect.bottom)
                : Offset(rect.right, rect.top + 1),
            _stroke(const Color(0xFF6E637F), 1),
          );
        case 'tv':
          canvas.drawRRect(shape, _fill(const Color(0xFF272232)));
          canvas.drawRRect(shape, _stroke(const Color(0xFF73668B), 1.5));
          if (rect.shortestSide > 5) {
            final screen = RRect.fromRectAndRadius(
              rect.deflate(2),
              const Radius.circular(1),
            );
            canvas.drawRRect(
              screen,
              Paint()
                ..shader = const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFF8B7BA8), Color(0xFF514463)],
                ).createShader(screen.outerRect),
            );
          }
        case 'bar':
          canvas.drawRRect(
            shape,
            Paint()
              ..shader = const LinearGradient(
                colors: [
                  Color(0xFF272232),
                  Color(0xFF3B314C),
                  Color(0xFF211C2D),
                ],
                stops: [0, .45, 1],
              ).createShader(rect),
          );
          canvas.drawRRect(shape, _stroke(const Color(0xFF8070A1), 1.5));
        case 'entrance':
        case 'terraceEntrance':
        case 'restaurantEntrance':
          canvas.drawRRect(shape, _fill(const Color(0x30574A70)));
          canvas.drawRRect(shape, _stroke(const Color(0xFF9786BA), 1.5));
          // An entry symbol, not a guessed door swing or evacuation direction.
          final radius = math.min(12.0, math.max(4.0, rect.shortestSide / 3));
          final center = rect.center;
          canvas.drawPath(
            Path()
              ..moveTo(center.dx - radius, center.dy - radius)
              ..lineTo(center.dx + radius * .6, center.dy - radius)
              ..lineTo(center.dx + radius * .6, center.dy + radius)
              ..lineTo(center.dx - radius, center.dy + radius)
              ..moveTo(center.dx - radius, center.dy)
              ..lineTo(center.dx + radius, center.dy)
              ..moveTo(center.dx + radius * .4, center.dy - radius * .5)
              ..lineTo(center.dx + radius, center.dy)
              ..lineTo(center.dx + radius * .4, center.dy + radius * .5),
            _stroke(const Color(0xFFAD9BCF), 1.5)
              ..strokeCap = StrokeCap.round
              ..strokeJoin = StrokeJoin.round,
          );
        default:
          canvas.drawRRect(shape, _fill(const Color(0x32363044)));
          canvas.drawRRect(shape, _stroke(const Color(0xFF6E637F), 1.5));
      }
      final label = item.label.trim();
      if (label.isNotEmpty) {
        final inside = item.kind == 'bar' && rect.shortestSide >= 18;
        _label(
          canvas,
          label,
          inside
              ? rect.center + const Offset(0, 4)
              : vertical
              ? Offset(rect.right + 14, rect.center.dy)
              : Offset(rect.center.dx, rect.top - 7),
          rotation: vertical ? -90 : 0,
          fontSize: 11,
          color: inside ? const Color(0xFFD6CBEA) : SeatMapColors.muted,
          weight: FontWeight.w600,
        );
      }
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(CofeinLandmarksPainter oldDelegate) =>
      geometry != oldDelegate.geometry ||
      !listEquals(landmarks, oldDelegate.landmarks);
}

/// Furniture only; the surrounding widget supplies the real table's hit target,
/// accessibility label, availability and selection action.
///
/// [width] and [height] are presentation-world dimensions. Furniture rotates
/// inside these bounds while the table number and capacity stay upright.
class CofeinTablePainter extends CustomPainter {
  const CofeinTablePainter({
    required this.width,
    required this.height,
    required this.kind,
    required this.label,
    required this.seats,
    this.rotation = 0,
    this.compact = false,
    this.openEnd = false,
    this.selected = false,
  });

  final double width;
  final double height;
  final String kind;
  final double rotation;
  final bool compact;
  final bool openEnd;
  final String label;
  final int seats;
  final bool selected;

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty || width <= 0 || height <= 0) return;
    final paired = kind == 'paired';
    final booth = kind == 'booth' || kind == 'u-booth';
    final uBooth = kind == 'u-booth';
    final tableWidth = compact ? 29.0 : (paired || booth ? 62.0 : 40.0);
    final tableHeight = compact
        ? 28.0
        : (paired ? 34.0 : (booth ? 38.0 : 40.0));
    canvas.save();
    canvas.scale(size.width / width, size.height / height);
    canvas.translate(width / 2, height / 2);
    canvas.save();
    canvas.rotate(rotation * math.pi / 180);
    if (booth) {
      _seat(canvas, 0, -34, width: 72, height: 22);
      if (!openEnd && !uBooth) {
        _seat(canvas, 0, 34, width: 72, height: 22, rotation: 180);
      }
      if (uBooth) {
        _seat(canvas, -37, 0, width: 52, height: 17, rotation: -90);
        _seat(canvas, 37, 0, width: 52, height: 17, rotation: 90);
      }
      final seam = _stroke(const Color(0x408D7DA7), .7);
      for (final x in [-13.0, 13.0]) {
        canvas.drawLine(Offset(x, -42), Offset(x, -26), seam);
        if (!openEnd && !uBooth) {
          canvas.drawLine(Offset(x, 26), Offset(x, 42), seam);
        }
      }
    } else if (paired) {
      for (final x in [-16.0, 16.0]) {
        _seat(canvas, x, -27);
        _seat(canvas, x, 27, rotation: 180);
      }
    } else {
      for (final angle in [0.0, 90.0, 180.0, 270.0]) {
        canvas.save();
        canvas.rotate(angle * math.pi / 180);
        _seat(
          canvas,
          0,
          compact ? -18 : -29,
          width: compact ? 15 : 23,
          height: compact ? 9 : 15,
        );
        canvas.restore();
      }
    }
    final bounds = Rect.fromCenter(
      center: Offset.zero,
      width: tableWidth,
      height: tableHeight,
    );
    final top = RRect.fromRectAndRadius(bounds, const Radius.circular(2.5));
    canvas.drawShadow(Path()..addRRect(top), const Color(0x610B0912), 3, false);
    canvas.drawRRect(
      top.shift(const Offset(0, 2)),
      _fill(const Color(0xFF1C1826)),
    );
    final tabletop = selected
        ? _fill(SeatMapColors.lavender)
        : (Paint()
            ..shader = const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF322944), Color(0xFF2D263D), Color(0xFF282336)],
              stops: [0, .45, 1],
            ).createShader(bounds));
    canvas.drawRRect(top, tabletop);
    canvas.drawRRect(top, _stroke(const Color(0xFF8070A1), .9));
    if (paired) {
      canvas.drawLine(
        Offset(0, -tableHeight / 2),
        Offset(0, tableHeight / 2),
        _stroke(const Color(0x80201B2B), 1.1),
      );
    }
    if (selected) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(bounds.inflate(2.5), const Radius.circular(5)),
        _stroke(SeatMapColors.lavender, 3.5),
      );
    }
    canvas.restore();

    final labelWidth = compact ? 36.0 : width - 12;
    final fontSize = math.min(
      compact ? 11.0 : 15.0,
      labelWidth / math.max(1, label.length * .7),
    );
    final ink = selected ? const Color(0xFF161121) : SeatMapColors.text;
    _label(
      canvas,
      label,
      Offset(0, compact ? 0 : -2),
      fontSize: fontSize,
      color: ink,
      weight: FontWeight.w700,
      spacing: -.4,
      outline: !selected,
    );
    canvas.save();
    canvas.translate(0, compact ? 10 : 11);
    canvas.drawCircle(const Offset(-7, -3.5), 1.6, _fill(ink));
    canvas.drawPath(
      Path()
        ..moveTo(-10, 1)
        ..cubicTo(-10, -3, -4, -3, -4, 1)
        ..close(),
      _fill(ink),
    );
    _label(
      canvas,
      '$seats',
      const Offset(3, 1),
      fontSize: compact ? 7 : 9,
      color: ink.withValues(alpha: .85),
      weight: FontWeight.w600,
      outline: !selected,
    );
    canvas.restore();
    if (selected) {
      canvas.save();
      canvas.translate(compact ? 18 : 28, compact ? -18 : -22);
      canvas.drawCircle(
        Offset.zero,
        compact ? 5 : 7,
        _fill(SeatMapColors.lavender),
      );
      canvas.drawCircle(
        Offset.zero,
        compact ? 5 : 7,
        _stroke(const Color(0xFF181725), 1.2),
      );
      canvas.drawPath(
        Path()
          ..moveTo(-3, 0)
          ..lineTo(-1, 2)
          ..lineTo(3, -2),
        _stroke(const Color(0xFF161121), 1.35)
          ..strokeCap = StrokeCap.round
          ..strokeJoin = StrokeJoin.round,
      );
      canvas.restore();
    }
    canvas.restore();
  }

  static void _seat(
    Canvas canvas,
    double x,
    double y, {
    double width = 22,
    double height = 16,
    double rotation = 0,
  }) {
    canvas.save();
    canvas.translate(x, y);
    canvas.rotate(rotation * math.pi / 180);
    final bounds = Rect.fromCenter(
      center: Offset.zero,
      width: width,
      height: height,
    );
    final seat = RRect.fromRectAndRadius(bounds, const Radius.circular(3.5));
    canvas.drawShadow(
      Path()..addRRect(seat),
      const Color(0x3D0B0912),
      2,
      false,
    );
    canvas.drawRRect(seat, _fill(const Color(0xFF332D40)));
    canvas.drawRRect(seat, _stroke(const Color(0xFF221E2E), 1.2));
    final inner = RRect.fromRectAndRadius(
      bounds.deflate(2),
      const Radius.circular(2.5),
    );
    canvas.drawRRect(inner, _upholstery(inner.outerRect));
    canvas.drawLine(
      Offset(-width / 2 + 3, -height / 2 + 3),
      Offset(width / 2 - 3, -height / 2 + 3),
      _stroke(const Color(0x408D7DA7), 1),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(CofeinTablePainter oldDelegate) =>
      width != oldDelegate.width ||
      height != oldDelegate.height ||
      kind != oldDelegate.kind ||
      rotation != oldDelegate.rotation ||
      compact != oldDelegate.compact ||
      openEnd != oldDelegate.openEnd ||
      label != oldDelegate.label ||
      seats != oldDelegate.seats ||
      selected != oldDelegate.selected;
}

Paint _fill(Color color) => Paint()..color = color;

Paint _stroke(Color color, double width) => Paint()
  ..color = color
  ..style = PaintingStyle.stroke
  ..strokeWidth = width
  ..strokeCap = StrokeCap.square
  ..strokeJoin = StrokeJoin.miter;

Paint _upholstery(Rect bounds) => Paint()
  ..shader = const LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF59506C), Color(0xFF4A405D), Color(0xFF393047)],
    stops: [0, .3, 1],
  ).createShader(bounds);

void _label(
  Canvas canvas,
  String value,
  Offset position, {
  double rotation = 0,
  required double fontSize,
  required Color color,
  FontWeight weight = FontWeight.w500,
  double spacing = 0,
  bool start = false,
  bool outline = false,
}) {
  canvas.save();
  canvas.translate(position.dx, position.dy);
  canvas.rotate(rotation * math.pi / 180);
  final style = TextStyle(
    fontFamily: 'Inter',
    fontSize: fontSize,
    fontWeight: weight,
    letterSpacing: spacing,
    color: color,
    height: 1,
  );
  final painter = TextPainter(
    text: TextSpan(text: value, style: style),
    textDirection: TextDirection.ltr,
    maxLines: 1,
  )..layout();
  final origin = Offset(
    start ? 0 : -painter.width / 2,
    -painter.computeDistanceToActualBaseline(TextBaseline.alphabetic),
  );
  if (outline) {
    final border = TextPainter(
      text: TextSpan(
        text: value,
        style: TextStyle(
          fontFamily: 'Inter',
          fontSize: fontSize,
          fontWeight: weight,
          letterSpacing: spacing,
          height: 1,
          foreground: _stroke(const Color(0xFF161121), .45),
        ),
      ),
      textDirection: TextDirection.ltr,
      maxLines: 1,
    )..layout();
    border.paint(canvas, origin);
    border.dispose();
  }
  painter.paint(canvas, origin);
  painter.dispose();
  canvas.restore();
}

/// Small parser for the static, absolute M/L/H/V/Z building outlines above.
/// Kept intentionally separate from live data, which never contains SVG paths.
Path _planPath(String source) {
  final tokens = RegExp(r'[MLHVZ]|-?\d+(?:\.\d+)?')
      .allMatches(source)
      .map((match) => match.group(0)!)
      .toList();
  final path = Path();
  var cursor = 0;
  var command = '';
  var x = 0.0;
  var y = 0.0;
  var start = Offset.zero;
  double number() => double.parse(tokens[cursor++]);
  while (cursor < tokens.length) {
    if ('MLHVZ'.contains(tokens[cursor])) command = tokens[cursor++];
    switch (command) {
      case 'M':
        x = number();
        y = number();
        path.moveTo(x, y);
        start = Offset(x, y);
        command = 'L';
      case 'L':
        x = number();
        y = number();
        path.lineTo(x, y);
      case 'H':
        x = number();
        path.lineTo(x, y);
      case 'V':
        y = number();
        path.lineTo(x, y);
      case 'Z':
        path.close();
        x = start.dx;
        y = start.dy;
        command = '';
      default:
        throw FormatException('Unsupported architectural path command', source);
    }
  }
  return path;
}
