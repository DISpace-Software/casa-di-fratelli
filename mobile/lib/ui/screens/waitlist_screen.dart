import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../../domain/models.dart';
import '../../l10n/language.dart';
import '../../state/app_controller.dart';
import '../theme.dart';
import 'support_screens.dart';
import 'discovery_screens.dart';

class WaitlistScreen extends StatefulWidget {
  const WaitlistScreen({
    super.key,
    required this.controller,
    required this.restaurant,
    required this.area,
    this.entry,
  });
  final AppController controller;
  final Restaurant restaurant;
  final String area;
  final Map<String, dynamic>? entry;
  @override
  State<WaitlistScreen> createState() => _WaitlistScreenState();
}

class _WaitlistScreenState extends State<WaitlistScreen> {
  final selected = <String>{};
  late DateTime date;
  late int guests;
  bool busy = false;
  String? error;
  @override
  void initState() {
    super.initState();
    date = widget.entry == null
        ? widget.controller.selectedDate
        : DateTime.parse(widget.entry!['date']);
    guests = widget.entry?['guests'] ?? widget.controller.guestCount;
    selected.addAll(
      widget.entry == null
          ? [widget.controller.selectedTime]
          : List<String>.from(widget.entry!['times']),
    );
  }

  Future<void> save() async {
    if (!widget.controller.isLoggedIn) {
      await Navigator.push(
        context,
        MaterialPageRoute<void>(
          builder: (_) => LoginScreen(controller: widget.controller),
        ),
      );
      if (!mounted) return;
      setState(() {});
      if (!widget.controller.isLoggedIn) return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.controller.accounts.waitlist(
        widget.restaurant.id,
        path: widget.entry == null ? '' : '/${widget.entry!['id']}',
        method: widget.entry == null ? 'POST' : 'PUT',
        body: {
          'date':
              '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}',
          'guests': guests,
          'area': widget.area,
          'times': selected.toList()..sort(),
        },
      );
      await widget.controller.refreshWaitlist();
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(context.l10n.waitlistSaved)));
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final times = widget.controller.repository.timesFor(
      widget.restaurant,
      date,
    );
    final zone =
        widget.restaurant.floorPlan.zones
            .where((z) => z.id == widget.area)
            .firstOrNull
            ?.name ??
        widget.area;
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.waitlistTitle)),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const Icon(
            Icons.notifications_active_outlined,
            size: 48,
            color: SeatMapColors.lavender,
          ),
          const SizedBox(height: 24),
          Text(
            widget.restaurant.name,
            style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 12),
          Text(
            '${shortDate(date, withToday: false)} · ${guestLabel(guests)} · $zone',
            style: const TextStyle(color: SeatMapColors.muted),
          ),
          const SizedBox(height: 24),
          Text(context.l10n.waitlistIntro, style: const TextStyle(height: 1.5)),
          const SizedBox(height: 24),
          Text(context.l10n.waitlistTimes),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: times
                .map(
                  (t) => FilterChip(
                    label: Text(t),
                    selected: selected.contains(t),
                    onSelected: busy
                        ? null
                        : (yes) => setState(() {
                            if (yes && selected.length < 5) {
                              selected.add(t);
                            } else if (!yes) {
                              selected.remove(t);
                            }
                          }),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: SeatMapColors.surface,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              context.l10n.waitlistNotice,
              style: const TextStyle(height: 1.5, color: SeatMapColors.muted),
            ),
          ),
          if (!widget.controller.isLoggedIn)
            Padding(
              padding: const EdgeInsets.only(top: 16),
              child: Text(context.l10n.waitlistLogin),
            ),
          if (widget.entry != null)
            Padding(
              padding: const EdgeInsets.only(top: 16),
              child: Text(context.l10n.waitlistEditNotice),
            ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.only(top: 16),
              child: Text(
                error!,
                style: const TextStyle(color: Colors.orangeAccent),
              ),
            ),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: busy || selected.isEmpty ? null : save,
            icon: const Icon(Icons.notifications_outlined),
            label: Text(
              busy
                  ? '…'
                  : widget.entry == null
                  ? context.l10n.waitlistJoin
                  : context.l10n.waitlistEdit,
            ),
          ),
        ],
      ),
    );
  }
}

class WaitlistCards extends StatefulWidget {
  const WaitlistCards({
    super.key,
    required this.controller,
    required this.history,
  });
  final AppController controller;
  final bool history;
  @override
  State<WaitlistCards> createState() => _WaitlistCardsState();
}

class _WaitlistCardsState extends State<WaitlistCards> {
  Timer? timer;
  final busy = <String>{};
  String? error;
  @override
  void initState() {
    super.initState();
    timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> act(Map<String, dynamic> entry, String action) async {
    final id = entry['id'] as String;
    if (busy.contains(id)) return;
    setState(() {
      busy.add(id);
      error = null;
    });
    try {
      final restaurant = widget.controller.restaurants.firstWhere(
        (r) => r.id == entry['restaurantId'],
      );
      if (action == 'confirm') {
        await widget.controller.confirmWaitlist(
          restaurant,
          id,
          entry['offerId'],
        );
      } else {
        await widget.controller.accounts.waitlist(
          restaurant.id,
          path: '/$id/$action',
          method: 'POST',
        );
        await widget.controller.refreshWaitlist();
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
      await widget.controller.refreshWaitlist();
    } finally {
      if (mounted) setState(() => busy.remove(id));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.controller.isLoggedIn) return const SizedBox.shrink();
    final entries = widget.controller.waitlistEntries.where(
      (e) =>
          widget.history ==
          ['booked', 'cancelled', 'expired'].contains(e['status']),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (error != null || widget.controller.waitlistError != null)
          TextButton.icon(
            onPressed: widget.controller.refreshWaitlist,
            icon: const Icon(Icons.refresh),
            label: Text(error ?? widget.controller.waitlistError!),
          ),
        for (final e in entries) card(context, e),
      ],
    );
  }

  Widget card(BuildContext context, Map<String, dynamic> e) {
    final l = context.l10n;
    final restaurant = widget.controller.restaurants
        .where((r) => r.id == e['restaurantId'])
        .firstOrNull;
    final expiry = DateTime.tryParse(e['expiresAtUtc']?.toString() ?? '');
    final remaining =
        expiry
            ?.difference(
              DateTime.now().toUtc().add(widget.controller.waitlistClockOffset),
            )
            .inSeconds ??
        0;
    final offered = e['status'] == 'offered' && remaining > 0;
    final pending = busy.contains(e['id']);
    final title = offered
        ? l.waitlistOffered
        : e['status'] == 'waiting'
        ? l.waitlistWaiting
        : e['status'] == 'paused'
        ? l.waitlistPaused
        : e['status'] == 'booked'
        ? l.waitlistBooked
        : e['status'] == 'offered'
        ? l.waitlistExpired
        : l.waitlistClosed;
    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: SeatMapColors.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: offered ? SeatMapColors.lavender : SeatMapColors.line,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.notifications_outlined,
                color: SeatMapColors.lavender,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    color: SeatMapColors.lavender,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Text(
            restaurant?.name ?? e['restaurantId'],
            style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 10),
          Text(
            '${shortDate(DateTime.parse(e['date']), withToday: false)} · ${guestLabel(e['guests'])}',
          ),
          const SizedBox(height: 8),
          Text(offered ? e['offerTime'] : (e['times'] as List).join(' · ')),
          if (offered) ...[
            const SizedBox(height: 20),
            Text(
              '${l.waitlistTimer} · ${remaining ~/ 60}:${(remaining % 60).toString().padLeft(2, '0')}',
              style: const TextStyle(
                fontSize: 18,
                color: SeatMapColors.lavender,
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: pending ? null : () => act(e, 'confirm'),
                child: Text(l.waitlistConfirm),
              ),
            ),
            TextButton(
              onPressed: pending ? null : () => act(e, 'decline'),
              child: Text(l.waitlistDecline),
            ),
          ] else if (!widget.history) ...[
            const SizedBox(height: 16),
            Text(
              l.waitlistNotBooked,
              style: const TextStyle(color: SeatMapColors.muted),
            ),
            if (e['status'] == 'paused') ...[
              Text(l.waitlistEditNotice),
              TextButton(
                onPressed: pending ? null : () => act(e, 'resume'),
                child: Text(l.waitlistResume),
              ),
            ],
            Wrap(
              spacing: 8,
              children: [
                if (restaurant != null)
                  TextButton(
                    onPressed: pending
                        ? null
                        : () => Navigator.push(
                            context,
                            MaterialPageRoute<void>(
                              builder: (_) => WaitlistScreen(
                                controller: widget.controller,
                                restaurant: restaurant,
                                area: e['area'],
                                entry: e,
                              ),
                            ),
                          ),
                    child: Text(l.waitlistEdit),
                  ),
                TextButton(
                  onPressed: pending ? null : () => act(e, 'cancel'),
                  child: Text(l.waitlistCancel),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
