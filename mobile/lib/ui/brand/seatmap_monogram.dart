import 'dart:ui' as ui;

import 'package:material_ui/material_ui.dart';

/// Native vector layers of the approved SeatMap artwork.
///
/// Coordinates follow assets/brand/seatmap-mark.png (676 × 452). The shared
/// vertical stroke connects S and M; its one-unit overlap prevents a hairline
/// seam when the two animated layers meet. The tabletop is independent so the
/// reservation/table motif can assemble with the initials.
abstract final class SeatMapMonogramGeometry {
  static const size = Size(676, 452);
  static const bounds = Rect.fromLTWH(0, 0, 676, 452);
  static const tabletopBounds = Rect.fromLTWH(301.5, 271.5, 246.5, 35.5);
  static const tabletopCenter = Offset(424.75, 289.25);

  static final Path sPath = Path()
    ..fillType = PathFillType.evenOdd
    // The broad, rounded S and its shared stem.
    ..moveTo(142, 19)
    ..lineTo(292, 19)
    ..lineTo(292, 258.5)
    ..cubicTo(282, 266, 276.5, 277, 276.5, 289)
    ..cubicTo(276.5, 311.5, 294.5, 329.5, 317, 329.5)
    ..lineTo(340, 329.5)
    ..cubicTo(372.5, 329.5, 398.5, 354.5, 398.5, 386)
    ..lineTo(398.5, 396)
    ..cubicTo(398.5, 418.5, 385, 433, 365, 433)
    ..lineTo(109, 433)
    ..cubicTo(59, 433, 22.5, 399, 22.5, 349)
    ..cubicTo(22.5, 329, 31.5, 318, 47.5, 324.5)
    ..cubicTo(75, 336, 96.5, 341, 123.5, 341)
    ..lineTo(170.5, 341)
    ..cubicTo(190.5, 341, 205.5, 327, 205.5, 307)
    ..cubicTo(205.5, 292, 195.5, 279, 177, 273.5)
    ..lineTo(99.5, 251)
    ..cubicTo(49.5, 236.5, 19, 202, 19, 144)
    ..cubicTo(19, 77, 72, 28, 123.5, 20.5)
    ..cubicTo(129.5, 19.5, 136, 19, 142, 19)
    ..close()
    // Generous upper counter, kept transparent rather than painted dark.
    ..moveTo(248.5, 104)
    ..lineTo(143, 104)
    ..cubicTo(121.5, 104, 104, 121.5, 104, 143)
    ..cubicTo(104, 159.5, 115, 171, 132, 176)
    ..lineTo(195, 195)
    ..cubicTo(218, 202, 235.5, 212, 248.5, 222)
    ..close();

  static final Path mPath = Path()
    ..moveTo(291, 19)
    ..cubicTo(316, 19, 335, 29, 354, 48)
    ..lineTo(447, 140)
    ..quadraticBezierTo(449.5, 143.5, 452, 140)
    ..lineTo(542, 40)
    ..cubicTo(555, 26, 572, 19, 591, 19)
    ..lineTo(601, 19)
    ..cubicTo(633, 19, 657, 42, 657, 73)
    ..lineTo(657, 391)
    ..cubicTo(657, 414.5, 641, 433, 619, 433)
    ..lineTo(487, 433)
    ..cubicTo(464, 433, 451.5, 416, 451.5, 393)
    ..lineTo(451.5, 385)
    ..cubicTo(451.5, 354, 476, 329.5, 507, 329.5)
    ..lineTo(532, 329.5)
    ..cubicTo(551, 329.5, 563, 316, 563, 293)
    ..lineTo(563, 153)
    ..quadraticBezierTo(563, 150, 560.5, 153)
    ..lineTo(473, 244)
    ..cubicTo(460, 258, 441, 259, 429, 245)
    ..lineTo(341.5, 153)
    ..quadraticBezierTo(339, 150, 339, 153)
    ..lineTo(339, 249.5)
    ..lineTo(318, 249.5)
    ..cubicTo(308, 249.5, 299, 252.5, 291, 259.5)
    ..close();

  static final Path tabletopPath = Path()
    ..addRRect(
      RRect.fromRectAndRadius(tabletopBounds, const Radius.circular(17.75)),
    );
}

/// Paints the approved connected monogram without a raster or video dependency.
///
/// The artwork is centered with a contain fit. Offsets and [tableLift] use the
/// canonical 676 × 452 coordinate system; positive lift raises the tabletop.
/// [tableProgress] reveals its width from the center. Values are clamped so
/// easing curves with overshoot cannot introduce invalid alpha or geometry.
class SeatMapMonogramPainter extends CustomPainter {
  const SeatMapMonogramPainter({
    this.sOpacity = 1,
    this.sOffset = Offset.zero,
    this.mOpacity = 1,
    this.mOffset = Offset.zero,
    this.tableProgress = 1,
    this.tableOpacity = 1,
    this.tableLift = 0,
    this.glow = 0,
  });

  final double sOpacity;
  final Offset sOffset;
  final double mOpacity;
  final Offset mOffset;
  final double tableProgress;
  final double tableOpacity;
  final double tableLift;
  final double glow;

  static const _lavender = Color(0xFFC0A8FF);
  static const _violet = Color(0xFFB98AF8);
  static const _lime = Color(0xFFD9FF57);

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;
    final scale = (size.width / SeatMapMonogramGeometry.size.width).clamp(
      0.0,
      size.height / SeatMapMonogramGeometry.size.height,
    );
    if (scale <= 0) return;
    canvas.save();
    canvas.translate(
      (size.width - SeatMapMonogramGeometry.size.width * scale) / 2,
      (size.height - SeatMapMonogramGeometry.size.height * scale) / 2,
    );
    canvas.scale(scale);

    final letterShader = ui.Gradient.linear(
      const Offset(64, 38),
      const Offset(601, 430),
      const [_lavender, _violet, _lavender],
      const [0, .52, 1],
    );
    _paintLetter(
      canvas,
      SeatMapMonogramGeometry.sPath,
      sOffset,
      sOpacity,
      letterShader,
    );
    _paintLetter(
      canvas,
      SeatMapMonogramGeometry.mPath,
      mOffset,
      mOpacity,
      letterShader,
    );

    final reveal = tableProgress.clamp(0.0, 1.0);
    final alpha = tableOpacity.clamp(0.0, 1.0);
    if (reveal > 0 && alpha > 0) {
      final center = SeatMapMonogramGeometry.tabletopCenter;
      canvas.save();
      canvas.translate(center.dx, center.dy - tableLift);
      canvas.scale(reveal, 1);
      canvas.translate(-center.dx, -center.dy);
      final halo = glow.clamp(0.0, 1.0);
      if (halo > 0) {
        canvas.drawPath(
          SeatMapMonogramGeometry.tabletopPath,
          Paint()
            ..color = _lime.withValues(alpha: .30 * halo * alpha)
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 15),
        );
      }
      canvas.drawPath(
        SeatMapMonogramGeometry.tabletopPath,
        Paint()
          ..color = Colors.white.withValues(alpha: alpha)
          ..shader = ui.Gradient.linear(
            const Offset(302, 272),
            const Offset(548, 307),
            const [Color(0xFFE3FF72), _lime],
          ),
      );
      canvas.restore();
    }
    canvas.restore();
  }

  void _paintLetter(
    Canvas canvas,
    Path path,
    Offset offset,
    double opacity,
    ui.Shader shader,
  ) {
    final alpha = opacity.clamp(0.0, 1.0);
    if (alpha == 0) return;
    canvas.save();
    canvas.translate(offset.dx, offset.dy);
    canvas.drawPath(
      path,
      Paint()
        ..color = Colors.white.withValues(alpha: alpha)
        ..shader = shader,
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant SeatMapMonogramPainter oldDelegate) =>
      oldDelegate.sOpacity != sOpacity ||
      oldDelegate.sOffset != sOffset ||
      oldDelegate.mOpacity != mOpacity ||
      oldDelegate.mOffset != mOffset ||
      oldDelegate.tableProgress != tableProgress ||
      oldDelegate.tableOpacity != tableOpacity ||
      oldDelegate.tableLift != tableLift ||
      oldDelegate.glow != glow;
}
