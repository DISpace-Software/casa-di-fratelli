import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';

import '../../domain/cofein_geometry.dart';
import '../../domain/models.dart';
import '../../l10n/language.dart';
import '../theme.dart';
import 'cofein_painters.dart';

/// Cofein's architectural scene uses the same API coordinates as the website.
/// Occupancy only changes interactive furniture, never the camera's geometry.
class CofeinSeatMap extends StatefulWidget {
  const CofeinSeatMap({
    super.key,
    required this.plan,
    required this.zoneId,
    required this.selected,
    required this.onTap,
    this.language = 'bg',
    this.guestCount = 1,
    this.mapHeight = 440,
  });

  final FloorPlan plan;
  final int guestCount;
  final String zoneId, language;
  final Set<String> selected;
  final ValueChanged<SeatTable> onTap;
  final double mapHeight;

  @override
  State<CofeinSeatMap> createState() => _CofeinSeatMapState();
}

class _CofeinSeatMapState extends State<CofeinSeatMap>
    with SingleTickerProviderStateMixin {
  final transformation = TransformationController();
  late final AnimationController animation =
      AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 220),
      )..addListener(() {
        final tween = cameraTween;
        if (tween != null) {
          transformation.value = tween.transform(
            Curves.easeOutCubic.transform(animation.value),
          );
        }
      });
  Matrix4Tween? cameraTween;
  String? selectedView, fitSignature;
  Size viewport = Size.zero;
  Rect cameraBounds = Rect.zero;
  double fitScale = 1;

  @override
  void didUpdateWidget(covariant CofeinSeatMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.zoneId != widget.zoneId) selectedView = null;
  }

  @override
  void dispose() {
    animation.dispose();
    transformation.dispose();
    super.dispose();
  }

  Matrix4 _fitMatrix() => Matrix4.identity()
    ..setEntry(0, 0, fitScale)
    ..setEntry(1, 1, fitScale)
    ..setEntry(0, 3, viewport.width / 2 - cameraBounds.center.dx * fitScale)
    ..setEntry(1, 3, viewport.height / 2 - cameraBounds.center.dy * fitScale);

  void _animateCamera(Matrix4 target) {
    animation.stop();
    cameraTween = Matrix4Tween(
      begin: transformation.value.clone(),
      end: target,
    );
    animation.forward(from: 0);
  }

  void _zoom(double factor) {
    final current = transformation.value;
    final scale = current.getMaxScaleOnAxis();
    final next = (scale * factor).clamp(fitScale * .7, 4.0);
    final center = viewport.center(Offset.zero);
    final ratio = next / scale;
    _animateCamera(
      Matrix4.identity()
        ..setEntry(0, 0, next)
        ..setEntry(1, 1, next)
        ..setEntry(0, 3, center.dx - (center.dx - current.entry(0, 3)) * ratio)
        ..setEntry(1, 3, center.dy - (center.dy - current.entry(1, 3)) * ratio),
    );
  }

  @override
  Widget build(BuildContext context) {
    final geometry = getCofeinMapGeometry(
      widget.plan.zones,
      widget.plan.tables,
    );
    final views = getCofeinBookingViews(
      geometry,
      widget.zoneId,
      widget.plan.tables,
    );
    final view =
        views.where((v) => v.id == selectedView).firstOrNull ??
        views.firstOrNull;
    if (view == null) return const SizedBox.shrink();
    final furniture = widget.plan.tables
        .where(
          (table) =>
              table.zoneId == widget.zoneId &&
              !table.occupied &&
              table.capacity >= widget.guestCount &&
              view.tableIds.contains(table.id),
        )
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (views.length > 1) ...[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (var index = 0; index < views.length; index++) ...[
                if (index > 0) const SizedBox(width: 8),
                Expanded(child: _viewCard(geometry, views[index], view.id)),
              ],
            ],
          ),
          const SizedBox(height: 12),
        ],
        Container(
          height: widget.mapHeight,
          decoration: BoxDecoration(
            color: const Color(0xFF181725),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: const Color(0xFF8270B1).withValues(alpha: .5),
            ),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(21),
            child: LayoutBuilder(
              builder: (context, constraints) {
                viewport = Size(constraints.maxWidth, constraints.maxHeight);
                cameraBounds = view.bounds;
                fitScale = math.min(
                  viewport.width / cameraBounds.width,
                  viewport.height / cameraBounds.height,
                );
                final signature = '${view.id}|${view.bounds}|$viewport';
                if (fitSignature != signature) {
                  animation.stop();
                  fitSignature = signature;
                  transformation.value = _fitMatrix();
                }
                return Stack(
                  key: const ValueKey('cofein-map-viewport'),
                  children: [
                    Positioned.fill(
                      child: InteractiveViewer(
                        transformationController: transformation,
                        constrained: false,
                        minScale: fitScale * .7,
                        maxScale: 4,
                        boundaryMargin: EdgeInsets.all(
                          math.max(geometry.world.width, geometry.world.height),
                        ),
                        onInteractionStart: (_) => animation.stop(),
                        child: AnimatedBuilder(
                          animation: transformation,
                          builder: (context, _) {
                            final scale = transformation.value
                                .getMaxScaleOnAxis();
                            return SizedBox(
                              width: geometry.world.width,
                              height: geometry.world.height,
                              child: Stack(
                                clipBehavior: Clip.none,
                                children: [
                                  Positioned.fill(
                                    child: RepaintBoundary(
                                      child: CustomPaint(
                                        isComplex: true,
                                        painter: _ScenePainter(
                                          geometry: geometry,
                                          language: widget.language,
                                          landmarks: widget.plan.landmarks
                                              .where(
                                                (item) =>
                                                    item.zoneId ==
                                                    widget.zoneId,
                                              )
                                              .toList(),
                                        ),
                                      ),
                                    ),
                                  ),
                                  for (final table in furniture)
                                    _table(table, geometry, scale),
                                ],
                              ),
                            );
                          },
                        ),
                      ),
                    ),
                    Positioned(
                      top: 10,
                      right: 10,
                      child: Container(
                        decoration: BoxDecoration(
                          color: const Color(0xFF26243B).withValues(alpha: .96),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: const Color(0xFF49405C)),
                          boxShadow: const [
                            BoxShadow(
                              color: Color(0x40000000),
                              blurRadius: 14,
                              offset: Offset(0, 3),
                            ),
                          ],
                        ),
                        child: Column(
                          children: [
                            _control(
                              'cofein-zoom-in',
                              context.l10n.mapZoomIn,
                              Icons.add_rounded,
                              () => _zoom(1.3),
                            ),
                            _control(
                              'cofein-zoom-out',
                              context.l10n.mapZoomOut,
                              Icons.remove_rounded,
                              () => _zoom(1 / 1.3),
                            ),
                            _control(
                              'cofein-fit',
                              context.l10n.msgFitEntireRoom,
                              Icons.fit_screen_rounded,
                              () => _animateCamera(_fitMatrix()),
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (furniture.isEmpty)
                      Positioned(
                        left: 16,
                        right: 66,
                        bottom: 18,
                        child: Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFF26243B),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Text(
                            context.l10n.cofeinNoTablesInPart,
                            style: const TextStyle(
                              color: Color(0xFFF5F2FC),
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          context.l10n.cofeinMapGestureHint,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: SeatMapColors.muted,
            fontSize: 10,
            height: 1.5,
          ),
        ),
      ],
    );
  }

  Widget _control(
    String key,
    String label,
    IconData icon,
    VoidCallback onTap,
  ) => IconButton(
    key: ValueKey(key),
    tooltip: label,
    constraints: const BoxConstraints.tightFor(width: 44, height: 44),
    onPressed: onTap,
    icon: Icon(icon, size: 21, color: const Color(0xFFC0A8FF)),
  );

  Widget _viewCard(
    CofeinMapGeometry geometry,
    CofeinMapView view,
    String active,
  ) {
    final chosen = view.id == active;
    final available = widget.plan.tables
        .where(
          (table) =>
              view.tableIds.contains(table.id) &&
              !table.occupied &&
              table.capacity >= widget.guestCount,
        )
        .length;
    return Semantics(
      selected: chosen,
      child: Material(
        color: chosen ? const Color(0xFF332A4E) : SeatMapColors.surface,
        borderRadius: BorderRadius.circular(15),
        child: InkWell(
          key: ValueKey('cofein-view-${view.id}'),
          borderRadius: BorderRadius.circular(15),
          onTap: () => setState(() => selectedView = view.id),
          child: Container(
            constraints: const BoxConstraints(minHeight: 66),
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(15),
              border: Border.all(
                color: chosen ? const Color(0xFFC0A8FF) : SeatMapColors.line,
              ),
            ),
            child: Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(7),
                  child: SizedBox(
                    width: 31,
                    height: 46,
                    child: CustomPaint(
                      painter: _ScenePainter(
                        geometry: geometry,
                        language: widget.language,
                        crop: view.bounds,
                        tables: widget.plan.tables
                            .where(
                              (t) =>
                                  view.tableIds.contains(t.id) &&
                                  !t.occupied &&
                                  t.capacity >= widget.guestCount,
                            )
                            .toList(),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 7),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        view.label(widget.language),
                        maxLines: 3,
                        style: TextStyle(
                          fontSize: 11,
                          height: 1.2,
                          fontWeight: FontWeight.w600,
                          color: chosen
                              ? const Color(0xFFE3D8FF)
                              : SeatMapColors.text,
                        ),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        context.l10n.cofeinAvailableTables(available),
                        style: const TextStyle(
                          fontSize: 10,
                          color: SeatMapColors.muted,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _table(SeatTable table, CofeinMapGeometry geometry, double scale) {
    final placement = projectCofeinTable(table, geometry)!;
    final width = math.max(placement.size.width, 44 / scale);
    final height = math.max(placement.size.height, 44 / scale);
    final selected = widget.selected.contains(table.id);
    return Positioned(
      left: placement.center.dx - width / 2,
      top: placement.center.dy - height / 2,
      width: width,
      height: height,
      child: Semantics(
        button: true,
        enabled: true,
        selected: selected,
        label: context.l10n.msgTablePPSeatsP(
          table.label,
          '${table.capacity}',
          selected ? context.l10n.msgSelected : context.l10n.msgAvailable,
        ),
        child: GestureDetector(
          key: ValueKey('cofein-table-${table.id}'),
          behavior: HitTestBehavior.opaque,
          onTap: () => widget.onTap(table),
          child: Center(
            child: SizedBox.fromSize(
              size: placement.size,
              child: CustomPaint(
                painter: _furniture(table, placement, selected),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

CofeinTablePainter _furniture(
  SeatTable table,
  CofeinTablePlacement p,
  bool selected,
) => CofeinTablePainter(
  width: p.size.width,
  height: p.size.height,
  kind: p.kind,
  rotation: p.rotationDegrees,
  compact: p.compact,
  openEnd: p.openEnd,
  label: table.label,
  seats: table.capacity,
  selected: selected,
);

class _ScenePainter extends CustomPainter {
  const _ScenePainter({
    required this.geometry,
    required this.language,
    this.landmarks = const [],
    this.crop,
    this.tables = const [],
  });
  final CofeinMapGeometry geometry;
  final String language;
  final Rect? crop;
  final List<SeatTable> tables;
  final List<FloorLandmark> landmarks;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(
      Offset.zero & size,
      Paint()..color = const Color(0xFF181725),
    );
    canvas.save();
    if (crop case final bounds?) {
      final scale = math.min(
        size.width / bounds.width,
        size.height / bounds.height,
      );
      canvas.translate(
        size.width / 2 - bounds.center.dx * scale,
        size.height / 2 - bounds.center.dy * scale,
      );
      canvas.scale(scale);
    }
    if (geometry.hasPreset) {
      CofeinArchitecturePainter(
        language: language,
        zoneNames: {for (final zone in geometry.zones) zone.id: zone.name},
      ).paint(canvas, const Size(900, 1600));
    }
    for (final zone in geometry.zones.where((z) => !z.preset)) {
      final rect = zone.bounds;
      canvas.drawRRect(
        RRect.fromRectAndRadius(rect, const Radius.circular(18)),
        Paint()..color = const Color(0xFF1F1C2C),
      );
      final grid = Paint()
        ..color = const Color(0x147E7099)
        ..strokeWidth = 1;
      for (var x = rect.left + 44; x < rect.right; x += 44) {
        canvas.drawLine(Offset(x, rect.top), Offset(x, rect.bottom), grid);
      }
      for (var y = rect.top + 44; y < rect.bottom; y += 44) {
        canvas.drawLine(Offset(rect.left, y), Offset(rect.right, y), grid);
      }
      canvas.drawRRect(
        RRect.fromRectAndRadius(rect, const Radius.circular(18)),
        Paint()
          ..color = const Color(0xFF79708D)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 9,
      );
      final label = TextPainter(
        text: TextSpan(
          text: zone.name,
          style: const TextStyle(
            color: Color(0xFFA7A3BC),
            fontSize: 22,
            fontFamily: 'Inter',
            fontWeight: FontWeight.w700,
          ),
        ),
        textDirection: TextDirection.ltr,
        maxLines: 2,
      )..layout(maxWidth: rect.width - 60);
      label.paint(
        canvas,
        Offset(rect.center.dx - label.width / 2, rect.top + 22),
      );
      label.dispose();
    }
    CofeinLandmarksPainter(
      landmarks: landmarks,
      geometry: geometry,
    ).paint(canvas, geometry.world);
    for (final table in tables) {
      final p = projectCofeinTable(table, geometry);
      if (p == null) continue;
      canvas.save();
      canvas.translate(
        p.center.dx - p.size.width / 2,
        p.center.dy - p.size.height / 2,
      );
      _furniture(table, p, false).paint(canvas, p.size);
      canvas.restore();
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _ScenePainter oldDelegate) =>
      oldDelegate.geometry != geometry ||
      oldDelegate.language != language ||
      oldDelegate.crop != crop ||
      oldDelegate.tables != tables ||
      oldDelegate.landmarks != landmarks;
}
