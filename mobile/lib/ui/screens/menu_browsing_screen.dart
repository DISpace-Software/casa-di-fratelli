import 'dart:convert';

import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../data/preorder_cart_key.dart';
import '../../domain/menu.dart';
import '../../domain/models.dart';
import '../../l10n/language.dart';
import '../../l10n/menu_categories.dart';
import '../../state/app_controller.dart';
import '../components.dart';
import '../theme.dart';
import '../widgets/dish_photo.dart';
import 'preorder_cart_screen.dart';
import 'sommelier_screen.dart';

class MenuScreen extends StatefulWidget {
  const MenuScreen({
    super.key,
    required this.controller,
    required this.restaurant,
    this.booking,
    this.draft,
  });
  final AppController controller;
  final Restaurant restaurant;
  final Booking? booking;
  final Map<String, dynamic>? draft;
  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> {
  final search = TextEditingController();
  Map<String, dynamic>? editingDraft;
  String? editingNotes;
  int? editingOffset;
  List<MenuDish> dishes = [];
  List<int> unavailableItems = [];
  PreorderSettings policy = const PreorderSettings();
  final quantities = <int, int>{};
  final lineNotes = <int, String>{};
  bool pendingSave = false;
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
    editingDraft = widget.draft;
    editingNotes = widget.draft?['notes'] as String? ?? '';
    editingOffset = widget.draft?['serveOffsetMinutes'] as int? ?? 0;
    final served = DateTime.tryParse(
      widget.draft?['serveAtUtc'] as String? ?? '',
    );
    if (served != null && widget.booking != null) {
      final start = widget.controller.repository
          .cancellationDeadline(widget.booking!)
          .add(Duration(minutes: widget.booking!.cancellationLeadMinutes));
      editingOffset =
          (served.difference(start).inMinutes.clamp(0, 120) ~/ 15) * 15;
    }
    for (final item in (widget.draft?['items'] as List? ?? [])) {
      quantities[item['menuItemId'] as int] =
          (quantities[item['menuItemId'] as int] ?? 0) +
          (item['quantity'] as int);
      lineNotes[item['menuItemId'] as int] = item['notes'] as String? ?? '';
    }
    _restore();
  }

  Future<void> _restore({bool initial = true}) async {
    if (widget.booking != null) {
      try {
        final prefs = await SharedPreferences.getInstance();
        final raw = prefs.getString(
          preorderCartKey(widget.booking!, widget.draft),
        );
        if (raw != null) {
          final data = jsonDecode(raw) as Map<String, dynamic>;
          final stored = data['draft'] as Map<String, dynamic>?;
          if (initial &&
              data['pending'] == null &&
              widget.draft != null &&
              stored?['revision'] != widget.draft?['revision']) {
            await prefs.remove(preorderCartKey(widget.booking!, widget.draft));
            if (mounted) await _load();
            return;
          }
          quantities.clear();
          (data['quantities'] as Map).forEach(
            (k, v) => quantities[int.parse(k)] = v as int,
          );
          (data['lineNotes'] as Map? ?? {}).forEach(
            (k, v) => lineNotes[int.parse(k)] = v as String,
          );
          editingDraft = data['draft'] as Map<String, dynamic>? ?? editingDraft;
          editingNotes = data['notes'] as String?;
          editingOffset = data['offset'] as int?;
          pendingSave = data['pending'] != null;
        }
      } catch (_) {
        /* Keep server draft if a local snapshot is corrupt. */
      }
    }
    if (mounted) await _load();
  }

  Future<void> _persist() async {
    if (widget.booking == null || pendingSave) return;
    final prefs = await SharedPreferences.getInstance();
    final existing = jsonDecode(
      prefs.getString(preorderCartKey(widget.booking!, widget.draft)) ?? '{}',
    ) as Map<String, dynamic>;
    final ok = await prefs.setString(
      preorderCartKey(widget.booking!, widget.draft),
      jsonEncode({
        ...existing,
        'quantities': quantities.map((k, v) => MapEntry('$k', v)),
        'lineNotes': lineNotes.map((k, v) => MapEntry('$k', v)),
        'draft': editingDraft,
        'notes': editingNotes ?? '',
        'offset': editingOffset ?? 0,
      }),
    );
    if (!ok) throw StateError('Could not save cart on this device');
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
      final missing = quantities.keys
          .where(
            (id) => !result.any((dish) => dish.id == id && dish.priceMinor > 0),
          )
          .toList();
      if (missing.isNotEmpty && mounted) {
        setState(() {
          unavailableItems = missing;
          error = context.l10n.preorderMenuChanged;
        });
        return;
      }
      unavailableItems = [];
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
      if (mounted) {
        setState(
          () => error = e is StateError
              ? context.l10n.preorderLocalSaveFailed
              : e.toString(),
        );
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  void _quantity(MenuDish dish, int delta) {
    if (pendingSave) {
      _cart();
      return;
    }
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
    _persist().catchError((Object e) {
      if (mounted) {
        setState(
          () => error = e is StateError
              ? context.l10n.preorderLocalSaveFailed
              : e.toString(),
        );
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
            if (!dish.drink)
              TextButton.icon(
                onPressed: () {
                  Navigator.pop(sheet);
                  _sommelier(dish);
                },
                icon: const Icon(Icons.wine_bar_outlined),
                label: Text(context.l10n.sommelierFind),
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
  Future<void> _sommelier([MenuDish? dish]) async {
    final id = await Navigator.push<int>(
      context,
      MaterialPageRoute(
        builder: (_) => SommelierScreen(
          controller: widget.controller,
          restaurant: widget.restaurant,
          dishes: dishes,
          dish: dish,
          canOrder: canOrder,
        ),
      ),
    );
    if (!mounted || id == null) return;
    final wine = dishes.where((d) => d.id == id).firstOrNull;
    if (wine != null && canOrder) _quantity(wine, 1);
  }

  Future<void> _cart() async {
    final result = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(
        builder: (_) => PreorderCartScreen(
          controller: widget.controller,
          restaurant: widget.restaurant,
          booking: widget.booking!,
          dishes: dishes,
          quantities: quantities,
          lineNotes: lineNotes,
          storageKey: preorderCartKey(widget.booking!, widget.draft),
          draft: editingDraft,
          initialNotes: editingNotes,
          initialOffset: editingOffset,
          onFormChanged: (draft, text, shift) {
            editingDraft = draft;
            editingNotes = text;
            editingOffset = shift;
          },
          policy: policy,
        ),
      ),
    );
    if (result != null && mounted) {
      Navigator.pop(context, result);
    } else if (mounted) {
      await _restore(initial: false);
    }
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
                    Text(
                      unavailableItems.isEmpty
                          ? context.l10n.msgCouldNotLoadTheMenuPleaseTryLater
                          : context.l10n.preorderMenuChanged,
                    ),
                    for (final id in unavailableItems)
                      TextButton.icon(
                        icon: Icon(Icons.remove_circle_outline),
                        label: Text(
                          '${context.l10n.removeMenuItem}: ${(editingDraft?['items'] as List? ?? []).where((item) => item['menuItemId'] == id).firstOrNull?['name'] ?? id}',
                        ),
                        onPressed: () {
                          quantities.remove(id);
                          _load();
                        },
                      ),
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
                    padding: const EdgeInsets.symmetric(
                      horizontal: 22,
                      vertical: 8,
                    ),
                    child: OutlinedButton.icon(
                      onPressed: () => _sommelier(),
                      icon: const Icon(Icons.wine_bar_outlined),
                      label: Text(context.l10n.sommelierTitle),
                    ),
                  ),
                ),
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
                        mainAxisExtent:
                            (canOrder ? 330.0 : 269.0) +
                            (MediaQuery.textScalerOf(context).scale(40) - 40),
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
      bottomNavigationBar: pendingSave || (canOrder && count > 0)
          ? Padding(
              padding: EdgeInsets.fromLTRB(
                22,
                12,
                22,
                bottomInset(context) + 12,
              ),
              child: PrimaryButton(
                label: pendingSave
                    ? context.l10n.preorderRetrySave
                    : context.l10n.openPreorderCart(
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
                          width: 44,
                          height: 44,
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
                          width: 44,
                          height: 44,
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
