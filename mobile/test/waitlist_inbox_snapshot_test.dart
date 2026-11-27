import 'package:flutter_test/flutter_test.dart';
import 'package:seatmap_mobile/data/waitlist_inbox_snapshot.dart';

void main() {
  test('partial refresh preserves only unreachable restaurants', () {
    final snapshot = WaitlistInboxSnapshot.fromJson({
      'entries': [
        {'id': 'new', 'restaurantId': 'available'},
      ],
      'failedRestaurantIds': ['offline'],
      'serverTimeUtc': '2026-11-26T10:00:00Z',
    });
    final merged = snapshot.mergeWith([
      {'id': 'stale', 'restaurantId': 'available'},
      {'id': 'held-offer', 'restaurantId': 'offline'},
      {'id': 'removed', 'restaurantId': 'empty'},
    ]);
    expect(merged.map((entry) => entry['id']), ['new', 'held-offer']);
    expect(snapshot.isPartial, isTrue);
    expect(snapshot.serverTimeUtc, DateTime.utc(2026, 11, 26, 10));
  });
}
