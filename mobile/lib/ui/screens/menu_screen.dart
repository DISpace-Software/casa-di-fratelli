import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:material_ui/material_ui.dart';

import '../../domain/menu.dart';
import '../../domain/models.dart';
import '../../l10n/language.dart';
import '../../l10n/menu_categories.dart';
import '../../state/app_controller.dart';
import '../components.dart';
import '../theme.dart';

class MenuScreen extends StatefulWidget {
  const MenuScreen({
    super.key,
    required this.controller,
    required this.restaurant,
    this.booking,
  });
  final AppController controller;
  final Restaurant restaurant;
  final Booking? booking;
  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> {
  final search = TextEditingController();
  List<MenuDish> dishes = [];
  PreorderSettings policy = const PreorderSettings();
  final quantities = <int, int>{};
  String category = '', query = '';
  int department = 0;
  bool loading = true;
  String? error;
  bool get canOrder => widget.booking != null && policy.enabled;
  int get count => quantities.values.fold(0, (a, b) => a + b);
  int get total => dishes.fold(
    0,
    (sum, item) => sum + item.priceMinor * (quantities[item.id] ?? 0),
  );
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final result = await widget.controller.repository.loadMenu(
        widget.restaurant,
      );
      final settings = await widget.controller.repository
          .preorderSettings(widget.restaurant)
          .catchError((_) => const PreorderSettings());
      if (mounted) {
        setState(() {
          dishes = result;
          policy = settings;
          quantities.removeWhere(
            (id, quantity) =>
                !result.any((dish) => dish.id == id && dish.priceMinor > 0),
          );
          if (!result.any((dish) => dish.category == category)) category = '';
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  void _quantity(MenuDish dish, int delta) {
    if (delta > 0 &&
        !quantities.containsKey(dish.id) &&
        quantities.length >= 40) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(context.l10n.preorderCartLimit)));
      return;
    }
    setState(() {
      final next = ((quantities[dish.id] ?? 0) + delta).clamp(0, 20);
      if (next == 0) {
        quantities.remove(dish.id);
      } else {
        quantities[dish.id] = next;
      }
    });
  }

  Future<void> _detail(MenuDish dish) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (sheet) => SingleChildScrollView(
      child: Padding(
        padding: EdgeInsets.fromLTRB(24, 12, 24, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(22),
              child: SizedBox(
                height: 220,
                width: double.infinity,
                child: DishPhoto(dish: dish),
              ),
            ),
            SizedBox(height: 20),
            Text(
              dish.name,
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700),
            ),
            SizedBox(height: 10),
            Text(
              dish.description,
              style: TextStyle(color: SeatMapColors.muted, height: 1.5),
            ),
            SizedBox(height: 14),
            Text(
              '${dish.weight}${dish.weight.isEmpty ? '' : ' · '}${dish.price} €',
              style: TextStyle(
                color: SeatMapColors.lavender,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
            SizedBox(height: 22),
            PrimaryButton(
              label: canOrder && dish.priceMinor > 0
                  ? context.l10n.addToPreorder
                  : context.l10n.closeMenuItem,
              onPressed: () {
                if (canOrder && dish.priceMinor > 0) _quantity(dish, 1);
                Navigator.pop(sheet);
              },
            ),
          ],
        ),
      ),
    ),
  );
  Future<void> _cart() async {
    await Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => PreorderCartScreen(
          controller: widget.controller,
          restaurant: widget.restaurant,
          booking: widget.booking!,
          dishes: dishes,
          quantities: Map.of(quantities),
          policy: policy,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final departmentItems = dishes
        .where((item) => item.drink == (department == 1))
        .toList();
    final categories =
        departmentItems.map((item) => item.category).toSet().toList()..sort(
          (a, b) => menuCategoryLabel(a).compareTo(menuCategoryLabel(b)),
        );
    final visible = departmentItems
        .where(
          (item) =>
              (category.isEmpty || item.category == category) &&
              '${item.name} ${item.description}'.toLowerCase().contains(
                query.toLowerCase(),
              ),
        )
        .toList();
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.restaurant.name),
        actions: [
          IconButton(
            tooltip: context.l10n.msgRefreshAvailability,
            onPressed: loading ? null : _load,
            icon: Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: loading
          ? Center(child: CircularProgressIndicator())
          : error != null
          ? Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(context.l10n.msgCouldNotLoadTheMenuPleaseTryLater),
                    SizedBox(height: 16),
                    TextButton(
                      onPressed: _load,
                      child: Text(context.l10n.msgTryAgain246),
                    ),
                  ],
                ),
              ),
            )
          : CustomScrollView(
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(22, 8, 22, 20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: EdgeInsets.all(22),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(28),
                            gradient: LinearGradient(
                              colors: [Color(0xFF342547), Color(0xFF1B1A2B)],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                            border: Border.all(
                              color: SeatMapColors.lavender.withValues(
                                alpha: .18,
                              ),
                            ),
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      context.l10n.menuExperienceKicker,
                                      style: TextStyle(
                                        fontSize: 10,
                                        letterSpacing: 2,
                                        color: SeatMapColors.lavender,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    SizedBox(height: 10),
                                    Text(
                                      context.l10n.menuExperienceTitle,
                                      style: TextStyle(
                                        fontSize: 28,
                                        height: 1.1,
                                        fontWeight: FontWeight.w700,
                                        letterSpacing: -.7,
                                      ),
                                    ),
                                    SizedBox(height: 12),
                                    Text(
                                      widget.booking == null
                                          ? context.l10n.menuExperienceSubtitle
                                          : '${widget.booking!.time} · ${context.l10n.preorderForYourTable}',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: SeatMapColors.muted,
                                        height: 1.5,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              SizedBox(width: 15),
                              Container(
                                width: 64,
                                height: 64,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: SeatMapColors.lavender.withValues(
                                    alpha: .12,
                                  ),
                                ),
                                child: Icon(
                                  Icons.restaurant_rounded,
                                  color: SeatMapColors.peach,
                                  size: 31,
                                ),
                              ),
                            ],
                          ),
                        ),
                        SizedBox(height: 20),
                        TextField(
                          controller: search,
                          onChanged: (v) => setState(() => query = v),
                          decoration: InputDecoration(
                            hintText: context.l10n.searchMenu,
                            prefixIcon: Icon(Icons.search_rounded),
                            suffixIcon: query.isEmpty
                                ? null
                                : IconButton(
                                    tooltip: context.l10n.clearMenuSearch,
                                    onPressed: () {
                                      search.clear();
                                      setState(() => query = '');
                                    },
                                    icon: Icon(Icons.close_rounded),
                                  ),
                          ),
                        ),
                        SizedBox(height: 18),
                        Row(
                          children: [
                            for (var i = 0; i < 2; i++)
                              Expanded(
                                child: Padding(
                                  padding: EdgeInsets.only(
                                    right: i == 0 ? 10 : 0,
                                  ),
                                  child: ChoicePill(
                                    i == 0
                                        ? context.l10n.menuFood
                                        : context.l10n.menuDrinks,
                                    icon: i == 0
                                        ? Icons.restaurant_rounded
                                        : Icons.local_bar_rounded,
                                    selected: department == i,
                                    onTap: () => setState(() {
                                      department = i;
                                      category = '';
                                    }),
                                  ),
                                ),
                              ),
                          ],
                        ),
                        SizedBox(height: 16),
                        SizedBox(
                          height: 35,
                          child: ListView(
                            scrollDirection: Axis.horizontal,
                            children: [
                              Padding(
                                padding: EdgeInsets.only(right: 8),
                                child: ChoicePill(
                                  context.l10n.menuAll,
                                  selected: category.isEmpty,
                                  onTap: () => setState(() => category = ''),
                                ),
                              ),
                              for (final value in categories)
                                Padding(
                                  padding: EdgeInsets.only(right: 8),
                                  child: ChoicePill(
                                    menuCategoryLabel(value),
                                    selected: category == value,
                                    onTap: () =>
                                        setState(() => category = value),
                                  ),
                                ),
                            ],
                          ),
                        ),
                        if (widget.booking != null && !policy.enabled)
                          Padding(
                            padding: EdgeInsets.only(top: 16),
                            child: Text(
                              context.l10n.preordersNotOffered,
                              style: TextStyle(
                                fontSize: 12,
                                color: SeatMapColors.muted,
                                height: 1.5,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                if (visible.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(
                      child: Text(
                        dishes.isEmpty
                            ? context.l10n.msgMenuComingSoon
                            : context.l10n.menuNoResults,
                      ),
                    ),
                  )
                else
                  SliverPadding(
                    padding: EdgeInsets.fromLTRB(22, 0, 22, 24),
                    sliver: SliverGrid(
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: MediaQuery.sizeOf(context).width > 600
                            ? 3
                            : 2,
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 14,
                        mainAxisExtent: canOrder ? 306 : 269,
                      ),
                      delegate: SliverChildBuilderDelegate((context, index) {
                        final dish = visible[index];
                        return _DishCard(
                          dish: dish,
                          quantity: quantities[dish.id] ?? 0,
                          ordering: canOrder && dish.priceMinor > 0,
                          onOpen: () => _detail(dish),
                          onAdd: () => _quantity(dish, 1),
                          onRemove: () => _quantity(dish, -1),
                        );
                      }, childCount: visible.length),
                    ),
                  ),
              ],
            ),
      bottomNavigationBar: canOrder && count > 0
          ? Padding(
              padding: EdgeInsets.fromLTRB(
                22,
                12,
                22,
                bottomInset(context) + 12,
              ),
              child: PrimaryButton(
                label: context.l10n.openPreorderCart(
                  count.toString(),
                  (total / 100).toStringAsFixed(2),
                ),
                icon: Icons.shopping_bag_outlined,
                onPressed: _cart,
              ),
            )
          : null,
    );
  }
}

class _DishCard extends StatelessWidget {
  const _DishCard({
    required this.dish,
    required this.quantity,
    required this.ordering,
    required this.onOpen,
    required this.onAdd,
    required this.onRemove,
  });
  final MenuDish dish;
  final int quantity;
  final bool ordering;
  final VoidCallback onOpen, onAdd, onRemove;
  @override
  Widget build(BuildContext context) => Material(
    color: SeatMapColors.surface,
    borderRadius: BorderRadius.circular(22),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onOpen,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: 132,
            width: double.infinity,
            child: DishPhoto(dish: dish),
          ),
          Expanded(
            child: Padding(
              padding: EdgeInsets.fromLTRB(13, 12, 13, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    dish.name,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.3,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Spacer(),
                  if (dish.weight.isNotEmpty)
                    Text(
                      dish.weight,
                      maxLines: 1,
                      style: TextStyle(
                        fontSize: 10,
                        color: SeatMapColors.muted,
                      ),
                    ),
                  SizedBox(height: 5),
                  Text(
                    '${dish.price} €',
                    style: TextStyle(
                      color: SeatMapColors.lavender,
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                    ),
                  ),
                  if (ordering) ...[
                    SizedBox(height: 6),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        SizedBox(
                          width: 32,
                          height: 32,
                          child: IconButton(
                            tooltip: context.l10n.removeMenuItem,
                            onPressed: quantity == 0 ? null : onRemove,
                            padding: EdgeInsets.zero,
                            icon: Icon(Icons.remove_rounded, size: 18),
                          ),
                        ),
                        Text(
                          '$quantity',
                          style: TextStyle(fontWeight: FontWeight.w600),
                        ),
                        SizedBox(
                          width: 32,
                          height: 32,
                          child: IconButton.filledTonal(
                            tooltip: context.l10n.addToPreorder,
                            onPressed: quantity >= 20 ? null : onAdd,
                            padding: EdgeInsets.zero,
                            icon: Icon(Icons.add_rounded, size: 18),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class DishPhoto extends StatefulWidget {
  const DishPhoto({super.key, required this.dish});
  final MenuDish dish;
  @override
  State<DishPhoto> createState() => _DishPhotoState();
}

class _DishPhotoState extends State<DishPhoto> {
  Uint8List? bytes;
  @override
  void initState() {
    super.initState();
    _decode();
  }

  @override
  void didUpdateWidget(covariant DishPhoto oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.dish.image != widget.dish.image) _decode();
  }

  void _decode() {
    bytes = null;
    if (widget.dish.image.startsWith('data:image/')) {
      try {
        bytes = base64Decode(widget.dish.image.split(',').last);
      } catch (_) {
        /* use the category artwork */
      }
    }
  }

  Widget _fallback() => Container(
    decoration: BoxDecoration(
      gradient: LinearGradient(
        colors: widget.dish.drink
            ? [Color(0xFF282B43), Color(0xFF181A2A)]
            : [Color(0xFF3B2C3F), Color(0xFF252134)],
      ),
    ),
    child: Center(
      child: Container(
        width: 78,
        height: 78,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(
            color: SeatMapColors.lavender.withValues(alpha: .22),
            width: 2,
          ),
        ),
        child: Icon(
          widget.dish.drink
              ? Icons.local_bar_outlined
              : Icons.restaurant_menu_rounded,
          size: 34,
          color: SeatMapColors.peach.withValues(alpha: .8),
        ),
      ),
    ),
  );
  @override
  Widget build(BuildContext context) => bytes != null
      ? Image.memory(
          bytes!,
          fit: BoxFit.cover,
          gaplessPlayback: true,
          errorBuilder: (_, _, _) => _fallback(),
        )
      : widget.dish.image.startsWith('https://')
      ? Image.network(
          widget.dish.image,
          fit: BoxFit.cover,
          errorBuilder: (_, _, _) => _fallback(),
        )
      : _fallback();
}

class PreorderCartScreen extends StatefulWidget {
  const PreorderCartScreen({
    super.key,
    required this.controller,
    required this.restaurant,
    required this.booking,
    required this.dishes,
    required this.quantities,
    required this.policy,
  });
  final AppController controller;
  final Restaurant restaurant;
  final Booking booking;
  final List<MenuDish> dishes;
  final Map<int, int> quantities;
  final PreorderSettings policy;
  @override
  State<PreorderCartScreen> createState() => _PreorderCartScreenState();
}

class _PreorderCartScreenState extends State<PreorderCartScreen> {
  final notes = TextEditingController();
  int offset = 0;
  bool consent = false, busy = false, saved = false, pricesUpdated = false;
  final serverPrices = <int, int>{};
  int _unit(MenuDish dish) => serverPrices[dish.id] ?? dish.priceMinor;
  String? error;
  late String requestId = _uuid();
  List<MenuDish> get selected =>
      widget.dishes.where((d) => (widget.quantities[d.id] ?? 0) > 0).toList();
  int get total =>
      selected.fold(0, (sum, d) => sum + _unit(d) * widget.quantities[d.id]!);
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
    notes.dispose();
    super.dispose();
  }

  void _changed() {
    saved = false;
    requestId = _uuid();
  }

  Future<void> _save() async {
    if (busy || !consent) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (!widget.booking.demo) {
        final result = await widget.controller.repository.savePreorderDraft(
          widget.booking,
          {
            'idempotencyKey': requestId,
            'items': [
              for (final d in selected)
                {'menuItemId': d.id, 'quantity': widget.quantities[d.id]},
            ],
            'serveOffsetMinutes': offset,
            'notes': notes.text.trim(),
            'language': widget.controller.appLanguageCode,
          },
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
      if (mounted) setState(() => saved = true);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(context.l10n.preorderCartTitle)),
    body: ListView(
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
            onPressed: busy ? null : () => Navigator.pop(context),
            icon: Icon(Icons.edit_outlined, size: 16),
            label: Text(context.l10n.preorderEditCart),
          ),
        ),
        SizedBox(height: 12),
        for (final dish in selected)
          Padding(
            padding: EdgeInsets.only(bottom: 18),
            child: Row(
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
                    '${dish.name}\n× ${widget.quantities[dish.id]}',
                    style: TextStyle(height: 1.5, fontWeight: FontWeight.w500),
                  ),
                ),
                SizedBox(width: 12),
                Text(
                  '${(_unit(dish) * widget.quantities[dish.id]! / 100).toStringAsFixed(2)} €',
                  style: TextStyle(
                    color: SeatMapColors.lavender,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
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
          onChanged: busy
              ? null
              : (v) => setState(() {
                  offset = v!;
                  _changed();
                }),
        ),
        SizedBox(height: 18),
        TextField(
          controller: notes,
          enabled: !busy,
          maxLength: 500,
          maxLines: 3,
          onChanged: (_) => setState(_changed),
          decoration: InputDecoration(labelText: context.l10n.preorderNotes),
        ),
        SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              context.l10n.preorderTotal,
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
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
        Container(
          padding: EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: SeatMapColors.surface,
            borderRadius: BorderRadius.circular(18),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.credit_card_rounded, color: SeatMapColors.lavender),
              SizedBox(width: 12),
              Expanded(
                child: Text(
                  context.l10n.preorderPrepaymentRule,
                  style: TextStyle(height: 1.5, fontSize: 13),
                ),
              ),
            ],
          ),
        ),
        SizedBox(height: 12),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          value: consent,
          onChanged: busy ? null : (v) => setState(() => consent = v ?? false),
          title: Text(
            context.l10n.preorderAcceptPrepayment,
            style: TextStyle(fontSize: 12, height: 1.4),
          ),
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
            child: Text(error!, style: TextStyle(color: SeatMapColors.peach)),
          ),
      ],
    ),
    bottomNavigationBar: Padding(
      padding: EdgeInsets.fromLTRB(24, 12, 24, bottomInset(context) + 12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          PrimaryButton(
            label: context.l10n.preorderPayFull(
              (total / 100).toStringAsFixed(2),
            ),
            icon: Icons.lock_outline_rounded,
            onPressed: null,
          ),
          TextButton(
            onPressed:
                consent &&
                    !saved &&
                    !busy &&
                    (widget.booking.demo ||
                        widget.booking.status == 'confirmed')
                ? _save
                : null,
            child: busy
                ? SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(
                    saved
                        ? context.l10n.preorderSavedLabel
                        : context.l10n.savePreorderDraft,
                  ),
          ),
        ],
      ),
    ),
  );
}
