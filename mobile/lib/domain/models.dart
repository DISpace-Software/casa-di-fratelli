class Restaurant {
  const Restaurant({
    required this.id,
    required this.name,
    this.cuisine = '',
    this.area = '',
    this.city = '',
    this.address = '',
    this.description = '',
    this.imageAsset = 'assets/images/cosmos.png',
    this.phone = '',
    this.timeZone = 'Europe/Sofia',
    this.opensAt = '10:00',
    this.closesAt = '21:00',
    this.leadMinutes = 15,
    this.maxDaysAhead = 10,
    this.rating = 0,
    this.availableTimes = const ['19:00', '19:30', '20:15', '20:45'],
    this.featured = false,
    this.badge,
    this.floorPlan = const FloorPlan(),
  });
  final String id,
      name,
      cuisine,
      area,
      city,
      address,
      description,
      imageAsset,
      phone,
      timeZone,
      opensAt,
      closesAt;
  final int leadMinutes, maxDaysAhead;
  final double rating;
  final List<String> availableTimes;
  final bool featured;
  final String? badge;
  final FloorPlan floorPlan;
  Restaurant copyWith({
    String? name,
    String? cuisine,
    String? area,
    String? city,
    String? address,
    String? description,
    String? imageAsset,
    String? phone,
    String? timeZone,
    String? opensAt,
    String? closesAt,
    int? leadMinutes,
    int? maxDaysAhead,
    List<String>? availableTimes,
    FloorPlan? floorPlan,
  }) => Restaurant(
    id: id,
    name: name ?? this.name,
    cuisine: cuisine ?? this.cuisine,
    area: area ?? this.area,
    city: city ?? this.city,
    address: address ?? this.address,
    description: description ?? this.description,
    imageAsset: imageAsset ?? this.imageAsset,
    phone: phone ?? this.phone,
    timeZone: timeZone ?? this.timeZone,
    opensAt: opensAt ?? this.opensAt,
    closesAt: closesAt ?? this.closesAt,
    leadMinutes: leadMinutes ?? this.leadMinutes,
    maxDaysAhead: maxDaysAhead ?? this.maxDaysAhead,
    rating: rating,
    availableTimes: availableTimes ?? this.availableTimes,
    featured: featured,
    badge: badge,
    floorPlan: floorPlan ?? this.floorPlan,
  );
}

class FloorPlan {
  const FloorPlan({
    this.zones = const [],
    this.tables = const [],
    this.combinations = const [],
    this.revision = '',
    this.publicMaxGuests = 8,
    this.publicMaxTables = 1,
  });
  final List<Zone> zones;
  final List<SeatTable> tables;
  final List<List<String>> combinations;
  final String revision;
  final int publicMaxGuests, publicMaxTables;
  FloorPlan copyWith({List<Zone>? zones, List<SeatTable>? tables}) => FloorPlan(
    zones: zones ?? this.zones,
    tables: tables ?? this.tables,
    combinations: combinations,
    revision: revision,
    publicMaxGuests: publicMaxGuests,
    publicMaxTables: publicMaxTables,
  );
}

class Zone {
  const Zone({
    required this.id,
    required this.name,
    this.presentation = 'plain',
    this.active = true,
  });
  final String id, name, presentation;
  final bool active;
}

class SeatTable {
  const SeatTable({
    required this.id,
    required this.zoneId,
    required this.label,
    required this.x,
    required this.y,
    this.capacity = 2,
    this.occupied = false,
    this.description = '',
    this.wide = false,
  });
  final String id, zoneId, label, description;
  final double x, y;
  final int capacity;
  final bool occupied, wide;
  SeatTable copyWith({bool? occupied}) => SeatTable(
    id: id,
    zoneId: zoneId,
    label: label,
    x: x,
    y: y,
    capacity: capacity,
    occupied: occupied ?? this.occupied,
    description: description,
    wide: wide,
  );
}

class Booking {
  const Booking({
    required this.id,
    required this.restaurantId,
    required this.restaurantName,
    required this.restaurantImage,
    required this.date,
    required this.time,
    required this.guests,
    required this.tableIds,
    required this.tableLabel,
    required this.guestName,
    required this.phone,
    this.status = 'confirmed',
    this.demo = true,
  });
  final String id,
      restaurantId,
      restaurantName,
      restaurantImage,
      time,
      tableLabel,
      guestName,
      phone,
      status;
  final DateTime date;
  final int guests;
  final List<String> tableIds;
  final bool demo;
  Booking copyWith({String? status}) => Booking(
    id: id,
    restaurantId: restaurantId,
    restaurantName: restaurantName,
    restaurantImage: restaurantImage,
    date: date,
    time: time,
    guests: guests,
    tableIds: tableIds,
    tableLabel: tableLabel,
    guestName: guestName,
    phone: phone,
    status: status ?? this.status,
    demo: demo,
  );
  Map<String, dynamic> toJson() => {
    'id': id,
    'restaurantId': restaurantId,
    'restaurantName': restaurantName,
    'restaurantImage': restaurantImage,
    'date': dateOnly(date),
    'time': time,
    'guests': guests,
    'tableIds': tableIds,
    'tableLabel': tableLabel,
    'guestName': guestName,
    'phone': phone,
    'status': status,
    'demo': demo,
  };
  factory Booking.fromJson(Map<String, dynamic> json) => Booking(
    id: json['id'] as String,
    restaurantId: json['restaurantId'] as String,
    restaurantName: json['restaurantName'] as String,
    restaurantImage: json['restaurantImage'] as String,
    date: DateTime.parse(json['date'] as String),
    time: json['time'] as String,
    guests: json['guests'] as int,
    tableIds: List<String>.from(json['tableIds'] as List),
    tableLabel: json['tableLabel'] as String,
    guestName: json['guestName'] as String,
    phone: json['phone'] as String,
    status: json['status'] as String,
    demo: json['demo'] as bool,
  );
}

class GuestProfile {
  const GuestProfile({
    this.id,
    this.name = '',
    this.firstName = '',
    this.lastName = '',
    this.email = '',
    this.phone = '',
    this.city = '',
    this.country = '',
    this.dateOfBirth,
    this.preferredLanguage = 'ru',
    this.marketingConsent = false,
  });
  final String? id;
  final String name,
      firstName,
      lastName,
      email,
      phone,
      city,
      country,
      preferredLanguage;
  final DateTime? dateOfBirth;
  final bool marketingConsent;
  String get displayName =>
      name.isNotEmpty ? name : '$firstName $lastName'.trim();
  Map<String, dynamic> toJson() => {
    'id': id,
    'name': displayName,
    'firstName': firstName,
    'lastName': lastName,
    'email': email,
    'phone': phone,
    'city': city,
    'country': country,
    'dateOfBirth': dateOfBirth == null ? null : dateOnly(dateOfBirth!),
    'preferredLanguage': preferredLanguage,
    'marketingConsent': marketingConsent,
  };
  factory GuestProfile.fromJson(Map<String, dynamic> json) => GuestProfile(
    id: json['id'] as String?,
    name: json['name'] as String? ?? '',
    firstName: json['firstName'] as String? ?? '',
    lastName: json['lastName'] as String? ?? '',
    email: json['email'] as String? ?? '',
    phone: json['phone'] as String? ?? '',
    city: json['city'] as String? ?? '',
    country: json['country'] as String? ?? '',
    dateOfBirth: DateTime.tryParse(json['dateOfBirth']?.toString() ?? ''),
    preferredLanguage: json['preferredLanguage'] as String? ?? 'ru',
    marketingConsent: json['marketingConsent'] as bool? ?? false,
  );
}

String dateOnly(DateTime value) =>
    '${value.year}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
