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
    this.websiteUrl = '',
    this.phone = '',
    this.timeZone = 'Europe/Sofia',
    this.opensAt = '10:00',
    this.closesAt = '21:00',
    this.leadMinutes = 15,
    this.maxDaysAhead = 10,
    this.cancellationLeadMinutes = 180,
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
      websiteUrl,
      timeZone,
      opensAt,
      closesAt;
  final int leadMinutes, maxDaysAhead, cancellationLeadMinutes;
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
    String? websiteUrl,
    String? timeZone,
    String? opensAt,
    String? closesAt,
    int? leadMinutes,
    int? maxDaysAhead,
    int? cancellationLeadMinutes,
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
    websiteUrl: websiteUrl ?? this.websiteUrl,
    timeZone: timeZone ?? this.timeZone,
    opensAt: opensAt ?? this.opensAt,
    closesAt: closesAt ?? this.closesAt,
    leadMinutes: leadMinutes ?? this.leadMinutes,
    maxDaysAhead: maxDaysAhead ?? this.maxDaysAhead,
    cancellationLeadMinutes:
        cancellationLeadMinutes ?? this.cancellationLeadMinutes,
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
    this.landmarks = const [],
    this.combinations = const [],
    this.revision = '',
    this.publicMaxGuests = 8,
    this.publicMaxTables = 1,
  });
  final List<Zone> zones;
  final List<SeatTable> tables;
  final List<FloorLandmark> landmarks;
  final List<List<String>> combinations;
  final String revision;
  final int publicMaxGuests, publicMaxTables;
  FloorPlan copyWith({List<Zone>? zones, List<SeatTable>? tables}) => FloorPlan(
    zones: zones ?? this.zones,
    tables: tables ?? this.tables,
    landmarks: landmarks,
    combinations: combinations,
    revision: revision,
    publicMaxGuests: publicMaxGuests,
    publicMaxTables: publicMaxTables,
  );
}

class FloorLandmark {
  const FloorLandmark({
    required this.id,
    required this.zoneId,
    required this.kind,
    required this.x,
    required this.y,
    required this.width,
    required this.height,
    this.label = '',
  });
  final String id, zoneId, kind, label;
  final double x, y, width, height;
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
    this.restaurantPhone = '',
    this.timeZone = 'Europe/Sofia',
    this.managementToken = '',
    this.startsAtUtc,
    this.cancellationDeadlineUtc,
    this.cancellationLeadMinutes = 180,
    this.serverCanCancel = true,
  });
  final String id,
      restaurantId,
      restaurantName,
      restaurantImage,
      time,
      tableLabel,
      guestName,
      phone,
      status,
      restaurantPhone,
      timeZone;
  // Kept in Keychain/encrypted storage by AppController, never serialized with metadata.
  final String managementToken;
  final DateTime date;
  final DateTime? startsAtUtc, cancellationDeadlineUtc;
  final int guests, cancellationLeadMinutes;
  final List<String> tableIds;
  final bool demo, serverCanCancel;
  Booking copyWith({
    String? status,
    String? managementToken,
    String? restaurantPhone,
    DateTime? startsAtUtc,
    DateTime? cancellationDeadlineUtc,
    int? cancellationLeadMinutes,
    bool? serverCanCancel,
    DateTime? date,
    String? time,
    int? guests,
    List<String>? tableIds,
    String? tableLabel,
  }) => Booking(
    id: id,
    restaurantId: restaurantId,
    restaurantName: restaurantName,
    restaurantImage: restaurantImage,
    date: date ?? this.date,
    time: time ?? this.time,
    guests: guests ?? this.guests,
    tableIds: tableIds ?? this.tableIds,
    tableLabel: tableLabel ?? this.tableLabel,
    guestName: guestName,
    phone: phone,
    status: status ?? this.status,
    demo: demo,
    managementToken: managementToken ?? this.managementToken,
    restaurantPhone: restaurantPhone ?? this.restaurantPhone,
    timeZone: timeZone,
    startsAtUtc: startsAtUtc ?? this.startsAtUtc,
    cancellationDeadlineUtc:
        cancellationDeadlineUtc ?? this.cancellationDeadlineUtc,
    cancellationLeadMinutes:
        cancellationLeadMinutes ?? this.cancellationLeadMinutes,
    serverCanCancel: serverCanCancel ?? this.serverCanCancel,
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
    'restaurantPhone': restaurantPhone,
    'timeZone': timeZone,
    'startsAtUtc': startsAtUtc?.toUtc().toIso8601String(),
    'cancellationDeadlineUtc': cancellationDeadlineUtc
        ?.toUtc()
        .toIso8601String(),
    'cancellationLeadMinutes': cancellationLeadMinutes,
    'serverCanCancel': serverCanCancel,
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
    restaurantPhone: json['restaurantPhone'] as String? ?? '',
    timeZone: json['timeZone'] as String? ?? 'Europe/Sofia',
    startsAtUtc: DateTime.tryParse(json['startsAtUtc']?.toString() ?? ''),
    cancellationDeadlineUtc: DateTime.tryParse(
      json['cancellationDeadlineUtc']?.toString() ?? '',
    ),
    cancellationLeadMinutes: json['cancellationLeadMinutes'] as int? ?? 180,
    serverCanCancel: json['serverCanCancel'] as bool? ?? true,
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
