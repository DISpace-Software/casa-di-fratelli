import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:material_ui/material_ui.dart';

import '../theme.dart';
import '../motion.dart';
import 'seatmap_initial_paths.dart';
import 'seatmap_letter_morph.dart';
import 'seatmap_monogram.dart';

/// A bounded, cold-launch brand animation. Data loads behind it independently.
/// Tapping anywhere continues immediately; reduced motion shows a brief still.
class SeatMapLaunchIntro extends StatefulWidget {
  const SeatMapLaunchIntro({super.key, required this.onComplete});

  static const duration = Duration(milliseconds: 2800);
  final VoidCallback onComplete;

  @override
  State<SeatMapLaunchIntro> createState() => _SeatMapLaunchIntroState();
}

class _SeatMapLaunchIntroState extends State<SeatMapLaunchIntro>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller =
      AnimationController(vsync: this, duration: SeatMapLaunchIntro.duration)
        ..addStatusListener((status) {
          if (status == AnimationStatus.completed) _complete();
        });
  bool _started = false;
  bool _finished = false;
  bool _reduceMotion = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reduceMotion =
        reduceSeatMapMotion(context) ||
        MediaQuery.accessibleNavigationOf(context);
    if (!_started || (reduceMotion && !_reduceMotion)) {
      _started = true;
      _reduceMotion = reduceMotion;
      _controller.duration = reduceMotion
          ? const Duration(milliseconds: 200)
          : SeatMapLaunchIntro.duration;
      _controller.forward(from: 0);
    }
  }

  void _complete() {
    if (_finished) return;
    _finished = true;
    _controller.stop();
    widget.onComplete();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => BlockSemantics(
    child: Semantics(
      container: true,
      button: true,
      label:
          'SeatMap. ${MaterialLocalizations.of(context).continueButtonLabel}',
      onTap: _complete,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        excludeFromSemantics: true,
        onTap: _complete,
        child: RepaintBoundary(
          child: AnimatedBuilder(
            animation: _controller,
            builder: (context, _) => Opacity(
              opacity:
                  1 - _phase(_controller.value, _reduceMotion ? .35 : .86, 1),
              child: ColoredBox(
                color: SeatMapColors.background,
                child: CustomPaint(
                  painter: _LaunchPainter(
                    progress: _controller.value,
                    reducedMotion: _reduceMotion,
                  ),
                  child: const SizedBox.expand(),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

double _phase(
  double t,
  double from,
  double to, [
  Curve curve = Curves.easeInOutCubic,
]) => curve.transform(((t - from) / (to - from)).clamp(0.0, 1.0));

class _LaunchPainter extends CustomPainter {
  const _LaunchPainter({required this.progress, required this.reducedMotion});

  final double progress;
  final bool reducedMotion;
  static const _lime = Color(0xFFD9FF57);
  static final _sMorph = SeatMapLetterMorph(
    SeatMapInitialPaths.sPath,
    SeatMapMonogramGeometry.sPath,
  );
  static final _mMorph = SeatMapLetterMorph(
    SeatMapInitialPaths.mPath,
    SeatMapMonogramGeometry.mPath,
  );

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;
    // The composition fits small phones and landscape, without cropping the M.
    final width = math.min(
      300.0,
      math.min(size.width * .76, size.height * .62),
    );
    final scale = width / SeatMapMonogramGeometry.size.width;
    final height = SeatMapMonogramGeometry.size.height * scale;
    final center = Offset(size.width / 2, size.height / 2 - 12);
    final origin = center - Offset(width / 2, height / 2);
    if (reducedMotion) {
      canvas.save();
      canvas.translate(origin.dx, origin.dy);
      const SeatMapMonogramPainter().paint(canvas, Size(width, height));
      canvas.restore();
      return;
    }

    final t = progress;
    final entrance = _phase(t, 0, .16, Curves.easeOutCubic);
    final merge = _phase(t, .35, .64, Curves.easeInOutCubic);

    // A quiet pool of light follows the assembly, then falls away for the hold.
    final halo = entrance * (.45 + .55 * math.sin(t * math.pi));
    canvas.drawCircle(
      center,
      width * .85,
      Paint()
        ..shader = ui.Gradient.radial(
          center,
          width * .85,
          [
            SeatMapColors.lavender.withValues(alpha: .075 * halo),
            SeatMapColors.lavender.withValues(alpha: .018 * halo),
            SeatMapColors.lavender.withValues(alpha: 0),
          ],
          const [0, .45, 1],
        ),
    );

    // Morph the actual font outlines into the mark: no doubled/crossfaded glyphs.
    if (merge == 1) {
      canvas.save();
      canvas.translate(origin.dx, origin.dy);
      const SeatMapMonogramPainter(tableOpacity: 0)
          .paint(canvas, Size(width, height));
      canvas.restore();
    } else {
      _paintWordmark(canvas, center, width, entrance, merge);
    }

    // The wordmark's lime underline becomes the table in the monogram.
    final tableTravel = _phase(t, .31, .67, Curves.easeInOutCubic);
    final tableReveal = _phase(t, .10, .30, Curves.easeOutCubic);
    final target = origin + SeatMapMonogramGeometry.tabletopCenter * scale;
    final underline = center + Offset(0, width * .18);
    final tableCenter =
        Offset.lerp(underline, target, tableTravel)! +
        Offset(0, -12 * math.sin(tableTravel * math.pi));
    final tableWidth =
        ui.lerpDouble(width * .25, 246.5 * scale, tableTravel)! * tableReveal;
    final tableHeight = ui.lerpDouble(3, 35.5 * scale, tableTravel)!;
    final tableRect = Rect.fromCenter(
      center: tableCenter,
      width: tableWidth,
      height: tableHeight,
    );
    if (tableReveal > 0) {
      final rounded = RRect.fromRectAndRadius(
        tableRect,
        Radius.circular(tableHeight / 2),
      );
      final glow = math.sin(_phase(t, .56, .80) * math.pi);
      canvas.drawRRect(
        rounded,
        Paint()
          ..color = _lime.withValues(alpha: .28 * glow)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 9),
      );
      canvas.drawRRect(
        rounded,
        Paint()
          ..shader = ui.Gradient.linear(
            tableRect.topLeft,
            tableRect.bottomRight,
            const [Color(0xFFE3FF72), _lime],
          ),
      );
      // One brief highlight passes over the completed table, never looping.
      final shimmer = _phase(t, .67, .79);
      if (shimmer > 0 && shimmer < 1) {
        canvas.save();
        canvas.clipRRect(rounded);
        final x = tableRect.left + tableRect.width * shimmer;
        final stripe = Rect.fromLTWH(
          x - 16,
          tableRect.top,
          32,
          tableRect.height,
        );
        canvas.drawRect(
          stripe,
          Paint()
            ..shader = ui.Gradient.linear(
              stripe.centerLeft,
              stripe.centerRight,
              [
                Colors.white.withValues(alpha: 0),
                Colors.white.withValues(alpha: .55),
                Colors.white.withValues(alpha: 0),
              ],
              const [0, .5, 1],
            ),
        );
        canvas.restore();
      }
    }
  }

  void _paintWordmark(
    Canvas canvas,
    Offset center,
    double width,
    double entrance,
    double merge,
  ) {
    final fontSize = width * .177;
    TextPainter letter(String text) => TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(
          fontFamily: 'Inter',
          fontSize: fontSize,
          fontWeight: FontWeight.w700,
          fontVariations: const [ui.FontVariation('opsz', 32)],
          color: SeatMapColors.lavender,
          letterSpacing: -fontSize * .045,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    final seat = letter('Seat');
    final map = letter('Map');
    final gap = fontSize * .13;
    final total = seat.width + gap + map.width;
    final left = center.dx - total / 2;
    final top = center.dy - seat.height / 2 + 14 * (1 - entrance);
    final scale = width / SeatMapMonogramGeometry.size.width;
    final origin =
        center -
        Offset(width / 2, SeatMapMonogramGeometry.size.height * scale / 2);
    final shader = ui.Gradient.linear(
      origin + const Offset(64, 38) * scale,
      origin + const Offset(601, 430) * scale,
      [
        SeatMapColors.lavender,
        Color.lerp(SeatMapColors.lavender, const Color(0xFFB98AF8), merge)!,
        SeatMapColors.lavender,
      ],
      const [0, .52, 1],
    );

    void word(String value, double start, bool isSeat) {
      final initial = letter(value[0]);
      final morph = isSeat ? _sMorph : _mMorph;
      final fontScale = fontSize / 52;
      final baseline = Offset(
        start,
        top + initial.computeDistanceToActualBaseline(TextBaseline.alphabetic),
      );
      Rect placed(Rect rect, Offset offset, double factor) => Rect.fromLTRB(
        offset.dx + rect.left * factor,
        offset.dy + rect.top * factor,
        offset.dx + rect.right * factor,
        offset.dy + rect.bottom * factor,
      );
      final startBounds = placed(morph.source.getBounds(), baseline, fontScale);
      final endBounds = placed(morph.destination.getBounds(), origin, scale);
      canvas.drawPath(
        morph.at(merge, startBounds, endBounds),
        Paint()
          ..shader = shader
          ..color = Colors.white.withValues(alpha: entrance),
      );
      initial.dispose();

      for (var i = 1; i < value.length; i++) {
        final prefix = letter(value.substring(0, i));
        final glyph = letter(value[i]);
        // Outer letters leave first; the surviving initials stay anchored.
        final delay = (value.length - 1 - i) * .022;
        final fade = _phase(progress, .22 + delay, .39 + delay);
        final x = start + prefix.width - prefix.width * .15 * fade;
        final y = top - 10 * fade;
        _drawText(canvas, glyph, Offset(x, y), entrance * (1 - fade));
        prefix.dispose();
        glyph.dispose();
      }
    }

    word('Seat', left, true);
    word('Map', left + seat.width + gap, false);
    seat.dispose();
    map.dispose();
  }

  void _drawText(
    Canvas canvas,
    TextPainter text,
    Offset offset,
    double opacity,
  ) {
    if (opacity <= 0) return;
    canvas.saveLayer(
      (offset & text.size).inflate(2),
      Paint()..color = Colors.white.withValues(alpha: opacity.clamp(0.0, 1.0)),
    );
    text.paint(canvas, offset);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _LaunchPainter oldDelegate) =>
      oldDelegate.progress != progress ||
      oldDelegate.reducedMotion != reducedMotion;
}
