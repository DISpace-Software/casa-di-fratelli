/// A single cross-restaurant inbox response. Failed restaurants retain their
/// previous entries so a partial outage cannot make an active offer disappear.
class WaitlistInboxSnapshot {
  WaitlistInboxSnapshot.fromJson(Map<String, dynamic> json)
    : serverTimeUtc = DateTime.tryParse(
        json['serverTimeUtc']?.toString() ?? '',
      ),
      entries = (json['entries'] as List? ?? [])
          .map((entry) => Map<String, dynamic>.from(entry))
          .toList(),
      failedRestaurantIds = Set<String>.from(json['failedRestaurantIds'] ?? []);

  final DateTime? serverTimeUtc;
  final List<Map<String, dynamic>> entries;
  final Set<String> failedRestaurantIds;

  bool get isPartial => failedRestaurantIds.isNotEmpty;

  List<Map<String, dynamic>> mergeWith(List<Map<String, dynamic>> previous) => [
    ...entries,
    ...previous.where(
      (entry) => failedRestaurantIds.contains(entry['restaurantId']),
    ),
  ];
}
