import 'package:material_ui/material_ui.dart';

import '../../domain/menu.dart';
import '../../domain/models.dart';
import '../../state/app_controller.dart';
import '../../l10n/language.dart';
import '../theme.dart';
import '../restaurant_contact.dart';

class SommelierScreen extends StatefulWidget {
  const SommelierScreen({
    super.key,
    required this.controller,
    required this.restaurant,
    required this.dishes,
    this.dish,
    this.canOrder = false,
  });
  final AppController controller;
  final Restaurant restaurant;
  final List<MenuDish> dishes;
  final MenuDish? dish;
  final bool canOrder;
  @override
  State<SommelierScreen> createState() => _SommelierScreenState();
}

class _SommelierScreenState extends State<SommelierScreen> {
  int? dishId;
  String? serving, style;
  final budget = TextEditingController();
  bool loading = false;
  bool failed = false;
  String? status;
  List<Map<String, dynamic>> results = [];
  int generation = 0;
  @override
  void initState() {
    super.initState();
    dishId = widget.dish?.id;
    if (dishId != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) search();
      });
    }
  }

  @override
  void dispose() {
    budget.dispose();
    super.dispose();
  }

  void reset() {
    generation++;
    loading = false;
    results = [];
    status = null;
    failed = false;
  }

  Future<void> search() async {
    if (dishId == null) return;
    final text = budget.text.trim().replaceAll(',', '.');
    final amount = text.isEmpty ? null : double.tryParse(text);
    if (text.isNotEmpty &&
        (amount == null ||
            !amount.isFinite ||
            amount <= 0 ||
            amount > 100000)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.l10n.sommelierBudgetInvalid)),
      );
      return;
    }
    final request = ++generation;
    setState(() {
      loading = true;
      failed = false;
      results = [];
      status = null;
    });
    try {
      final response = await widget.controller.repository.sommelier(
        widget.restaurant,
        dishId!,
        serving: serving,
        style: style,
        maxPriceMinor: amount == null ? null : (amount * 100).round(),
      );
      if (!mounted || request != generation) return;
      setState(() {
        status = response['status'] as String?;
        results =
            ((response['status'] == 'consultation'
                            ? response['menuOptions']
                            : response['recommendations'])
                        as List? ??
                    [])
                .map((x) => Map<String, dynamic>.from(x))
                .toList();
      });
    } catch (_) {
      if (mounted && request == generation) setState(() => failed = true);
    } finally {
      if (mounted && request == generation) setState(() => loading = false);
    }
  }

  String reason(String code) => switch (code) {
    'freshness' => context.l10n.sommelierFreshness,
    'sweetness' => context.l10n.sommelierSweetness,
    'spice' => context.l10n.sommelierSpice,
    _ => context.l10n.sommelierBalance,
  };
  @override
  Widget build(BuildContext context) {
    final food = widget.dishes.where((x) => !x.drink).toList();
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.sommelierTitle)),
      body: ListView(
        padding: const EdgeInsets.all(22),
        children: [
          const Icon(
            Icons.wine_bar_outlined,
            size: 52,
            color: SeatMapColors.lavender,
          ),
          const SizedBox(height: 16),
          Text(
            widget.restaurant.name,
            style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 10),
          Text(
            context.l10n.sommelierSubtitle,
            style: const TextStyle(color: SeatMapColors.muted, height: 1.5),
          ),
          const SizedBox(height: 24),
          DropdownButtonFormField<int>(
            initialValue: dishId,
            isExpanded: true,
            decoration: InputDecoration(labelText: context.l10n.sommelierDish),
            items: food
                .map(
                  (d) => DropdownMenuItem(
                    value: d.id,
                    child: Text(d.name, overflow: TextOverflow.ellipsis),
                  ),
                )
                .toList(),
            onChanged: (id) {
              setState(() {
                dishId = id;
                reset();
              });
              search();
            },
          ),
          const SizedBox(height: 18),
          ExpansionTile(
            title: Text(context.l10n.sommelierFilters),
            children: [
              DropdownButtonFormField<String>(
                initialValue: 'any',
                decoration: InputDecoration(
                  labelText: context.l10n.sommelierServing,
                ),
                items: [
                  DropdownMenuItem(
                    value: 'any',
                    child: Text(context.l10n.sommelierAny),
                  ),
                  DropdownMenuItem(
                    value: 'glass',
                    child: Text(context.l10n.sommelierGlass),
                  ),
                  DropdownMenuItem(
                    value: 'bottle',
                    child: Text(context.l10n.sommelierBottle),
                  ),
                ],
                onChanged: (value) => setState(() {
                  serving = value == 'any' ? null : value;
                  reset();
                }),
              ),
              const SizedBox(height: 18),
              DropdownButtonFormField<String>(
                initialValue: 'any',
                decoration: InputDecoration(
                  labelText: context.l10n.sommelierStyle,
                ),
                items: [
                  for (final pair in [
                    ('any', context.l10n.sommelierAny),
                    ('white', context.l10n.sommelierWhite),
                    ('red', context.l10n.sommelierRed),
                    ('rose', context.l10n.sommelierRose),
                    ('sparkling', context.l10n.sommelierSparkling),
                    ('dessert', context.l10n.sommelierDessert),
                  ])
                    DropdownMenuItem(value: pair.$1, child: Text(pair.$2)),
                ],
                onChanged: (value) => setState(() {
                  style = value == 'any' ? null : value;
                  reset();
                }),
              ),
              const SizedBox(height: 18),
              TextField(
                controller: budget,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: InputDecoration(
                  labelText: context.l10n.sommelierBudget,
                ),
                onChanged: (_) => setState(reset),
              ),
              const SizedBox(height: 22),
              FilledButton.icon(
                onPressed: loading || dishId == null ? null : search,
                icon: const Icon(Icons.wine_bar_outlined),
                label: Text(context.l10n.sommelierFind),
              ),
            ],
          ),
          if (loading)
            const Padding(
              padding: EdgeInsets.all(24),
              child: Center(child: CircularProgressIndicator()),
            ),
          if (failed) ...[
            const SizedBox(height: 20),
            Text(context.l10n.sommelierFailed),
            TextButton(
              onPressed: search,
              child: Text(context.l10n.msgTryAgain246),
            ),
          ],
          if (status != null &&
              (results.isEmpty || status == 'consultation')) ...[
            const SizedBox(height: 24),
            Text(
              status == 'no_wines'
                  ? context.l10n.sommelierNoWines
                  : status == 'consultation'
                  ? context.l10n.sommelierConsultation
                  : status == 'no_match'
                  ? context.l10n.sommelierNoMatch
                  : context.l10n.sommelierUnconfigured,
              style: const TextStyle(height: 1.5),
            ),
            TextButton.icon(
              onPressed: () => showRestaurantContact(
                context,
                restaurantName: widget.restaurant.name,
                phone: widget.restaurant.phone,
              ),
              icon: const Icon(Icons.chat_bubble_outline),
              label: Text(context.l10n.preorderContactRestaurant),
            ),
          ],
          for (final result in results)
            Container(
              margin: const EdgeInsets.only(top: 20),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: SeatMapColors.surface,
                borderRadius: BorderRadius.circular(24),
                border: Border.all(
                  color: SeatMapColors.lavender.withValues(alpha: .25),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    result['name']?.toString().isNotEmpty == true
                        ? result['name']
                        : result['wineName'] ?? '',
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '${result['volume']} · ${((result['priceMinor'] as num) / 100).toStringAsFixed(2)} €',
                    style: const TextStyle(
                      color: SeatMapColors.lavender,
                      fontSize: 18,
                    ),
                  ),
                  const SizedBox(height: 12),
                  for (final code in result['reasons'] as List? ?? [])
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        reason(code.toString()),
                        style: const TextStyle(height: 1.5),
                      ),
                    ),
                  if (widget.canOrder && status == 'ok')
                    FilledButton(
                      onPressed: () =>
                          Navigator.pop(context, result['menuItemId'] as int),
                      child: Text(context.l10n.addToPreorder),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
