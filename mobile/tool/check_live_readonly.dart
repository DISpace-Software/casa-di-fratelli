import 'dart:io';

import 'package:seatmap_mobile/data/seatmap_repository.dart';

// Optional read-only smoke check. This tool never submits or changes a booking.
Future<void> main(List<String> args) async {
  if (args.length != 1) {
    throw ArgumentError('Pass the backend HTTPS origin as the only argument.');
  }
  final repository = SeatMapRepository(baseUrl: args.single);
  try {
    final restaurants = await repository.getRestaurants();
    if (restaurants.isEmpty) throw StateError('No published restaurants.');
    for (final summary in restaurants) {
      final restaurant = await repository.loadRestaurantDetail(summary);
      final date = DateTime.now().add(const Duration(days: 1));
      final times = repository.timesFor(restaurant, date);
      if (times.isEmpty) {
        throw StateError('No configured booking times for ${restaurant.name}.');
      }
      final map = await repository.loadAvailability(
        restaurant,
        date: date,
        time: times.first,
        guests: 2,
      );
      final menu = await repository.loadMenu(restaurant);
      stdout.writeln(
        'PASS ${restaurant.name}: ${map.zones.length} zones, ${map.tables.length} active tables, ${times.length} time slots, ${menu.length} menu items. Read-only; no reservation submitted.',
      );
    }
  } finally {
    repository.close();
  }
}
