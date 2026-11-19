import 'dart:ui';
import 'dart:typed_data';

/// A single, continuous outline between a font glyph and the brand artwork.
/// Contours are sampled and paired once, not on every animation frame.
class SeatMapLetterMorph {
  SeatMapLetterMorph(this.source, this.destination) {
    final sourceBounds = source.getBounds();
    final destinationBounds = destination.getBounds();
    final sourceContour = source.computeMetrics().first;
    final destinationContours = destination.computeMetrics().toList();
    _start = _sample(sourceContour, sourceBounds);
    final end = _sample(destinationContours.first, destinationBounds);
    _end = _match(_start, end);
    _counters = destinationContours
        .skip(1)
        .map((contour) => _sample(contour, destinationBounds))
        .toList();
  }

  final Path source;
  final Path destination;
  static const _points = 180;
  late final List<Offset> _start;
  late final List<Offset> _end;
  late final List<List<Offset>> _counters;

  Path at(double progress, Rect startBounds, Rect endBounds) {
    final p = progress.clamp(0.0, 1.0);
    if (p == 0) return _fit(source, startBounds);
    if (p == 1) return _fit(destination, endBounds);
    final bounds = Rect.lerp(startBounds, endBounds, p)!;
    var path = Path();
    void contour(List<Offset> points) {
      for (var i = 0; i < points.length; i++) {
        final point = Offset(
          bounds.left + points[i].dx * bounds.width,
          bounds.top + points[i].dy * bounds.height,
        );
        if (i == 0) {
          path.moveTo(point.dx, point.dy);
        } else {
          path.lineTo(point.dx, point.dy);
        }
      }
      path.close();
    }

    contour(List.generate(_points, (i) => Offset.lerp(_start[i], _end[i], p)!));
    // The S counter opens as the initial broadens into the connected monogram.
    final open = ((p - .48) / .52).clamp(0.0, 1.0);
    for (final counter in _counters) {
      if (open == 0) continue;
      final outline = path;
      path = Path();
      final center =
          counter.reduce((a, b) => a + b) / counter.length.toDouble();
      contour(
        counter.map((point) => Offset.lerp(center, point, open)!).toList(),
      );
      // Keep the opening inside the evolving silhouette; even-odd fill would
      // turn an opening outside the outline into a stray floating fragment.
      path = Path.combine(PathOperation.difference, outline, path);
    }
    return path;
  }

  static List<Offset> _sample(PathMetric contour, Rect bounds) =>
      List.generate(_points, (i) {
        final point = contour
            .getTangentForOffset(contour.length * i / _points)!
            .position;
        return Offset(
          (point.dx - bounds.left) / bounds.width,
          (point.dy - bounds.top) / bounds.height,
        );
      });

  // Align contour direction and start points to avoid twisting the letter.
  static List<Offset> _match(List<Offset> source, List<Offset> target) {
    var score = double.infinity;
    var bestShift = 0;
    var bestDirection = 1;
    for (final direction in [1, -1]) {
      for (var shift = 0; shift < _points; shift++) {
        var distance = 0.0;
        for (var i = 0; i < _points; i++) {
          distance += (source[i] - target[(shift + i * direction) % _points])
              .distanceSquared;
        }
        if (distance < score) {
          score = distance;
          bestShift = shift;
          bestDirection = direction;
        }
      }
    }
    return List.generate(
      _points,
      (i) => target[(bestShift + i * bestDirection) % _points],
    );
  }

  static Path _fit(Path path, Rect bounds) {
    final original = path.getBounds();
    final sx = bounds.width / original.width;
    final sy = bounds.height / original.height;
    return path.transform(
      Float64List.fromList([
        sx,
        0,
        0,
        0,
        0,
        sy,
        0,
        0,
        0,
        0,
        1,
        0,
        bounds.left - original.left * sx,
        bounds.top - original.top * sy,
        0,
        1,
      ]),
    );
  }
}
