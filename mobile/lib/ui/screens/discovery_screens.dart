import '../motion.dart';
import '../restaurant_contact.dart';
import '../../l10n/language.dart';

import 'package:material_ui/material_ui.dart';

import '../../domain/models.dart';
import '../../state/app_controller.dart';
import '../components.dart';
import '../theme.dart';
import 'seat_map_screen.dart';
import 'menu_screen.dart';
import 'support_screens.dart';

String shortDate(DateTime date, {bool withToday = true}) {
  final today = DateTime.now();
  final same =
      date.year == today.year &&
      date.month == today.month &&
      date.day == today.day;
  final months = [
    appStrings.msgJan,
    appStrings.msgFeb,
    appStrings.msgMar,
    appStrings.msgApr,
    appStrings.msgMay,
    appStrings.msgJun,
    appStrings.msgJul,
    appStrings.msgAug,
    appStrings.msgSep,
    appStrings.msgOct,
    appStrings.msgNov,
    appStrings.msgDec,
  ];
  return '${same && withToday ? appStrings.msgToday : ''}${date.day} ${months[date.month - 1]}';
}

String guestLabel(int guests) => appStrings.guestCount(guests);

class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.controller});
  final AppController controller;
  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) widget.controller.refreshBookings();
  }

  int tab = 0;
  int activeOrders = 0;
  bool favoritesOnly = false;
  void openRestaurant(Restaurant restaurant) => Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => RestaurantScreen(
        controller: widget.controller,
        restaurant: restaurant,
        onViewBookings: () {
          if (mounted) setState(() => tab = 2);
        },
      ),
    ),
  );
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: widget.controller,
    builder: (context, _) => Scaffold(
      body: Padding(
        padding: EdgeInsets.only(top: topInset(context)),
        child: IndexedStack(
          index: tab,
          children: [
            DiscoveryScreen(
              controller: widget.controller,
              onOpen: openRestaurant,
              onSearch: () => setState(() {
                favoritesOnly = false;
                tab = 1;
              }),
            ),
            SearchScreen(
              controller: widget.controller,
              onOpen: openRestaurant,
              favoritesOnly: favoritesOnly,
              onFavoritesChange: (value) =>
                  setState(() => favoritesOnly = value),
            ),
            BookingsScreen(
              controller: widget.controller,
              onOrders: () => setState(() => tab = 3),
              onOpenRestaurant: (id) {
                final matches = widget.controller.restaurants.where(
                  (restaurant) => restaurant.id == id,
                );
                if (matches.isNotEmpty) openRestaurant(matches.first);
              },
            ),
            PreordersScreen(
              controller: widget.controller,
              embedded: true,
              active: tab == 3,
              onActiveCountChanged: (count) {
                if (mounted && count != activeOrders) {
                  setState(() => activeOrders = count);
                }
              },
            ),
            ProfileScreen(
              controller: widget.controller,
              onFavorites: () => setState(() {
                favoritesOnly = true;
                tab = 1;
              }),
            ),
          ],
        ),
      ),
      bottomNavigationBar: Container(
        key: const ValueKey('app-bottom-navigation'),
        // Keep the tab content above Android buttons and the iOS home indicator.
        height:
            64 +
            (MediaQuery.textScalerOf(context).scale(10) - 10).clamp(0, 24) +
            bottomInset(context),
        padding: EdgeInsets.fromLTRB(13, 7, 13, bottomInset(context) + 1),
        decoration: BoxDecoration(
          color: SeatMapColors.background,
          border: Border(top: BorderSide(color: SeatMapColors.line)),
        ),
        child: Row(
          children: [
            _nav(0, Icons.home_outlined, context.l10n.msgDiscover),
            _nav(1, Icons.search_rounded, context.l10n.msgSearch),
            _nav(2, Icons.calendar_month_outlined, context.l10n.msgBookings),
            _nav(3, Icons.shopping_bag_outlined, context.l10n.ordersTab),
            _nav(4, Icons.person_outline_rounded, context.l10n.msgProfile),
          ],
        ),
      ),
    ),
  );
  Widget _nav(int index, IconData icon, String label) {
    final selected = tab == index;
    return Expanded(
      child: Semantics(
        key: ValueKey('navigation-tab-$index'),
        selected: selected,
        button: true,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => setState(() {
            tab = index;
            if (index == 1) favoritesOnly = false;
            if (index == 2) widget.controller.refreshBookings();
          }),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              AnimatedContainer(
                duration: reduceSeatMapMotion(context)
                    ? Duration.zero
                    : const Duration(milliseconds: 180),
                width: 39,
                height: 26,
                decoration: BoxDecoration(
                  color: selected
                      ? SeatMapColors.lavenderSoft
                      : Colors.transparent,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Stack(
                  clipBehavior: Clip.none,
                  alignment: Alignment.center,
                  children: [
                    Icon(
                      icon,
                      color: selected
                          ? SeatMapColors.lavender
                          : SeatMapColors.muted,
                      size: 22,
                    ),
                    if (index == 3 && activeOrders > 0)
                      Positioned(
                        right: -5,
                        top: -5,
                        child: Container(
                          key: const ValueKey('orders-count'),
                          constraints: const BoxConstraints(
                            minWidth: 17,
                            minHeight: 17,
                          ),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 4,
                            vertical: 1,
                          ),
                          decoration: const BoxDecoration(
                            color: SeatMapColors.lavender,
                            borderRadius: BorderRadius.all(Radius.circular(10)),
                          ),
                          child: Text(
                            activeOrders > 99 ? '99+' : '$activeOrders',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: SeatMapColors.background,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              SizedBox(height: 5),
              Text(
                label,
                maxLines: 1,
                softWrap: false,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 10,
                  color: selected
                      ? SeatMapColors.lavender
                      : SeatMapColors.muted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class DiscoveryScreen extends StatelessWidget {
  const DiscoveryScreen({
    super.key,
    required this.controller,
    required this.onOpen,
    required this.onSearch,
  });
  final AppController controller;
  final ValueChanged<Restaurant> onOpen;
  final VoidCallback onSearch;
  @override
  Widget build(BuildContext context) => RefreshIndicator(
    color: SeatMapColors.lavender,
    onRefresh: controller.refreshRestaurants,
    child: ListView(
      padding: EdgeInsets.fromLTRB(24, 13, 24, 25),
      children: [
        Row(
          children: [
            const SeatMapMark(width: 42),
            SizedBox(width: 9),
            Text(
              'SeatMap',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                letterSpacing: -.7,
              ),
            ),
            Spacer(),
            InkWell(
              onTap: () => chooseCity(context, controller),
              borderRadius: BorderRadius.circular(30),
              child: Container(
                height: 33,
                padding: EdgeInsets.symmetric(horizontal: 10),
                decoration: BoxDecoration(
                  color: SeatMapColors.surface,
                  border: Border.all(color: SeatMapColors.line),
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.location_on_outlined,
                      color: SeatMapColors.lavender,
                      size: 16,
                    ),
                    SizedBox(width: 4),
                    Text(
                      controller.selectedCityLabel,
                      style: TextStyle(fontSize: 12),
                    ),
                    Icon(
                      Icons.expand_more,
                      size: 15,
                      color: SeatMapColors.muted,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
        SizedBox(height: 24),
        Text(
          context.l10n.msgWhereShallWeDine,
          style: TextStyle(
            fontSize: 30,
            height: 1.15,
            fontWeight: FontWeight.w700,
            letterSpacing: -.9,
          ),
        ),
        SizedBox(height: 7),
        Text(
          context.l10n.msgRestaurantTablesInP(
            (controller.selectedCityLabel == context.l10n.msgSofia
                    ? context.l10n.msgSofia23
                    : controller.selectedCityLabel == context.l10n.msgPlovdiv
                    ? context.l10n.msgPlovdiv25
                    : controller.selectedCityLabel)
                .toString(),
          ),
          style: TextStyle(fontSize: 14, color: SeatMapColors.muted),
        ),
        SizedBox(height: 17),
        SearchParameters(controller: controller, onSearch: onSearch),
        SizedBox(height: 24),
        Row(
          children: [
            Expanded(
              child: Text(
                controller.availabilityHeading,
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -.6,
                ),
              ),
            ),
            InkWell(
              onTap: onSearch,
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  children: [
                    Text(
                      context.l10n.msgAllPlaces,
                      style: TextStyle(
                        fontSize: 12,
                        color: SeatMapColors.lavender,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    SizedBox(width: 7),
                    Icon(
                      Icons.arrow_forward_rounded,
                      size: 17,
                      color: SeatMapColors.lavender,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
        SizedBox(height: 13),
        if (controller.loading)
          SizedBox(
            height: 270,
            child: Center(child: CircularProgressIndicator()),
          )
        else if (controller.error != null)
          _LoadError(
            message: controller.error!,
            onRetry: controller.refreshRestaurants,
          )
        else if (controller.visibleRestaurants.isEmpty)
          EmptyPlaces()
        else ...[
          RestaurantCard(
            restaurant: controller.visibleRestaurants.first,
            controller: controller,
            onTap: () => onOpen(controller.visibleRestaurants.first),
          ),
          if (controller.visibleRestaurants.length > 1) ...[
            SizedBox(height: 13),
            CompactRestaurantCard(
              restaurant: controller.visibleRestaurants[1],
              onTap: () => onOpen(controller.visibleRestaurants[1]),
            ),
          ],
          SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: Text(
                  context.l10n.msgForASpecialEvening,
                  style: TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -.5,
                  ),
                ),
              ),
              SizedBox(width: 12),
              Icon(
                Icons.auto_awesome_outlined,
                size: 19,
                color: SeatMapColors.lavender,
              ),
            ],
          ),
          SizedBox(height: 12),
          ...controller.visibleRestaurants
              .skip(2)
              .map(
                (restaurant) => Padding(
                  padding: EdgeInsets.only(bottom: 12),
                  child: CompactRestaurantCard(
                    restaurant: restaurant,
                    onTap: () => onOpen(restaurant),
                  ),
                ),
              ),
        ],
      ],
    ),
  );
}

class SearchParameters extends StatelessWidget {
  const SearchParameters({
    super.key,
    required this.controller,
    required this.onSearch,
  });
  final AppController controller;
  final VoidCallback onSearch;
  @override
  Widget build(BuildContext context) => Container(
    height: 50,
    padding: EdgeInsets.symmetric(horizontal: 6),
    decoration: BoxDecoration(
      color: SeatMapColors.surface,
      borderRadius: BorderRadius.circular(17),
      border: Border.all(color: SeatMapColors.line),
    ),
    child: Row(
      children: [
        Expanded(
          flex: 11,
          child: _item(
            Icons.calendar_month_outlined,
            _isToday(controller.selectedDate)
                ? context.l10n.msgToday28
                : shortDate(controller.selectedDate, withToday: false),
            () => chooseDate(context, controller),
          ),
        ),
        Container(width: 1, height: 23, color: SeatMapColors.line),
        Expanded(
          flex: 10,
          child: _item(
            Icons.access_time_rounded,
            controller.selectedTime,
            () => chooseTime(context, controller),
          ),
        ),
        Container(width: 1, height: 23, color: SeatMapColors.line),
        Expanded(
          flex: 12,
          child: _item(
            Icons.person_outline_rounded,
            guestLabel(controller.guestCount),
            () => chooseGuests(context, controller),
          ),
        ),
        SizedBox(
          width: 37,
          height: 36,
          child: IconButton.filled(
            tooltip: context.l10n.msgFindATable,
            onPressed: onSearch,
            style: IconButton.styleFrom(
              backgroundColor: SeatMapColors.lavender,
              foregroundColor: SeatMapColors.background,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              padding: EdgeInsets.zero,
            ),
            icon: Icon(Icons.search_rounded, size: 22),
          ),
        ),
      ],
    ),
  );
  Widget _item(IconData icon, String text, VoidCallback action) => InkWell(
    onTap: action,
    borderRadius: BorderRadius.circular(12),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(icon, size: 17, color: SeatMapColors.lavender),
        SizedBox(width: 6),
        Flexible(
          child: Text(
            text,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 12),
          ),
        ),
      ],
    ),
  );
  bool _isToday(DateTime date) {
    final now = DateTime.now();
    return date.year == now.year &&
        date.month == now.month &&
        date.day == now.day;
  }
}

class RestaurantCard extends StatelessWidget {
  const RestaurantCard({
    super.key,
    required this.restaurant,
    required this.controller,
    required this.onTap,
  });
  final Restaurant restaurant;
  final AppController controller;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Material(
    color: SeatMapColors.surface,
    borderRadius: BorderRadius.circular(22),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AspectRatio(
            aspectRatio: 2.17,
            child: Stack(
              fit: StackFit.expand,
              children: [
                RestaurantPhoto(restaurant.imageAsset),
                if (restaurant.badge != null)
                  Positioned(
                    top: 13,
                    left: 13,
                    child: Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: 13,
                        vertical: 7,
                      ),
                      decoration: BoxDecoration(
                        color: SeatMapColors.peach,
                        borderRadius: BorderRadius.circular(30),
                      ),
                      child: Text(
                        restaurant.badge!,
                        style: TextStyle(
                          color: SeatMapColors.background,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                Positioned(
                  top: 12,
                  right: 12,
                  child: FavoriteButton(
                    controller: controller,
                    restaurant: restaurant,
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(15, 14, 15, 15),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        restaurant.name,
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -.7,
                        ),
                      ),
                    ),
                    Rating(restaurant.rating),
                  ],
                ),
                SizedBox(height: 3),
                Text(
                  [
                    restaurant.cuisine.isEmpty
                        ? context.l10n.restaurantLabel
                        : restaurant.cuisine,
                    restaurant.area,
                  ].where((value) => value.isNotEmpty).join(' · '),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, color: SeatMapColors.muted),
                ),
                SizedBox(height: 16),
                Row(
                  children: restaurant.availableTimes
                      .take(3)
                      .map(
                        (time) => Expanded(
                          child: Padding(
                            padding: EdgeInsets.only(
                              right:
                                  time == restaurant.availableTimes.take(3).last
                                  ? 0
                                  : 12,
                            ),
                            child: ChoicePill(
                              time,
                              onTap: () {
                                controller.setSearch(time: time);
                                onTap();
                              },
                              selected: time == controller.selectedTime,
                              height: 34,
                              padding: 5,
                            ),
                          ),
                        ),
                      )
                      .toList(),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class CompactRestaurantCard extends StatelessWidget {
  const CompactRestaurantCard({
    super.key,
    required this.restaurant,
    required this.onTap,
  });
  final Restaurant restaurant;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Material(
    color: SeatMapColors.surface,
    borderRadius: BorderRadius.circular(20),
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Padding(
        padding: EdgeInsets.all(8),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: SizedBox(
                width: 89,
                height: 89,
                child: RestaurantPhoto(restaurant.imageAsset),
              ),
            ),
            SizedBox(width: 13),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    restaurant.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                  ),
                  SizedBox(height: 5),
                  Text(
                    [
                      restaurant.cuisine.isEmpty
                          ? context.l10n.restaurantLabel
                          : restaurant.cuisine,
                      restaurant.area,
                    ].where((value) => value.isNotEmpty).join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 11, color: SeatMapColors.muted),
                  ),
                  SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    children: restaurant.availableTimes
                        .take(2)
                        .map(
                          (time) => ChoicePill(
                            time,
                            onTap: onTap,
                            height: 25,
                            padding: 14,
                          ),
                        )
                        .toList(),
                  ),
                ],
              ),
            ),
            Padding(
              padding: EdgeInsets.only(left: 5, right: 7),
              child: Icon(
                Icons.chevron_right_rounded,
                size: 22,
                color: SeatMapColors.muted,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class RestaurantPhoto extends StatelessWidget {
  const RestaurantPhoto(this.asset, {super.key, this.fit = BoxFit.cover});
  final String asset;
  final BoxFit fit;
  @override
  Widget build(BuildContext context) => asset.startsWith('http')
      ? Image.network(
          asset,
          fit: fit,
          errorBuilder: (_, _, _) =>
              Image.asset('assets/images/cosmos.png', fit: fit),
        )
      : Image.asset(
          asset,
          fit: fit,
          errorBuilder: (_, _, _) =>
              Image.asset('assets/images/cosmos.png', fit: fit),
        );
}

class Rating extends StatelessWidget {
  const Rating(this.value, {super.key});
  final double value;
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(Icons.star_border_rounded, color: SeatMapColors.peach, size: 17),
      SizedBox(width: 3),
      Text(
        value > 0 ? value.toStringAsFixed(1) : context.l10n.msgNew,
        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
      ),
    ],
  );
}

class FavoriteButton extends StatelessWidget {
  const FavoriteButton({
    super.key,
    required this.controller,
    required this.restaurant,
  });
  final AppController controller;
  final Restaurant restaurant;
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: controller,
    builder: (context, _) {
      final saved = controller.favorites.contains(restaurant.id);
      return CircleButton(
        icon: saved ? Icons.favorite_rounded : Icons.favorite_border_rounded,
        tooltip: saved
            ? context.l10n.msgRemoveFromFavourites
            : context.l10n.msgAddToFavourites,
        onTap: () => controller.toggleFavorite(restaurant.id),
        color: saved ? SeatMapColors.lavender : SeatMapColors.text,
      );
    },
  );
}

class CircleButton extends StatelessWidget {
  const CircleButton({
    super.key,
    required this.icon,
    required this.onTap,
    this.tooltip,
    this.color = SeatMapColors.text,
  });
  final IconData icon;
  final VoidCallback onTap;
  final String? tooltip;
  final Color color;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: 40,
    height: 40,
    child: IconButton(
      tooltip: tooltip ?? context.l10n.msgBack,
      onPressed: onTap,
      style: IconButton.styleFrom(
        backgroundColor: SeatMapColors.background.withValues(alpha: .94),
        side: BorderSide(color: SeatMapColors.line),
        padding: EdgeInsets.zero,
      ),
      icon: Icon(icon, size: 23, color: color),
    ),
  );
}

class SearchScreen extends StatefulWidget {
  const SearchScreen({
    super.key,
    required this.controller,
    required this.onOpen,
    required this.favoritesOnly,
    required this.onFavoritesChange,
  });
  final AppController controller;
  final ValueChanged<Restaurant> onOpen;
  final bool favoritesOnly;
  final ValueChanged<bool> onFavoritesChange;
  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  String query = '', cuisine = '';
  String? lastLanguage;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final language = Localizations.localeOf(context).languageCode;
    if (language != lastLanguage) {
      cuisine = '';
      lastLanguage = language;
    }
  }

  @override
  Widget build(BuildContext context) {
    final restaurants = widget.controller.visibleRestaurants
        .where(
          (restaurant) =>
              (!widget.favoritesOnly ||
                  widget.controller.favorites.contains(restaurant.id)) &&
              '${restaurant.name} ${restaurant.cuisine} ${restaurant.area}'
                  .toLowerCase()
                  .contains(query.toLowerCase()) &&
              (cuisine.isEmpty ||
                  cuisine == context.l10n.msgAll ||
                  restaurant.cuisine.toLowerCase().contains(
                    cuisine.toLowerCase(),
                  )),
        )
        .toList();
    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: Column(
            children: [
              PageHeading(
                widget.favoritesOnly
                    ? context.l10n.msgFavouritePlaces
                    : context.l10n.msgFindYourPlace,
                subtitle: widget.favoritesOnly
                    ? context.l10n.msgRestaurantsWorthReturningTo
                    : context.l10n.msgAGreatEveningStartsHere,
              ),
              Padding(
                padding: EdgeInsets.symmetric(horizontal: 24),
                child: Column(
                  children: [
                    TextField(
                      onChanged: (value) => setState(() => query = value),
                      decoration: InputDecoration(
                        hintText: context.l10n.msgRestaurantCuisineOrArea,
                        prefixIcon: Icon(
                          Icons.search_rounded,
                          color: SeatMapColors.lavender,
                        ),
                      ),
                      textInputAction: TextInputAction.search,
                    ),
                    SizedBox(height: 13),
                    SearchParameters(
                      controller: widget.controller,
                      onSearch: () => FocusScope.of(context).unfocus(),
                    ),
                    SizedBox(height: 17),
                    SizedBox(
                      height: 36,
                      child: ListView(
                        scrollDirection: Axis.horizontal,
                        children:
                            [
                                  context.l10n.msgAll,
                                  context.l10n.msgBulgarian,
                                  context.l10n.msgEuropean,
                                  context.l10n.msgItalian,
                                ]
                                .map(
                                  (label) => Padding(
                                    padding: EdgeInsets.only(right: 8),
                                    child: ChoicePill(
                                      label,
                                      selected: cuisine.isEmpty
                                          ? label == context.l10n.msgAll
                                          : cuisine == label,
                                      onTap: () =>
                                          setState(() => cuisine = label),
                                      padding: 15,
                                    ),
                                  ),
                                )
                                .toList(),
                      ),
                    ),
                    SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${restaurants.length} ${restaurants.length == 1 ? context.l10n.msgRestaurant : context.l10n.msgRestaurants}',
                            style: TextStyle(
                              color: SeatMapColors.muted,
                              fontSize: 12,
                            ),
                          ),
                        ),
                        IconButton(
                          tooltip: context.l10n.msgFavourites,
                          onPressed: () =>
                              widget.onFavoritesChange(!widget.favoritesOnly),
                          icon: Icon(
                            widget.favoritesOnly
                                ? Icons.favorite_rounded
                                : Icons.favorite_border_rounded,
                            color: SeatMapColors.lavender,
                            size: 21,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (widget.controller.loading)
          SliverFillRemaining(child: Center(child: CircularProgressIndicator()))
        else if (widget.controller.error != null)
          SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: _LoadError(
                message: widget.controller.error!,
                onRetry: widget.controller.refreshRestaurants,
              ),
            ),
          )
        else if (restaurants.isEmpty)
          SliverFillRemaining(hasScrollBody: false, child: EmptyPlaces())
        else
          SliverPadding(
            padding: EdgeInsets.fromLTRB(24, 0, 24, 24),
            sliver: SliverList.separated(
              itemCount: restaurants.length,
              separatorBuilder: (_, _) => SizedBox(height: 16),
              itemBuilder: (context, index) => RestaurantCard(
                restaurant: restaurants[index],
                controller: widget.controller,
                onTap: () => widget.onOpen(restaurants[index]),
              ),
            ),
          ),
      ],
    );
  }
}

class EmptyPlaces extends StatelessWidget {
  const EmptyPlaces({super.key});
  @override
  Widget build(BuildContext context) => EmptyStateIcon(
    icon: Icons.travel_explore_rounded,
    title: context.l10n.msgNoPlacesFoundYet,
    text: context.l10n.msgTryAnotherNameOrCuisineYourPlaceIs,
  );
}

class EmptyStateIcon extends StatelessWidget {
  const EmptyStateIcon({
    super.key,
    required this.icon,
    required this.title,
    required this.text,
  });
  final IconData icon;
  final String title, text;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: EdgeInsets.all(23),
            decoration: BoxDecoration(
              color: SeatMapColors.lavenderSoft,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 36, color: SeatMapColors.lavender),
          ),
          SizedBox(height: 20),
          Text(
            title,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
          ),
          SizedBox(height: 9),
          Text(
            text,
            textAlign: TextAlign.center,
            style: TextStyle(color: SeatMapColors.muted, height: 1.6),
          ),
        ],
      ),
    ),
  );
}

class _LoadError extends StatelessWidget {
  const _LoadError({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.symmetric(vertical: 24),
    child: Column(
      children: [
        Icon(Icons.wifi_off_rounded, color: SeatMapColors.lavender, size: 34),
        SizedBox(height: 12),
        Text(
          message,
          textAlign: TextAlign.center,
          style: TextStyle(color: SeatMapColors.muted),
        ),
        SizedBox(height: 16),
        PrimaryButton(
          label: context.l10n.msgTryAgain,
          onPressed: onRetry,
          icon: Icons.refresh_rounded,
        ),
      ],
    ),
  );
}

class RestaurantScreen extends StatefulWidget {
  const RestaurantScreen({
    super.key,
    required this.controller,
    required this.restaurant,
    this.onViewBookings,
  });
  final AppController controller;
  final Restaurant restaurant;
  final VoidCallback? onViewBookings;
  @override
  State<RestaurantScreen> createState() => _RestaurantScreenState();
}

class _RestaurantScreenState extends State<RestaurantScreen> {
  bool groupContactShown = false;
  late Restaurant restaurant;
  bool loading = false;
  String? error;
  List<String> get availableTimes => widget.controller.demoMode
      ? restaurant.availableTimes
      : widget.controller.repository.timesFor(
          restaurant,
          widget.controller.selectedDate,
        );
  void _ensureTime() {
    final times = availableTimes;
    if (times.isNotEmpty && !times.contains(widget.controller.selectedTime)) {
      widget.controller.setSearch(time: times.first);
    }
  }

  @override
  void initState() {
    super.initState();
    restaurant = widget.restaurant;
    _load();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final result = await widget.controller.loadRestaurantDetail(restaurant);
      if (mounted) {
        setState(() => restaurant = result);
        if (!groupContactShown &&
            restaurant.id == 'casa-di-fratelli' &&
            widget.controller.guestCount > 8) {
          groupContactShown = true;
          showRestaurantContact(
            context,
            restaurantName: restaurant.name,
            phone: restaurant.phone,
            reason: context.l10n.msgForPGuestsPleaseContactTheRestaurant(
              widget.controller.guestCount.toString(),
            ),
          );
        }
        if (!widget.controller.demoMode && availableTimes.isEmpty) {
          widget.controller.setSearch(
            date: DateTime.now().add(Duration(days: 1)),
          );
        }
        _ensureTime();
      }
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

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: widget.controller,
    builder: (context, _) => Scaffold(
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              height: 286,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  RestaurantPhoto(restaurant.imageAsset),
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Color(0x33000000),
                          Colors.transparent,
                          SeatMapColors.background,
                        ],
                        stops: [0, .65, 1],
                      ),
                    ),
                  ),
                  Positioned(
                    top: topInset(context) + 11,
                    left: 24,
                    child: CircleButton(
                      icon: Icons.chevron_left_rounded,
                      onTap: () => Navigator.pop(context),
                    ),
                  ),
                  Positioned(
                    top: topInset(context) + 11,
                    right: 24,
                    child: FavoriteButton(
                      controller: widget.controller,
                      restaurant: restaurant,
                    ),
                  ),
                  Positioned(
                    bottom: 15,
                    right: 24,
                    child: InkWell(
                      onTap: () => _gallery(context),
                      child: Container(
                        padding: EdgeInsets.symmetric(
                          horizontal: 13,
                          vertical: 7,
                        ),
                        decoration: BoxDecoration(
                          color: SeatMapColors.background.withValues(
                            alpha: .85,
                          ),
                          borderRadius: BorderRadius.circular(30),
                        ),
                        child: Text(
                          widget.controller.demoMode
                              ? context.l10n.msgOf
                              : context.l10n.msgOf50,
                          style: TextStyle(fontSize: 11),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(24, 15, 24, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          restaurant.name,
                          style: TextStyle(
                            fontSize: 36,
                            fontWeight: FontWeight.w700,
                            letterSpacing: -.9,
                          ),
                        ),
                      ),
                      Rating(restaurant.rating),
                    ],
                  ),
                  SizedBox(height: 6),
                  Text(
                    restaurant.cuisine.isEmpty
                        ? context.l10n.restaurantLabel
                        : context.l10n.msgPCuisine(restaurant.cuisine),
                    style: TextStyle(color: SeatMapColors.muted, fontSize: 14),
                  ),
                  SizedBox(height: 13),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        Icons.location_on_outlined,
                        size: 17,
                        color: SeatMapColors.lavender,
                      ),
                      SizedBox(width: 7),
                      Expanded(
                        child: Text(
                          restaurant.address,
                          style: TextStyle(
                            fontSize: 12,
                            color: SeatMapColors.muted,
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (restaurant.phone.isNotEmpty)
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton.icon(
                        onPressed: () => showRestaurantContact(
                          context,
                          restaurantName: restaurant.name,
                          phone: restaurant.phone,
                        ),
                        icon: Icon(Icons.phone_outlined, size: 17),
                        label: Text(restaurant.phone),
                      ),
                    ),
                  SizedBox(height: 17),
                  Divider(height: 1),
                  SizedBox(height: 22),
                  Text(
                    context.l10n.msgBookATable,
                    style: TextStyle(
                      fontSize: 21,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -.7,
                    ),
                  ),
                  SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: ChoicePill(
                          shortDate(widget.controller.selectedDate),
                          onTap: () async {
                            await chooseDate(
                              context,
                              widget.controller,
                              restaurant: restaurant,
                            );
                            _ensureTime();
                          },
                        ),
                      ),
                      SizedBox(width: 12),
                      Expanded(
                        child: ChoicePill(
                          guestLabel(widget.controller.guestCount),
                          onTap: () => chooseGuests(
                            context,
                            widget.controller,
                            restaurant: restaurant,
                          ),
                        ),
                      ),
                    ],
                  ),
                  SizedBox(height: 16),
                  Text(
                    context.l10n.msgAvailableTimes,
                    style: TextStyle(fontSize: 12, color: SeatMapColors.muted),
                  ),
                  SizedBox(height: 8),
                  SizedBox(
                    height: 38,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: availableTimes.length,
                      separatorBuilder: (_, _) => SizedBox(width: 9),
                      itemBuilder: (_, index) => ChoicePill(
                        availableTimes[index],
                        selected:
                            availableTimes[index] ==
                            widget.controller.selectedTime,
                        onTap: () => widget.controller.setSearch(
                          time: availableTimes[index],
                        ),
                        height: 37,
                        padding: 21,
                      ),
                    ),
                  ),
                  SizedBox(height: 23),
                  Divider(height: 1),
                  SizedBox(height: 21),
                  Text(
                    context.l10n.msgAboutTheRestaurant,
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
                  ),
                  SizedBox(height: 7),
                  Text(
                    restaurant.description,
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.35,
                      color: SeatMapColors.muted,
                    ),
                  ),
                  SizedBox(height: 21),
                  InkWell(
                    onTap: () => _menu(context),
                    borderRadius: BorderRadius.circular(15),
                    child: Container(
                      padding: EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: SeatMapColors.surface,
                        borderRadius: BorderRadius.circular(15),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.restaurant_menu_rounded,
                            color: SeatMapColors.lavender,
                            size: 21,
                          ),
                          SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              context.l10n.msgViewMenu,
                              style: TextStyle(fontWeight: FontWeight.w600),
                            ),
                          ),
                          Icon(Icons.arrow_forward_rounded, size: 19),
                        ],
                      ),
                    ),
                  ),
                  if (error != null)
                    Padding(
                      padding: EdgeInsets.only(top: 15),
                      child: _LoadError(message: error!, onRetry: _load),
                    ),
                  SizedBox(height: 10),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: Container(
        padding: EdgeInsets.fromLTRB(24, 15, 24, bottomInset(context) + 8),
        decoration: BoxDecoration(
          color: SeatMapColors.background,
          border: Border(top: BorderSide(color: SeatMapColors.line)),
        ),
        child: PrimaryButton(
          label:
              restaurant.id == 'casa-di-fratelli' &&
                  widget.controller.guestCount > 8
              ? context.l10n.callRestaurant
              : context.l10n.msgChooseATable,
          loading: loading,
          onPressed:
              restaurant.id == 'casa-di-fratelli' &&
                  widget.controller.guestCount > 8
              ? () => showRestaurantContact(
                  context,
                  restaurantName: restaurant.name,
                  phone: restaurant.phone,
                  reason: context.l10n.msgForPGuestsPleaseContactTheRestaurant(
                    widget.controller.guestCount.toString(),
                  ),
                )
              : error != null || availableTimes.isEmpty
              ? null
              : () => Navigator.push(
                  context,
                  MaterialPageRoute<void>(
                    builder: (_) => SeatMapScreen(
                      controller: widget.controller,
                      restaurant: restaurant,
                      onViewBookings: widget.onViewBookings,
                    ),
                  ),
                ),
        ),
      ),
    ),
  );
  void _gallery(BuildContext context) {
    final photos = widget.controller.demoMode
        ? [
            restaurant.imageAsset,
            'assets/images/made_in_blue.png',
            'assets/images/cofein.webp',
            'assets/images/gallery_room.webp',
            'assets/images/gallery_terrace.webp',
            'assets/images/gallery_garden.webp',
          ]
        : [restaurant.imageAsset];
    var current = 0;
    showDialog<void>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, update) => Dialog.fullscreen(
          backgroundColor: SeatMapColors.background,
          child: Stack(
            children: [
              Positioned.fill(
                child: PageView.builder(
                  itemCount: photos.length,
                  onPageChanged: (index) => update(() => current = index),
                  itemBuilder: (context, index) => Center(
                    child: InteractiveViewer(
                      minScale: 1,
                      maxScale: 4,
                      child: RestaurantPhoto(
                        photos[index],
                        fit: BoxFit.contain,
                      ),
                    ),
                  ),
                ),
              ),
              Positioned(
                top: topInset(context) + 12,
                left: 24,
                child: CircleButton(
                  icon: Icons.close_rounded,
                  onTap: () => Navigator.pop(context),
                ),
              ),
              Positioned(
                top: topInset(context) + 23,
                right: 24,
                child: Text(
                  context.l10n.msgPOfP(
                    (current + 1).toString(),
                    (photos.length).toString(),
                  ),
                  style: TextStyle(fontSize: 13, color: SeatMapColors.muted),
                ),
              ),
              Positioned(
                bottom: 45,
                left: 24,
                right: 24,
                child: Text(
                  widget.controller.demoMode
                      ? context.l10n.msgAtmosphereDemoPhotos
                      : restaurant.name,
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, color: SeatMapColors.muted),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _menu(BuildContext context) => Navigator.push<void>(
    context,
    MaterialPageRoute(
      builder: (_) =>
          MenuScreen(controller: widget.controller, restaurant: restaurant),
    ),
  );
}

Future<void> chooseDate(
  BuildContext context,
  AppController controller, {
  Restaurant? restaurant,
}) async {
  final now = DateUtils.dateOnly(DateTime.now());
  final last = now.add(Duration(days: restaurant?.maxDaysAhead ?? 365));
  final date = await showDatePicker(
    context: context,
    initialDate: controller.selectedDate.isBefore(now)
        ? now
        : controller.selectedDate.isAfter(last)
        ? last
        : controller.selectedDate,
    firstDate: now,
    lastDate: last,
    helpText: context.l10n.msgWhenShallWeMeet,
    cancelText: context.l10n.msgBack,
    confirmText: context.l10n.msgSelect,
    builder: (context, child) => Theme(
      data: Theme.of(context).copyWith(
        datePickerTheme: DatePickerThemeData(
          backgroundColor: SeatMapColors.surface,
        ),
      ),
      child: child!,
    ),
  );
  if (date != null) controller.setSearch(date: date);
}

Future<void> chooseTime(
  BuildContext context,
  AppController controller, {
  Restaurant? restaurant,
}) async {
  final times = restaurant != null && !controller.demoMode
      ? controller.repository.timesFor(restaurant, controller.selectedDate)
      : List.generate(49, (index) {
          final minute = 600 + index * 15;
          return '${(minute ~/ 60).toString().padLeft(2, '0')}:${(minute % 60).toString().padLeft(2, '0')}';
        });
  await showSeatMapSheet<void>(
    context,
    title: context.l10n.msgWhatTimeShallWeExpectYou,
    child: SizedBox(
      height: 290,
      child: GridView.builder(
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 4,
          mainAxisExtent: 41,
          mainAxisSpacing: 10,
          crossAxisSpacing: 9,
        ),
        itemCount: times.length,
        itemBuilder: (context, index) {
          final time = times[index];
          return ChoicePill(
            time,
            padding: 0,
            height: 40,
            selected: time == controller.selectedTime,
            onTap: () {
              controller.setSearch(time: time);
              Navigator.pop(context);
            },
          );
        },
      ),
    ),
  );
}

Future<void> chooseGuests(
  BuildContext context,
  AppController controller, {
  Restaurant? restaurant,
}) async {
  final casa = restaurant?.id == 'casa-di-fratelli';
  var guests = casa ? controller.guestCount.clamp(1, 8) : controller.guestCount;
  await showSeatMapSheet<void>(
    context,
    title: context.l10n.msgHowManyGuests,
    child: StatefulBuilder(
      builder: (context, setState) => Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              IconButton.outlined(
                onPressed: guests > 1 ? () => setState(() => guests--) : null,
                icon: Icon(Icons.remove_rounded),
              ),
              Padding(
                padding: EdgeInsets.symmetric(horizontal: 35),
                child: Column(
                  children: [
                    AnimatedSwitcher(
                      duration: Duration(
                        milliseconds: reduceSeatMapMotion(context) ? 0 : 200,
                      ),
                      transitionBuilder: (child, animation) => FadeTransition(
                        opacity: animation,
                        child: ScaleTransition(scale: animation, child: child),
                      ),
                      child: Text(
                        '$guests',
                        key: ValueKey(guests),
                        style: TextStyle(
                          fontSize: 38,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    Text(
                      context.l10n.msgGuests15,
                      style: TextStyle(color: SeatMapColors.muted),
                    ),
                  ],
                ),
              ),
              IconButton.outlined(
                onPressed: guests < 20
                    ? () {
                        if (casa && guests >= 8) {
                          showRestaurantContact(
                            context,
                            restaurantName: restaurant!.name,
                            phone: restaurant.phone,
                            reason: context.l10n
                                .msgForPGuestsPleaseContactTheRestaurant('9'),
                          );
                        } else {
                          setState(() => guests++);
                        }
                      }
                    : null,
                icon: Icon(Icons.add_rounded),
              ),
            ],
          ),
          SizedBox(height: 25),
          PrimaryButton(
            label: context.l10n.msgDone,
            onPressed: () {
              controller.setSearch(guests: guests);
              Navigator.pop(context);
            },
          ),
        ],
      ),
    ),
  );
}

Future<void> chooseCity(BuildContext context, AppController controller) async {
  await showSeatMapSheet<void>(
    context,
    title: context.l10n.msgYourCity,
    child: Column(
      children:
          [
                context.l10n.msgSofia,
                context.l10n.msgPlovdiv,
                context.l10n.msgVarna,
                context.l10n.msgBurgas,
              ]
              .map(
                (city) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(
                    Icons.location_on_outlined,
                    color: SeatMapColors.lavender,
                  ),
                  title: Text(city),
                  trailing: controller.selectedCityLabel == city
                      ? Icon(Icons.check_rounded, color: SeatMapColors.lavender)
                      : null,
                  onTap: () {
                    controller.setSearch(city: city);
                    Navigator.pop(context);
                  },
                ),
              )
              .toList(),
    ),
  );
}
