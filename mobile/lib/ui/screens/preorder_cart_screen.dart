import 'dart:convert';
import 'dart:math';

import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../data/preorder_cart_key.dart';
import '../../data/seatmap_repository.dart';
import '../../domain/menu.dart';
import '../../domain/models.dart';
import '../../l10n/language.dart';
import '../../state/app_controller.dart';
import '../components.dart';
import '../theme.dart';
import '../widgets/dish_photo.dart';

class PreorderCartScreen extends StatefulWidget {
  const PreorderCartScreen({
    super.key,
    required this.controller,
    required this.restaurant,
    required this.booking,
    required this.dishes,
    required this.quantities,
    required this.policy,
    this.draft,
    this.lineNotes,
    this.storageKey,
    this.initialNotes,
    this.initialOffset,
    this.onFormChanged,
  });
  final Map<int, String>? lineNotes;
  final String? storageKey;
  final String? initialNotes;
  final int? initialOffset;
  final void Function(Map<String, dynamic>?, String, int)? onFormChanged;
  final AppController controller;
  final Restaurant restaurant;
  final Booking booking;
  final List<MenuDish> dishes;
  final Map<int, int> quantities;
  final PreorderSettings policy;
  final Map<String, dynamic>? draft;
  @override
  State<PreorderCartScreen> createState() => _PreorderCartScreenState();
}

class _PreorderCartScreenState extends State<PreorderCartScreen> {
  final notes = TextEditingController();
  late final Map<int, int> quantities = Map.of(widget.quantities);
  Map<String, dynamic>? activeDraft;
  Map<String, dynamic>? pending;
  final dishNotes = <int, String>{};
  final portionNotes = <int, List<String>>{};
  List<Map<String, dynamic>> get requestLines {
    final lines = <Map<String, dynamic>>[];
    for (final dish in selected) {
      final grouped = <String, int>{};
      for (var i = 0; i < quantities[dish.id]!; i++) {
        final portions = portionNotes[dish.id];
        final note =
            (portions != null && i < portions.length
                    ? portions[i]
                    : dishNotes[dish.id] ?? '')
                .trim();
        grouped[note] = (grouped[note] ?? 0) + 1;
      }
      for (final entry in grouped.entries) {
        lines.add({
          'menuItemId': dish.id,
          'quantity': entry.value,
          'notes': entry.key,
        });
      }
    }
    return lines;
  }

  bool restoring = true;
  bool get locked => busy || restoring || pending != null;
  String get storageKey =>
      widget.storageKey ?? preorderCartKey(widget.booking, widget.draft);
  Future<void> _persistCart() async {
    final prefs = await SharedPreferences.getInstance();
    final ok = await prefs.setString(
      storageKey,
      jsonEncode({
        'quantities': quantities.map((k, v) => MapEntry('$k', v)),
        'lineNotes': dishNotes.map((k, v) => MapEntry('$k', v)),
        'portionNotes': portionNotes.map((k, v) => MapEntry('$k', v)),
        'draft': activeDraft,
        'notes': notes.text,
        'offset': offset,
        'pending': pending,
      }),
    );
    if (!ok) throw StateError('Could not save cart on this device');
  }

  Future<void> _restoreCart() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(storageKey);
      if (raw != null) {
        final data = jsonDecode(raw) as Map<String, dynamic>;
        pending = data['pending'] as Map<String, dynamic>?;
        quantities.clear();
        (data['quantities'] as Map? ?? {}).forEach(
          (k, v) => quantities[int.parse(k)] = v as int,
        );
        (data['portionNotes'] as Map? ?? {}).forEach(
          (k, v) => portionNotes[int.parse(k)] = (v as List).cast<String>(),
        );
        activeDraft = data['draft'] as Map<String, dynamic>? ?? activeDraft;
        notes.text = data['notes'] as String? ?? notes.text;
        offset = data['offset'] as int? ?? offset;
        (data['lineNotes'] as Map? ?? {}).forEach(
          (k, v) => dishNotes[int.parse(k)] = v as String,
        );
      }
    } catch (e) {
      error = e is StateError && mounted
          ? context.l10n.preorderLocalSaveFailed
          : e.toString();
    }
    if (mounted) setState(() => restoring = false);
  }

  @override
  void initState() {
    super.initState();
    activeDraft = widget.draft;
    dishNotes.addAll(widget.lineNotes ?? {});
    for (final line in widget.draft?['items'] as List? ?? []) {
      portionNotes
          .putIfAbsent(line['menuItemId'] as int, () => [])
          .addAll(
            List.filled(
              line['quantity'] as int,
              line['notes'] as String? ?? '',
            ),
          );
    }
    notes.text = widget.initialNotes ?? widget.draft?['notes'] as String? ?? '';
    final served = DateTime.tryParse(
      widget.draft?['serveAtUtc'] as String? ?? '',
    );
    if (served != null) {
      final start = widget.controller.repository
          .cancellationDeadline(widget.booking)
          .add(Duration(minutes: widget.booking.cancellationLeadMinutes));
      offset = served.difference(start).inMinutes.clamp(0, 120);
      offset = (offset ~/ 15) * 15;
    } else {
      offset = widget.draft?['serveOffsetMinutes'] as int? ?? 0;
    }
    offset = widget.initialOffset ?? offset;
    _restoreCart();
  }

  int offset = 0;
  bool busy = false, saved = false, pricesUpdated = false;
  final serverPrices = <int, int>{};
  int _unit(MenuDish dish) => serverPrices[dish.id] ?? dish.priceMinor;
  String? error;
  late String requestId = _uuid();
  List<MenuDish> get selected =>
      widget.dishes.where((d) => (quantities[d.id] ?? 0) > 0).toList();
  int get total => saved && activeDraft?['totalMinor'] is num
      ? (activeDraft!['totalMinor'] as num).toInt()
      : selected.fold(0, (sum, d) => sum + _unit(d) * quantities[d.id]!);
  static String _uuid() {
    final r = Random.secure();
    final b = List.generate(16, (_) => r.nextInt(256));
    b[6] = (b[6] & 15) | 64;
    b[8] = (b[8] & 63) | 128;
    final h = b.map((v) => v.toRadixString(16).padLeft(2, '0')).join();
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
  }

  String _time(int shift) {
    final p = widget.booking.time.split(':');
    final minute = int.parse(p[0]) * 60 + int.parse(p[1]) + shift;
    return '${(minute ~/ 60 % 24).toString().padLeft(2, '0')}:${(minute % 60).toString().padLeft(2, '0')}';
  }

  @override
  void dispose() {
    widget.onFormChanged?.call(activeDraft, notes.text, offset);
    notes.dispose();
    super.dispose();
  }

  void _changed() {
    saved = false;
    requestId = _uuid();
    _persistCart().catchError((Object e) {
      if (mounted) {
        setState(
          () => error = e is StateError
              ? context.l10n.preorderLocalSaveFailed
              : e.toString(),
        );
      }
    });
  }

  Future<void> _save() async {
    if (busy || restoring || (pending == null && selected.isEmpty)) return;
    if (pending == null && selected.length != quantities.length) {
      setState(() => error = context.l10n.preorderMenuChanged);
      return;
    }
    if (pending == null && requestLines.length > 40) {
      setState(() => error = context.l10n.preorderCartLimit);
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final body =
          pending ??
          <String, dynamic>{
            'idempotencyKey': requestId,
            'expectedRevision': activeDraft?['revision'],
            'items': requestLines,
            'serveOffsetMinutes': offset,
            'notes': notes.text.trim(),
            'language': widget.controller.appLanguageCode,
          };
      pending = body;
      await _persistCart();
      final Map<String, dynamic> result;
      if (widget.booking.demo) {
        result = {
          ...body,
          'id': activeDraft?['id'] ?? body['idempotencyKey'],
          'status': 'Draft',
          'totalMinor': total,
          'items': [
            for (final line in requestLines)
              {
                ...line,
                'name': widget.dishes
                    .firstWhere((d) => d.id == line['menuItemId'])
                    .name,
                'unitMinor': widget.dishes
                    .firstWhere((d) => d.id == line['menuItemId'])
                    .priceMinor,
              },
          ],
        };
        final prefs = await SharedPreferences.getInstance();
        final key = 'demo-preorders-${widget.booking.id}';
        final values = (jsonDecode(prefs.getString(key) ?? '[]') as List)
            .cast<Map<String, dynamic>>();
        values.removeWhere((d) => d['id'] == result['id']);
        values.add(result);
        await prefs.setString(key, jsonEncode(values));
      } else {
        result = activeDraft == null
            ? await widget.controller.repository.savePreorderDraft(
                widget.booking,
                body,
              )
            : await widget.controller.repository.updatePreorderDraft(
                widget.booking,
                activeDraft!['id'] as String,
                body,
              );
        final original = total;
        final lines = result['items'];
        if (lines is List) {
          for (final line in lines.whereType<Map>()) {
            if (line['menuItemId'] is int && line['unitMinor'] is int) {
              serverPrices[line['menuItemId'] as int] =
                  line['unitMinor'] as int;
            }
          }
        }
        pricesUpdated = original != total;
      }
      activeDraft = result;
      pending = null;
      requestId = _uuid();
      notes.text = result['notes'] as String? ?? notes.text;
      quantities.clear();
      dishNotes.clear();
      portionNotes.clear();
      for (final line in result['items'] as List? ?? []) {
        final id = line['menuItemId'] as int;
        final qty = line['quantity'] as int;
        quantities[id] = (quantities[id] ?? 0) + qty;
        portionNotes
            .putIfAbsent(id, () => [])
            .addAll(List.filled(qty, line['notes'] as String? ?? ''));
      }
      final served = DateTime.tryParse(result['serveAtUtc'] as String? ?? '');
      if (served != null) {
        final start = widget.controller.repository
            .cancellationDeadline(widget.booking)
            .add(Duration(minutes: widget.booking.cancellationLeadMinutes));
        offset =
            ((served.difference(start).inMinutes.clamp(0, 120)) ~/ 15) * 15;
      } else {
        offset = result['serveOffsetMinutes'] as int? ?? offset;
      }
      if (mounted) setState(() => saved = true);
      widget.controller.preordersChanged();
      try {
        await _persistCart();
      } catch (e) {
        if (mounted) {
          setState(
            () => error = e is StateError
                ? context.l10n.preorderLocalSaveFailed
                : e.toString(),
          );
        }
      }
    } catch (e) {
      if (e is SeatMapException && !e.uncertain) {
        pending = null;
        requestId = _uuid();
        if (e.code == 'PREORDER_CHANGED' && activeDraft != null) {
          try {
            final latest = await widget.controller.repository.preorderDrafts(
              widget.booking,
            );
            activeDraft =
                latest
                    .where((d) => d['id'] == activeDraft!['id'])
                    .firstOrNull ??
                activeDraft;
          } catch (_) {
            /* Retain local edits; reopen when connectivity returns. */
          }
        }
        try {
          await _persistCart();
        } catch (_) {
          /* Disk retains recoverable operation. */
        }
      }
      if (mounted) {
        setState(
          () => error = e is StateError
              ? context.l10n.preorderLocalSaveFailed
              : e.toString(),
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !busy,
    child: Scaffold(
      appBar: AppBar(
        toolbarHeight: 64 + (MediaQuery.textScalerOf(context).scale(32) - 32),
        title: Text(
          context.l10n.preorderCartTitle,
          maxLines: 2,
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
        ),
        actions: [
          if (saved)
            TextButton(
              onPressed: () => Navigator.pop(context, activeDraft),
              child: Text(context.l10n.msgDone),
            ),
        ],
      ),
      body: restoring
          ? Center(child: CircularProgressIndicator())
          : ListView(
              padding: EdgeInsets.fromLTRB(24, 12, 24, 28),
              children: [
                Text(
                  widget.restaurant.name,
                  style: TextStyle(fontSize: 26, fontWeight: FontWeight.w700),
                ),
                SizedBox(height: 8),
                Text(
                  '${widget.booking.date.day}.${widget.booking.date.month} · ${widget.booking.time} · ${context.l10n.msgTable} ${widget.booking.tableLabel}',
                  style: TextStyle(color: SeatMapColors.muted),
                ),
                SizedBox(height: 12),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: locked ? null : () => Navigator.pop(context),
                    icon: Icon(Icons.edit_outlined, size: 16),
                    label: Text(context.l10n.preorderEditCart),
                  ),
                ),
                SizedBox(height: 12),
                for (final item in activeDraft?['items'] as List? ?? [])
                  if (!widget.dishes.any((d) => d.id == item['menuItemId']))
                    Padding(
                      padding: EdgeInsets.only(bottom: 12),
                      child: Text(
                        '${item['quantity']} × ${item['name']}\n${item['notes'] ?? ''}',
                        style: TextStyle(color: SeatMapColors.muted),
                      ),
                    ),
                for (final dish in selected)
                  Padding(
                    padding: EdgeInsets.only(bottom: 18),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(13),
                              child: SizedBox(
                                width: 62,
                                height: 62,
                                child: DishPhoto(dish: dish),
                              ),
                            ),
                            SizedBox(width: 13),
                            Expanded(
                              child: Text(
                                '${dish.name}\n× ${quantities[dish.id]}',
                                style: TextStyle(
                                  height: 1.5,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                            SizedBox(width: 12),
                            Text(
                              '${(_unit(dish) * quantities[dish.id]! / 100).toStringAsFixed(2)} €',
                              style: TextStyle(
                                color: SeatMapColors.lavender,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            IconButton(
                              onPressed: locked
                                  ? null
                                  : () => setState(() {
                                      final q = quantities[dish.id]! - 1;
                                      if (q == 0) {
                                        quantities.remove(dish.id);
                                      } else {
                                        quantities[dish.id] = q;
                                      }
                                      _changed();
                                    }),
                              icon: Icon(Icons.remove_circle_outline),
                              tooltip: context.l10n.preorderDecrease,
                            ),
                            Text('${quantities[dish.id]}'),
                            IconButton(
                              onPressed: locked || quantities[dish.id]! >= 20
                                  ? null
                                  : () => setState(() {
                                      quantities[dish.id] =
                                          quantities[dish.id]! + 1;
                                      _changed();
                                    }),
                              icon: Icon(Icons.add_circle_outline),
                              tooltip: context.l10n.preorderIncrease,
                            ),
                          ],
                        ),
                        if (portionNotes.containsKey(dish.id))
                          for (var i = 0; i < quantities[dish.id]!; i++)
                            TextFormField(
                              key: ValueKey('dish-note-${dish.id}-$i'),
                              initialValue: i < portionNotes[dish.id]!.length
                                  ? portionNotes[dish.id]![i]
                                  : '',
                              enabled: !locked,
                              maxLength: 200,
                              decoration: InputDecoration(
                                labelText:
                                    '${context.l10n.preorderDishNotes} · ${i + 1}',
                                hintText: context.l10n.preorderNotesHint,
                              ),
                              onChanged: (value) => setState(() {
                                while (portionNotes[dish.id]!.length <= i) {
                                  portionNotes[dish.id]!.add('');
                                }
                                portionNotes[dish.id]![i] = value;
                                _changed();
                              }),
                            )
                        else ...[
                          TextFormField(
                            key: ValueKey('dish-note-${dish.id}'),
                            initialValue: dishNotes[dish.id] ?? '',
                            enabled: !locked,
                            maxLength: 200,
                            decoration: InputDecoration(
                              labelText: context.l10n.preorderDishNotes,
                              hintText: context.l10n.preorderNotesHint,
                            ),
                            onChanged: (value) => setState(() {
                              dishNotes[dish.id] = value;
                              _changed();
                            }),
                          ),
                          if (quantities[dish.id]! > 1)
                            TextButton(
                              onPressed: locked
                                  ? null
                                  : () => setState(() {
                                      portionNotes[dish.id] = List.filled(
                                        quantities[dish.id]!,
                                        dishNotes[dish.id] ?? '',
                                      );
                                      _changed();
                                    }),
                              child: Text(context.l10n.preorderSplitPortions),
                            ),
                        ],
                      ],
                    ),
                  ),
                SizedBox(height: 12),
                Divider(height: 30),
                Text(
                  context.l10n.preorderServeTime,
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17),
                ),
                SizedBox(height: 12),
                DropdownButtonFormField<int>(
                  initialValue: offset,
                  items: [
                    for (var m = 0; m <= 120; m += 15)
                      DropdownMenuItem(value: m, child: Text(_time(m))),
                  ],
                  onChanged: locked
                      ? null
                      : (v) => setState(() {
                          offset = v!;
                          _changed();
                        }),
                ),
                SizedBox(height: 18),
                TextField(
                  key: ValueKey('preorder-general-notes'),
                  controller: notes,
                  enabled: !locked,
                  maxLength: 500,
                  maxLines: 3,
                  onChanged: (_) => setState(_changed),
                  decoration: InputDecoration(
                    labelText: context.l10n.preorderNotes,
                    hintText: context.l10n.preorderNotesHint,
                  ),
                ),
                SizedBox(height: 18),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      context.l10n.preorderTotal,
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      '${(total / 100).toStringAsFixed(2)} €',
                      style: TextStyle(
                        fontSize: 24,
                        color: SeatMapColors.lavender,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 20),
                Text(
                  context.l10n.preorderPrepaymentRule,
                  style: TextStyle(height: 1.5, color: SeatMapColors.muted),
                ),
                if (!widget.policy.cardPaymentsAvailable)
                  Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Text(
                      widget.booking.demo
                          ? context.l10n.preorderDemoPreview
                          : context.l10n.preorderPaymentsUnavailable,
                      style: TextStyle(
                        color: SeatMapColors.peach,
                        fontSize: 12,
                        height: 1.5,
                      ),
                    ),
                  ),
                if (widget.booking.status == 'pending')
                  Padding(
                    padding: EdgeInsets.symmetric(vertical: 10),
                    child: Text(
                      context.l10n.preorderConfirmBookingFirst,
                      style: TextStyle(color: SeatMapColors.peach, height: 1.5),
                    ),
                  ),
                if (pricesUpdated)
                  Padding(
                    padding: EdgeInsets.only(bottom: 14),
                    child: Text(
                      context.l10n.preorderPricesUpdated,
                      style: TextStyle(color: SeatMapColors.peach, height: 1.5),
                    ),
                  ),
                if (saved)
                  Semantics(
                    liveRegion: true,
                    child: Text(
                      widget.booking.demo
                          ? context.l10n.preorderDemoSaved
                          : context.l10n.preorderDraftSaved,
                      style: TextStyle(color: Color(0xFF95DBB7), height: 1.5),
                    ),
                  ),
                if (error != null)
                  Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Text(
                      error!,
                      style: TextStyle(color: SeatMapColors.peach),
                    ),
                  ),
              ],
            ),
      bottomNavigationBar: Padding(
        padding: EdgeInsets.fromLTRB(24, 12, 24, bottomInset(context) + 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (pending != null && !busy)
              Padding(
                padding: EdgeInsets.only(bottom: 12),
                child: Text(
                  context.l10n.preorderRecoverPending,
                  style: TextStyle(color: SeatMapColors.peach),
                ),
              ),
            PrimaryButton(
              label: busy
                  ? context.l10n.preorderSaving
                  : saved
                  ? context.l10n.preorderSavedLabel
                  : pending != null
                  ? context.l10n.preorderRetrySave
                  : context.l10n.savePreorderDraft,
              icon: saved ? Icons.check_circle_outline : Icons.save_outlined,
              onPressed:
                  !saved &&
                      !busy &&
                      !restoring &&
                      (pending != null || selected.isNotEmpty)
                  ? _save
                  : null,
            ),
          ],
        ),
      ),
    ),
  );
}
