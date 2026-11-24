import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:shared_preferences/shared_preferences.dart';

import 'package:material_ui/material_ui.dart';

import '../../domain/menu.dart';
import '../../data/seatmap_repository.dart';
import '../restaurant_contact.dart';
import '../../domain/models.dart';
import '../../l10n/language.dart';
import '../../l10n/menu_categories.dart';
import '../../state/app_controller.dart';
import '../components.dart';
import '../theme.dart';

String _cartKey(Booking booking, Map<String, dynamic>? draft) =>
    'preorder-cart-${booking.restaurantId}-${booking.id}-${draft?['id'] ?? 'new'}';

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
        final raw = prefs.getString(_cartKey(widget.booking!, widget.draft));
        if (raw != null) {
          final data = jsonDecode(raw) as Map<String, dynamic>;
          final stored = data['draft'] as Map<String, dynamic>?;
          if (initial &&
              data['pending'] == null &&
              widget.draft != null &&
              stored?['revision'] != widget.draft?['revision']) {
            await prefs.remove(_cartKey(widget.booking!, widget.draft));
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
      prefs.getString(_cartKey(widget.booking!, widget.draft)) ?? '{}',
    ) as Map<String, dynamic>;
    final ok = await prefs.setString(
      _cartKey(widget.booking!, widget.draft),
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
          storageKey: _cartKey(widget.booking!, widget.draft),
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
      widget.storageKey ?? _cartKey(widget.booking, widget.draft);
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
    try {
      final prefs = await SharedPreferences.getInstance();
      for (final booking in List<Booking>.of(widget.controller.bookings)) {
        if (!booking.demo && booking.managementToken.isEmpty) continue;
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
          if (mounted && generation == loadGeneration) {
            setState(
              () => error = e is StateError
                  ? context.l10n.preorderLocalSaveFailed
                  : e.toString(),
            );
          }
        }
      }
      if (mounted && generation == loadGeneration) {
        setState(() {
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
            if (!loading && visible.isEmpty && error == null)
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
          ],
        ),
      ),
    );
  }

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
