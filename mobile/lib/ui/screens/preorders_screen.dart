import 'dart:convert';

import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../data/seatmap_repository.dart';
import '../../domain/menu.dart';
import '../../domain/models.dart';
import '../../l10n/language.dart';
import '../../state/app_controller.dart';
import '../components.dart';
import '../restaurant_contact.dart';
import '../theme.dart';
import '../widgets/dish_photo.dart';
import 'menu_browsing_screen.dart' show MenuScreen;

class PreordersScreen extends StatefulWidget {
  const PreordersScreen({
    super.key,
    required this.controller,
    this.active = true,
    this.embedded = false,
    this.onActiveCountChanged,
  });
  final AppController controller;
  final bool active, embedded;
  final ValueChanged<int>? onActiveCountChanged;
  @override
  State<PreordersScreen> createState() => _PreordersScreenState();
}

class _PreordersScreenState extends State<PreordersScreen>
    with WidgetsBindingObserver {
  final entries = <({Booking booking, Map<String, dynamic> draft})>[];
  final issues = <({Booking booking, bool accessDenied})>[];
  bool loading = true;
  bool history = false;
  int loadGeneration = 0;
  String bookingSignature = '';
  final photos = <String, Map<int, MenuDish>>{};
  String _signature() {
    final bookings = widget.controller.bookings
        .map(
          (b) =>
              '${b.restaurantId}:${b.id}:${b.status}:${b.startsAtUtc}:${b.managementToken}',
        )
        .join('|');
    return '${widget.controller.preorderRevision}:$bookings';
  }

  void _bookingsChanged() {
    if (_signature() != bookingSignature) _load();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _load();
  }

  @override
  void didUpdateWidget(covariant PreordersScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.active && !oldWidget.active) _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    widget.controller.removeListener(_bookingsChanged);
    super.dispose();
  }

  DateTime _starts(Booking b) => widget.controller.repository
      .cancellationDeadline(b)
      .add(Duration(minutes: b.cancellationLeadMinutes));
  bool _isActive(Booking b, Map<String, dynamic> draft) =>
      !['cancelled', 'completed', 'no_show'].contains(b.status) &&
      !['Cancelled', 'Completed', 'Refunded'].contains(draft['status']) &&
      _starts(b).isAfter(DateTime.now());
  void _reportCount() {
    final count = entries.where((e) => _isActive(e.booking, e.draft)).length;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.onActiveCountChanged?.call(count);
    });
  }

  String? error;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.controller.addListener(_bookingsChanged);
    _load();
  }

  Future<void> _load() async {
    final generation = ++loadGeneration;
    bookingSignature = _signature();
    setState(() {
      loading = true;
      error = null;
    });
    final next = <({Booking booking, Map<String, dynamic> draft})>[];
    final failures = <({Booking booking, bool accessDenied})>[];
    try {
      final prefs = await SharedPreferences.getInstance();
      for (final booking in List<Booking>.of(widget.controller.bookings)) {
        if (!booking.demo && booking.managementToken.isEmpty) {
          failures.add((booking: booking, accessDenied: true));
          continue;
        }
        try {
          final drafts = booking.demo
              ? (jsonDecode(
                  prefs.getString('demo-preorders-${booking.id}') ?? '[]',
                ) as List).cast<Map<String, dynamic>>()
              : await widget.controller.repository.preorderDrafts(booking);
          for (final draft in drafts) {
            next.add((booking: booking, draft: draft));
          }
        } catch (e) {
          failures.add((
            booking: booking,
            accessDenied:
                e is SeatMapException && e.code == 'RESERVATION_NOT_FOUND',
          ));
        }
      }
      if (mounted && generation == loadGeneration) {
        setState(() {
          issues
            ..clear()
            ..addAll(failures);
          entries.clear();
          entries.addAll(next);
          entries.sort(
            (a, b) => _starts(b.booking).compareTo(_starts(a.booking)),
          );
        });
        _reportCount();
        for (final id in next.map((e) => e.booking.restaurantId).toSet()) {
          final restaurant = widget.controller.restaurants
              .where((r) => r.id == id)
              .firstOrNull;
          if (restaurant == null || photos.containsKey(id)) continue;
          try {
            final menu = await widget.controller.repository.loadMenu(
              restaurant,
            );
            if (mounted && generation == loadGeneration) {
              setState(
                () => photos[id] = {for (final dish in menu) dish.id: dish},
              );
            }
          } catch (_) {
            /* Snapshot text remains available without photos. */
          }
        }
      }
    } catch (e) {
      if (mounted && generation == loadGeneration) {
        setState(
          () => error = e is StateError
              ? context.l10n.preorderLocalSaveFailed
              : e.toString(),
        );
      }
    } finally {
      if (mounted && generation == loadGeneration) {
        setState(() => loading = false);
      }
    }
  }

  bool _canEdit(Booking booking, Map<String, dynamic> draft) =>
      draft['status'] == 'Draft' &&
      (booking.demo ||
          (booking.status == 'confirmed' &&
              widget.controller.repository
                  .cancellationDeadline(booking)
                  .add(Duration(minutes: booking.cancellationLeadMinutes - 30))
                  .isAfter(DateTime.now())));

  Future<void> _edit(Booking booking, Map<String, dynamic> draft) async {
    final restaurant = widget.controller.restaurants
        .where((r) => r.id == booking.restaurantId)
        .firstOrNull;
    if (restaurant == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(context.l10n.msgCouldNotLoadTheMenuPleaseTryLater),
        ),
      );
      return;
    }
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => MenuScreen(
          controller: widget.controller,
          restaurant: restaurant,
          booking: booking,
          draft: draft,
        ),
      ),
    );
    if (mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final visible = entries
        .where((e) => _isActive(e.booking, e.draft) != history)
        .toList();
    if (!history) {
      visible.sort((a, b) => _starts(a.booking).compareTo(_starts(b.booking)));
    }
    return Scaffold(
      appBar: widget.embedded
          ? null
          : AppBar(title: Text(context.l10n.ordersTab)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          key: const PageStorageKey('orders-list'),
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(22, 20, 22, 28),
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'SeatMap',
                    style: TextStyle(
                      color: SeatMapColors.lavender,
                      fontWeight: FontWeight.w700,
                      fontSize: 20,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: context.l10n.msgRefreshAvailability,
                  onPressed: loading ? null : _load,
                  icon: const Icon(Icons.refresh_rounded),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Text(
              context.l10n.ordersTab,
              style: const TextStyle(
                fontSize: 34,
                fontWeight: FontWeight.w700,
                letterSpacing: -1,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              context.l10n.ordersSubtitle,
              style: const TextStyle(
                color: SeatMapColors.muted,
                fontSize: 15,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 24),
            Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: SeatMapColors.surface,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: SeatMapColors.line),
              ),
              child: Row(
                children: [
                  for (final item in [false, true])
                    Expanded(
                      child: Semantics(
                        selected: history == item,
                        button: true,
                        child: TextButton(
                          key: ValueKey(
                            item ? 'orders-history' : 'orders-active',
                          ),
                          style: TextButton.styleFrom(
                            backgroundColor: history == item
                                ? SeatMapColors.lavender
                                : Colors.transparent,
                            foregroundColor: history == item
                                ? SeatMapColors.background
                                : SeatMapColors.muted,
                            minimumSize: const Size(0, 48),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 14,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                            ),
                          ),
                          onPressed: () => setState(() => history = item),
                          child: Text(
                            item
                                ? context.l10n.msgHistory
                                : context.l10n.ordersActive,
                            textAlign: TextAlign.center,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            if (loading)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              ),
            if (error != null) ...[
              Text(error!, style: const TextStyle(color: SeatMapColors.peach)),
              TextButton(
                onPressed: _load,
                child: Text(context.l10n.msgTryAgain246),
              ),
            ],
            if (!loading &&
                visible.isEmpty &&
                error == null &&
                !issues.any((i) => _isActive(i.booking, {}) != history))
              Padding(
                padding: const EdgeInsets.symmetric(
                  vertical: 44,
                  horizontal: 16,
                ),
                child: Column(
                  children: [
                    Icon(
                      history
                          ? Icons.history_rounded
                          : Icons.shopping_bag_outlined,
                      size: 48,
                      color: SeatMapColors.lavender,
                    ),
                    const SizedBox(height: 18),
                    Text(
                      history
                          ? context.l10n.ordersHistoryEmpty
                          : context.l10n.preordersEmpty,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: SeatMapColors.muted,
                        height: 1.5,
                      ),
                    ),
                  ],
                ),
              ),
            for (final entry in visible) _card(entry.booking, entry.draft),
            if (!loading)
              for (final issue in issues.where(
                (i) => _isActive(i.booking, {}) != history,
              ))
                _issueCard(issue.booking, issue.accessDenied),
          ],
        ),
      ),
    );
  }

  Widget _issueCard(Booking booking, bool accessDenied) => Container(
    key: ValueKey('order-issue-${booking.id}'),
    margin: const EdgeInsets.only(bottom: 16),
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      color: SeatMapColors.surface,
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: SeatMapColors.line),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          booking.restaurantName,
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 6),
        Text(
          '${DateFormat('dd.MM.yyyy').format(booking.date)} · ${booking.time} · ${booking.tableLabel}',
          style: const TextStyle(color: SeatMapColors.muted),
        ),
        const SizedBox(height: 12),
        Text(
          accessDenied
              ? context.l10n.ordersAccessUnavailable
              : context.l10n.ordersLoadFailed,
          style: const TextStyle(color: SeatMapColors.muted, height: 1.5),
        ),
        TextButton.icon(
          icon: Icon(
            accessDenied ? Icons.phone_outlined : Icons.refresh_rounded,
          ),
          label: Text(
            accessDenied
                ? context.l10n.preorderContactRestaurant
                : context.l10n.msgTryAgain246,
          ),
          onPressed: accessDenied
              ? () => showRestaurantContact(
                  context,
                  restaurantName: booking.restaurantName,
                  phone: widget.controller.restaurantPhoneFor(booking),
                )
              : _load,
        ),
      ],
    ),
  );

  Widget _card(Booking booking, Map<String, dynamic> draft) => Container(
    key: ValueKey('preorder-${draft['id']}'),
    margin: const EdgeInsets.only(bottom: 20),
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      color: SeatMapColors.surface,
      borderRadius: BorderRadius.circular(26),
      border: Border.all(color: SeatMapColors.line),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          booking.restaurantName,
          style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        Text(
          '${booking.date.day}.${booking.date.month}.${booking.date.year} · ${booking.time} · ${context.l10n.msgTable} ${booking.tableLabel}',
          style: const TextStyle(color: SeatMapColors.muted, height: 1.5),
        ),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            color: SeatMapColors.peach.withValues(alpha: .14),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            draft['status'] == 'Draft'
                ? context.l10n.ordersUnpaidDraft
                : draft['status'].toString(),
            style: const TextStyle(
              color: SeatMapColors.peach,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        const SizedBox(height: 24),
        for (final item in draft['items'] as List? ?? [])
          _line(booking, item as Map),
        if ((draft['notes'] as String? ?? '').isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4, bottom: 12),
            child: Text(
              draft['notes'] as String,
              style: const TextStyle(color: SeatMapColors.muted, height: 1.5),
            ),
          ),
        const Divider(height: 32),
        SizedBox(
          width: double.infinity,
          child: Wrap(
            alignment: WrapAlignment.spaceBetween,
            spacing: 16,
            runSpacing: 8,
            children: [
              Text(
                context.l10n.preorderTotal,
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                '${((draft['totalMinor'] as num? ?? 0) / 100).toStringAsFixed(2)} €',
                style: const TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
        if (_canEdit(booking, draft)) ...[
          const SizedBox(height: 22),
          PrimaryButton(
            label: context.l10n.editPreorder,
            icon: Icons.edit_outlined,
            onPressed: () => _edit(booking, draft),
          ),
        ] else if (draft['status'] == 'Draft') ...[
          const SizedBox(height: 16),
          Text(
            context.l10n.preorderEditingClosed,
            style: const TextStyle(color: SeatMapColors.muted, height: 1.5),
          ),
          TextButton.icon(
            onPressed: () {
              final restaurant = widget.controller.restaurants
                  .where((r) => r.id == booking.restaurantId)
                  .firstOrNull;
              showRestaurantContact(
                context,
                restaurantName: booking.restaurantName,
                phone: restaurant?.phone ?? booking.restaurantPhone,
              );
            },
            icon: const Icon(Icons.phone_outlined),
            label: Text(context.l10n.preorderContactRestaurant),
          ),
        ],
        if (draft['status'] == 'Draft') ...[
          const SizedBox(height: 14),
          Text(
            context.l10n.ordersNotSent,
            style: const TextStyle(
              color: SeatMapColors.muted,
              fontSize: 12,
              height: 1.5,
            ),
          ),
        ],
      ],
    ),
  );
  Widget _line(Booking booking, Map item) {
    final dish = photos[booking.restaurantId]?[item['menuItemId']];
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: SizedBox(
              width: 56,
              height: 56,
              child: dish == null
                  ? Container(
                      color: SeatMapColors.lavenderSoft,
                      child: const Icon(
                        Icons.restaurant_rounded,
                        color: SeatMapColors.peach,
                      ),
                    )
                  : DishPhoto(dish: dish),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${item['quantity']} × ${item['name']}',
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    height: 1.4,
                  ),
                ),
                if ((item['notes'] as String? ?? '').isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 5),
                    child: Text(
                      item['notes'] as String,
                      style: const TextStyle(
                        color: SeatMapColors.muted,
                        fontSize: 12,
                        height: 1.4,
                      ),
                    ),
                  ),
                if (item['unitMinor'] is num)
                  Padding(
                    padding: const EdgeInsets.only(top: 5),
                    child: Text(
                      '${(((item['unitMinor'] as num) * (item['quantity'] as num)) / 100).toStringAsFixed(2)} €',
                      style: const TextStyle(
                        color: SeatMapColors.lavender,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
