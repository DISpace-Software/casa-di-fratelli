import '../../l10n/language.dart';

import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import '../../domain/models.dart';
import '../../data/seatmap_repository.dart';
import '../../state/app_controller.dart';
import '../components.dart';
import '../theme.dart';
import 'discovery_screens.dart';
import 'support_screens.dart';

class SeatMapScreen extends StatefulWidget {
  const SeatMapScreen({
    super.key,
    required this.controller,
    required this.restaurant,
    this.onViewBookings,
  });
  final AppController controller;
  final Restaurant restaurant;
  final VoidCallback? onViewBookings;
  @override
  State<SeatMapScreen> createState() => _SeatMapScreenState();
}

class _SeatMapScreenState extends State<SeatMapScreen>
    with WidgetsBindingObserver {
  late FloorPlan plan;
  String zone = '';
  final selected = <String>{};
  bool loading = true;
  String? error;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    plan = widget.restaurant.floorPlan;
    zone = plan.zones.isEmpty ? '' : plan.zones.first.id;
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _load();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final result = await widget.controller.loadAvailability(
        widget.restaurant,
      );
      if (!mounted) return;
      setState(() {
        plan = result;
        if (!plan.zones.any((item) => item.id == zone)) {
          zone = plan.zones.isEmpty ? '' : plan.zones.first.id;
        }
        selected.removeWhere(
          (id) =>
              !plan.tables.any((table) => table.id == id && !table.occupied),
        );
        if (selected.isEmpty &&
            widget.controller.demoMode &&
            widget.controller.guestCount == 2 &&
            plan.tables.any((table) => table.id == '08' && !table.occupied)) {
          selected.add('08');
        }
      });
    } catch (exception) {
      if (mounted) {
        setState(
          () => error = exception.toString().replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  void _select(SeatTable table) {
    if (table.occupied || loading) return;
    HapticFeedback.selectionClick();
    setState(() {
      if (selected.contains(table.id)) {
        selected.remove(table.id);
        return;
      }
      final existing = plan.tables
          .where((item) => selected.contains(item.id))
          .toList();
      if (existing.isEmpty ||
          table.capacity >= widget.controller.guestCount ||
          existing.fold(0, (sum, item) => sum + item.capacity) >=
              widget.controller.guestCount) {
        selected.clear();
      }
      final candidate = {...selected, table.id};
      if (candidate.length > 1 &&
          !plan.combinations.any(
            (combination) => candidate.every(combination.contains),
          )) {
        selected.clear();
      }
      selected.add(table.id);
    });
  }

  @override
  Widget build(BuildContext context) {
    final tables = plan.tables.where((table) => table.zoneId == zone).toList();
    final selection = plan.tables
        .where((table) => selected.contains(table.id))
        .toList();
    final valid =
        SeatMapRepository.canSelect(
          plan,
          selection,
          widget.controller.guestCount,
        ) &&
        error == null &&
        !loading;
    final selectionText = selection.isEmpty
        ? context.l10n.msgChooseYourTable
        : '${selection.length == 1 ? context.l10n.msgTable : context.l10n.msgTables} ${selection.map((table) => table.label).join(' + ')}';
    return Scaffold(
      body: Padding(
        padding: EdgeInsets.only(top: topInset(context)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(24, 11, 24, 0),
              child: Row(
                children: [
                  CircleButton(
                    icon: Icons.chevron_left_rounded,
                    onTap: () => Navigator.pop(context),
                  ),
                  SizedBox(width: 9),
                  Expanded(
                    child: Text(
                      widget.restaurant.name,
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: context.l10n.msgRefreshAvailability,
                    constraints: BoxConstraints.tightFor(width: 40, height: 40),
                    padding: EdgeInsets.zero,
                    onPressed: loading ? null : _load,
                    icon: Icon(
                      Icons.refresh_rounded,
                      size: 20,
                      color: SeatMapColors.muted,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                padding: EdgeInsets.fromLTRB(24, 22, 24, 15),
                children: [
                  Text(
                    context.l10n.msgChooseYourTable,
                    style: TextStyle(
                      fontSize: 29,
                      height: 1.15,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -.85,
                    ),
                  ),
                  SizedBox(height: 7),
                  InkWell(
                    onTap: () async {
                      await chooseTime(
                        context,
                        widget.controller,
                        restaurant: widget.restaurant,
                      );
                      _load();
                    },
                    child: Text(
                      '${shortDate(widget.controller.selectedDate)} · ${widget.controller.selectedTime} · ${guestLabel(widget.controller.guestCount)}',
                      style: TextStyle(
                        color: SeatMapColors.muted,
                        fontSize: 13,
                      ),
                    ),
                  ),
                  SizedBox(height: 19),
                  SizedBox(
                    height: 36,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: plan.zones.length,
                      separatorBuilder: (_, _) => SizedBox(width: 9),
                      itemBuilder: (context, index) => ChoicePill(
                        plan.zones[index].name,
                        selected: zone == plan.zones[index].id,
                        onTap: () => setState(() {
                          zone = plan.zones[index].id;
                          selected.clear();
                        }),
                        padding: 20,
                      ),
                    ),
                  ),
                  SizedBox(height: 19),
                  if (error != null)
                    Container(
                      height: 365,
                      padding: EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        color: SeatMapColors.surface,
                        borderRadius: BorderRadius.circular(22),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.wifi_off_rounded,
                            color: SeatMapColors.lavender,
                            size: 35,
                          ),
                          SizedBox(height: 15),
                          Text(
                            error!,
                            textAlign: TextAlign.center,
                            style: TextStyle(color: SeatMapColors.muted),
                          ),
                          SizedBox(height: 20),
                          PrimaryButton(
                            label: context.l10n.msgTryAgain246,
                            onPressed: _load,
                            icon: Icons.refresh_rounded,
                          ),
                        ],
                      ),
                    )
                  else if (tables.isEmpty && !loading)
                    Container(
                      height: 365,
                      decoration: BoxDecoration(
                        color: SeatMapColors.surface,
                        borderRadius: BorderRadius.circular(22),
                      ),
                      child: EmptyStateIcon(
                        icon: Icons.chair_alt_outlined,
                        title: context.l10n.msgThisRoomIsNotSetUpYet,
                        text: context
                            .l10n
                            .msgChooseAnotherRoomOrContactTheRestaurant,
                      ),
                    )
                  else
                    AspectRatio(
                      aspectRatio: 342 / 366,
                      child: Stack(
                        children: [
                          Positioned.fill(
                            child: widget.controller.demoMode
                                ? _FloorCanvas(
                                    tables: tables,
                                    selected: selected,
                                    onTap: _select,
                                    demo: true,
                                    terrace: zone == 'terrace',
                                  )
                                : _ZoomableFloorMap(
                                    key: ValueKey('$zone:${plan.revision}'),
                                    tables: tables,
                                    selected: selected,
                                    onTap: _select,
                                  ),
                          ),
                          if (loading)
                            Positioned.fill(
                              child: Container(
                                decoration: BoxDecoration(
                                  color: SeatMapColors.background.withValues(
                                    alpha: .6,
                                  ),
                                  borderRadius: BorderRadius.circular(22),
                                ),
                                child: Center(
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  SizedBox(height: 17),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _Legend(
                        color: Color(0xFF8270B1),
                        label: context.l10n.msgAvailable,
                      ),
                      _Legend(
                        color: Color(0xFF5A566D),
                        label: context.l10n.msgOccupied,
                      ),
                      _Legend(
                        color: SeatMapColors.lavender,
                        label: context.l10n.msgSelected,
                      ),
                    ],
                  ),
                  if (selection.isNotEmpty && !valid && !loading)
                    Padding(
                      padding: EdgeInsets.only(top: 16),
                      child: Text(
                        widget.controller.guestCount > plan.publicMaxGuests
                            ? context.l10n
                                  .msgForPGuestsPleaseContactTheRestaurant(
                                    (widget.controller.guestCount).toString(),
                                  )
                            : context
                                  .l10n
                                  .msgChooseALargerTableOrAnAllowedTable,
                        style: TextStyle(
                          fontSize: 12,
                          color: SeatMapColors.peach,
                          height: 1.4,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: Container(
        padding: EdgeInsets.fromLTRB(24, 18, 24, bottomInset(context) + 10),
        decoration: BoxDecoration(
          color: SeatMapColors.surface,
          border: Border(top: BorderSide(color: SeatMapColors.line)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        selectionText,
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      SizedBox(height: 5),
                      Text(
                        selection.length == 1 &&
                                selection.first.description.isNotEmpty
                            ? selection.first.description
                            : selection.isEmpty
                            ? context.l10n.msgTapAnAvailableTableOnTheMap
                            : context.l10n.msgPSeatsP(
                                (selection.fold(
                                  0,
                                  (sum, table) => sum + table.capacity,
                                )).toString(),
                                (guestLabel(widget.controller.guestCount))
                                    .toString(),
                              ),
                        style: TextStyle(
                          fontSize: 12,
                          color: SeatMapColors.muted,
                        ),
                      ),
                    ],
                  ),
                ),
                ChoicePill(
                  widget.controller.selectedTime,
                  selected: true,
                  height: 33,
                  padding: 16,
                  onTap: () async {
                    await chooseTime(
                      context,
                      widget.controller,
                      restaurant: widget.restaurant,
                    );
                    _load();
                  },
                ),
              ],
            ),
            SizedBox(height: 23),
            PrimaryButton(
              label: context.l10n.msgContinue,
              onPressed: valid
                  ? () async {
                      await Navigator.push(
                        context,
                        MaterialPageRoute<void>(
                          builder: (_) => BookingFormScreen(
                            restaurant: widget.restaurant.copyWith(
                              floorPlan: plan,
                            ),
                            tables: selection,
                            controller: widget.controller,
                            onViewBookings: widget.onViewBookings,
                          ),
                        ),
                      );
                      if (mounted) _load();
                    }
                  : null,
            ),
          ],
        ),
      ),
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.color, required this.label});
  final Color color;
  final String label;
  @override
  Widget build(BuildContext context) => Row(
    children: [
      Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      ),
      SizedBox(width: 7),
      Text(label, style: TextStyle(fontSize: 11, color: SeatMapColors.muted)),
    ],
  );
}

class _ZoomableFloorMap extends StatefulWidget {
  const _ZoomableFloorMap({
    super.key,
    required this.tables,
    required this.selected,
    required this.onTap,
  });
  final List<SeatTable> tables;
  final Set<String> selected;
  final ValueChanged<SeatTable> onTap;
  @override
  State<_ZoomableFloorMap> createState() => _ZoomableFloorMapState();
}

class _ZoomableFloorMapState extends State<_ZoomableFloorMap> {
  final transformation = TransformationController();
  bool fitted = false;
  @override
  void dispose() {
    transformation.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(22),
    child: LayoutBuilder(
      builder: (context, viewport) {
        var width = viewport.maxWidth, height = viewport.maxHeight;
        for (var i = 0; i < widget.tables.length; i++) {
          final first = widget.tables[i];
          for (final second in widget.tables.skip(i + 1)) {
            final dx = (first.x - second.x).abs() / 100,
                dy = (first.y - second.y).abs() / 100;
            final requiredX =
                ((first.wide ? 60 : 44) + (second.wide ? 60 : 44)) / 2 + 13;
            final requiredY = 64.0;
            if (dx * (width - 42) >= requiredX ||
                dy * (height - 20) >= requiredY ||
                (dx == 0 && dy == 0)) {
              continue;
            }
            final nextWidth = dx == 0 ? double.infinity : 42 + requiredX / dx;
            final nextHeight = dy == 0 ? double.infinity : 20 + requiredY / dy;
            if (nextWidth / width < nextHeight / height) {
              width = nextWidth;
            } else {
              height = nextHeight;
            }
          }
        }
        final fit = math.min(
          viewport.maxWidth / width,
          viewport.maxHeight / height,
        );
        if (!fitted) {
          transformation.value = Matrix4.diagonal3Values(fit, fit, 1);
          fitted = true;
        }
        return Stack(
          children: [
            Positioned.fill(
              child: InteractiveViewer(
                transformationController: transformation,
                constrained: false,
                minScale: fit,
                maxScale: 4,
                boundaryMargin: EdgeInsets.all(40),
                child: SizedBox(
                  width: width,
                  height: height,
                  child: _FloorCanvas(
                    tables: widget.tables,
                    selected: widget.selected,
                    onTap: widget.onTap,
                    demo: false,
                    terrace: false,
                  ),
                ),
              ),
            ),
            Positioned(
              top: 8,
              right: 8,
              child: IconButton.filledTonal(
                tooltip: context.l10n.msgFitEntireRoom,
                onPressed: () =>
                    transformation.value = Matrix4.diagonal3Values(fit, fit, 1),
                icon: Icon(Icons.fit_screen_rounded, size: 19),
              ),
            ),
          ],
        );
      },
    ),
  );
}

class _FloorCanvas extends StatelessWidget {
  const _FloorCanvas({
    required this.tables,
    required this.selected,
    required this.onTap,
    required this.demo,
    required this.terrace,
  });
  final List<SeatTable> tables;
  final Set<String> selected;
  final ValueChanged<SeatTable> onTap;
  final bool demo, terrace;
  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(22),
    child: ColoredBox(
      color: Color(0xFF181725),
      child: LayoutBuilder(
        builder: (context, bounds) {
          final width = bounds.maxWidth, height = bounds.maxHeight;
          final innerWidth = width - 42, innerHeight = height - 20;
          return Stack(
            children: [
              Positioned.fill(
                child: CustomPaint(
                  painter: _RoomPainter(demo: demo, terrace: terrace),
                ),
              ),
              for (final table in tables)
                Positioned(
                  left:
                      (21 + innerWidth * table.x / 100 - (table.wide ? 30 : 22))
                          .clamp(0, width - 60),
                  top: (22 + innerHeight * table.y / 100 - 25).clamp(
                    25,
                    height - 60,
                  ),
                  child: Semantics(
                    button: true,
                    selected: selected.contains(table.id),
                    enabled: !table.occupied,
                    label: context.l10n.msgTablePPSeatsP(
                      (table.label).toString(),
                      (table.capacity).toString(),
                      (table.occupied
                              ? context.l10n.msgOccupied259
                              : selected.contains(table.id)
                              ? context.l10n.msgSelected260
                              : context.l10n.msgAvailable261)
                          .toString(),
                    ),
                    child: Tooltip(
                      message: context.l10n.msgTablePPSeatsP262(
                        (table.label).toString(),
                        (table.capacity).toString(),
                        (table.occupied ? context.l10n.msgOccupied263 : '')
                            .toString(),
                      ),
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: table.occupied ? null : () => onTap(table),
                        child: SizedBox(
                          width: table.wide ? 60 : 44,
                          height: 52,
                          child: CustomPaint(
                            painter: _TablePainter(
                              selected: selected.contains(table.id),
                              occupied: table.occupied,
                              wide: table.wide,
                            ),
                            child: Center(
                              child: Text(
                                table.label,
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: selected.contains(table.id)
                                      ? SeatMapColors.background
                                      : table.occupied
                                      ? SeatMapColors.muted
                                      : SeatMapColors.text,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    ),
  );
}

class _RoomPainter extends CustomPainter {
  const _RoomPainter({required this.demo, required this.terrace});
  final bool demo, terrace;
  @override
  void paint(Canvas canvas, Size size) {
    final grid = Paint()
      ..color = Color(0xFF262235)
      ..strokeWidth = .55;
    for (var x = 0.0; x < size.width; x += 20) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), grid);
    }
    for (var y = 0.0; y < size.height; y += 20) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }
    final wall = Paint()
      ..color = Color(0xFF50445F)
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(18, 20, size.width - 36, size.height - 41),
        Radius.circular(18),
      ),
      wall,
    );
    if (!demo) return;
    final window = Paint()
      ..color = Color(0xFF9583AE)
      ..strokeWidth = 2;
    canvas.drawLine(Offset(35, 20), Offset(size.width - 35, 20), window);
    canvas.drawLine(
      Offset(45, size.height - 21),
      Offset(109, size.height - 21),
      window,
    );
    _text(
      canvas,
      terrace ? appStrings.msgTERRACE : appStrings.msgWINDOWS,
      Offset(size.width / 2, 36),
    );
    _text(canvas, appStrings.msgENTRANCE, Offset(76, size.height - 38));
    if (!terrace) {
      final rect = Rect.fromLTWH(
        size.width * .66,
        size.height * .625,
        size.width * .23,
        55,
      );
      canvas.drawRRect(
        RRect.fromRectAndRadius(rect, Radius.circular(10)),
        Paint()..color = Color(0xFF2D253D),
      );
      canvas.drawRRect(
        RRect.fromRectAndRadius(rect, Radius.circular(10)),
        wall,
      );
      _text(canvas, appStrings.msgBAR, rect.center, bold: true);
    }
  }

  void _text(Canvas canvas, String value, Offset center, {bool bold = false}) {
    final painter = TextPainter(
      text: TextSpan(
        text: value,
        style: TextStyle(
          fontFamily: 'Inter',
          fontSize: 8,
          color: SeatMapColors.muted,
          fontWeight: bold ? FontWeight.w600 : FontWeight.w400,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    painter.paint(
      canvas,
      Offset(center.dx - painter.width / 2, center.dy - painter.height / 2),
    );
  }

  @override
  bool shouldRepaint(_RoomPainter oldDelegate) =>
      oldDelegate.terrace != terrace || oldDelegate.demo != demo;
}

class _TablePainter extends CustomPainter {
  const _TablePainter({
    required this.selected,
    required this.occupied,
    required this.wide,
  });
  final bool selected, occupied, wide;
  @override
  void paint(Canvas canvas, Size size) {
    final fill = selected
        ? SeatMapColors.lavender
        : occupied
        ? Color(0xFF302D42)
        : SeatMapColors.available;
    final edge = selected
        ? SeatMapColors.lavender
        : occupied
        ? Color(0xFF454052)
        : Color(0xFF8270B1);
    final chair = Paint()
      ..color = occupied
          ? Color(0xFF575166)
          : selected
          ? Color(0xFFD0BBFF)
          : Color(0xFF8873BB);
    final count = wide ? 2 : 1;
    for (var i = 0; i < count; i++) {
      final x = wide ? 6 + i * (size.width - 24) : (size.width - 12) / 2;
      canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTWH(x, 1, 12, 5), Radius.circular(3)),
        chair,
      );
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(x, size.height - 6, 12, 5),
          Radius.circular(3),
        ),
        chair,
      );
    }
    final rect = RRect.fromRectAndRadius(
      Rect.fromLTWH(0.5, 7, size.width - 1, size.height - 14),
      Radius.circular(wide ? 12 : 20),
    );
    canvas.drawRRect(rect, Paint()..color = fill);
    canvas.drawRRect(
      rect,
      Paint()
        ..color = edge
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
  }

  @override
  bool shouldRepaint(_TablePainter oldDelegate) =>
      oldDelegate.selected != selected || oldDelegate.occupied != occupied;
}
