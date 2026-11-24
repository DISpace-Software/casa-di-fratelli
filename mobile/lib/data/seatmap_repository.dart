import '../l10n/data_messages.dart';

import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../domain/models.dart';
import '../domain/menu.dart';
import 'demo_data.dart';

class SeatMapException implements Exception {
  const SeatMapException(
    this.message, {
    this.uncertain = false,
    this.code = '',
  });
  final String code;
  final String message;
  final bool uncertain;
  @override
  String toString() => message;
}

class SeatMapRepository {
  SeatMapRepository({
    String? baseUrl,
    http.Client? client,
    DateTime Function()? now,
  }) : baseUrl = resolveBaseUrl(
         baseUrl ??
             const String.fromEnvironment(
               'SEATMAP_API_BASE_URL',
               defaultValue: 'https://casa-di-fratelli-api.onrender.com',
             ),
       ).trim().replaceFirst(RegExp(r'/+$'), ''),
       _client = client ?? http.Client(),
       _now = now ?? DateTime.now {
    if (!_zonesInitialized) {
      tzdata.initializeTimeZones();
      _zonesInitialized = true;
    }
    if (this.baseUrl.isNotEmpty) {
      final uri = Uri.tryParse(this.baseUrl);
      if (uri == null ||
          !uri.hasAuthority ||
          !['http', 'https'].contains(uri.scheme) ||
          uri.userInfo.isNotEmpty ||
          uri.hasQuery ||
          uri.hasFragment) {
        throw SeatMapException(
          appStrings.msgEnterAValidAPIAddressWithoutCredentialsOr,
        );
      }
    }
  }
  static String resolveBaseUrl(String value) =>
      value == 'same-origin' && Uri.base.hasAuthority ? Uri.base.origin : value;
  String languageCode = AppLanguage.code;
  String _translated(Map<String, dynamic> value, String key) {
    final suffix = languageCode[0].toUpperCase() + languageCode.substring(1);
    return _string(
      value['$key$suffix'],
      _string(
        value['${key}En'],
        _string(value['${key}Bg'], _string(value['${key}Ru'])),
      ),
    );
  }

  Future<String?> detectCountry() async {
    if (demoMode) return null;
    try {
      final value = _object(
        await _request('/api/v1/platform/context')
            .timeout(const Duration(seconds: 3)),
      );
      return value['countryCode'] as String?;
    } catch (_) {
      return null;
    }
  }

  static bool _zonesInitialized = false;
  final String baseUrl;
  final http.Client _client;
  final DateTime Function() _now;
  bool get demoMode => baseUrl.isEmpty;
  void close() => _client.close();
  String _path(Restaurant restaurant) =>
      '/api/v1/restaurants/${Uri.encodeComponent(restaurant.id)}';
  Future<dynamic> _request(
    String path, {
    Map<String, dynamic>? body,
    Map<String, String> headers = const {},
    bool guestManagement = false,
  }) async {
    http.Response response;
    try {
      final uri = Uri.parse('$baseUrl$path');
      response =
          await (body == null
                  ? _client.get(
                      uri,
                      headers: {'Accept': 'application/json', ...headers},
                    )
                  : _client.post(
                      uri,
                      headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        ...headers,
                      },
                      body: jsonEncode(body),
                    ))
              .timeout(Duration(seconds: 15));
    } on Exception {
      throw SeatMapException(
        guestManagement
            ? appStrings.bookingUpdateFailed
            : body == null
            ? appStrings.msgCouldNotReachTheRestaurantCheckYourConnection
            : appStrings.msgNoResponseReceivedYourBookingMayHaveBeen,
        uncertain: body != null,
      );
    }
    dynamic decoded;
    try {
      decoded = jsonDecode(response.body);
    } on FormatException {
      throw SeatMapException(
        appStrings.msgTheRestaurantReturnedAnUnexpectedResponseP(
          (body == null
                  ? appStrings.msgPleaseTryLater
                  : appStrings.msgCheckWhetherYourBookingWasSavedBeforeTrying)
              .toString(),
        ),
        uncertain: body != null,
      );
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final code = decoded is Map ? decoded['code']?.toString() ?? '' : '';
      if (guestManagement) {
        throw SeatMapException(
          code == 'PREORDERS_DISABLED'
              ? appStrings.preordersNotOffered
              : code == 'PREORDER_CHANGED'
              ? appStrings.preorderChanged
              : code == 'PREORDER_MENU_CHANGED'
              ? appStrings.preorderMenuChanged
              : code == 'PREORDER_TOO_LATE'
              ? appStrings.preorderTooLate
              : code == 'PREORDER_BOOKING_UNCONFIRMED'
              ? appStrings.preorderConfirmBookingFirst
              : code.startsWith('PREORDER') || code.startsWith('CARD_')
              ? appStrings.preorderActionFailed
              : code == 'CONTACT_RESTAURANT'
              ? appStrings.cancellationContactRequired
              : response.statusCode == 404
              ? appStrings.bookingAccessUnavailable
              : appStrings.bookingUpdateFailed,
          code: code,
        );
      }
      final message = switch (response.statusCode) {
        409 => appStrings.msgThisTableIsAlreadyTakenReturnToThe,
        429 => appStrings.msgTheBookingLimitHasBeenReachedPleaseTry,
        404 => appStrings.msgTheRestaurantOrItsDetailsAreNotAvailable,
        _ =>
          decoded is Map && decoded['message'] is String
              ? decoded['message'] as String
              : decoded is String
              ? decoded
              : appStrings.msgCouldNotCompleteTheRequestP(
                  (response.statusCode).toString(),
                ),
      };
      throw SeatMapException(message);
    }
    return decoded;
  }

  Map<String, dynamic> _object(dynamic value) {
    if (value is! Map<String, dynamic>) {
      throw SeatMapException(appStrings.msgInvalidRestaurantData);
    }
    return value;
  }

  List<dynamic> _list(dynamic value) {
    if (value is! List) {
      throw SeatMapException(appStrings.msgInvalidRestaurantData);
    }
    return value;
  }

  String _string(dynamic value, [String fallback = '']) =>
      value is String && value.trim().isNotEmpty ? value : fallback;

  Future<List<Restaurant>> getRestaurants() async {
    if (demoMode) return List.of(demoRestaurants);
    final catalog = _object(await _request('/api/v1/restaurants'));
    return Future.wait(
      _list(catalog['restaurants']).map((raw) async {
        final row = _object(raw);
        final id = _string(row['id']), name = _string(row['name']);
        if (id.isEmpty || name.isEmpty) {
          throw SeatMapException(appStrings.msgInvalidRestaurantCatalogue);
        }
        final image = id == 'casa-di-fratelli'
            ? 'assets/images/casa.webp'
            : id == 'cofein'
            ? 'assets/images/cofein.webp'
            : 'assets/images/cosmos.png';
        final restaurant = Restaurant(
          id: id,
          name: name,
          websiteUrl: _string(row['websiteUrl']),
          city: '',
          area: '',
          imageAsset: image,
          availableTimes: [],
        );
        return _withBranding(
          restaurant,
          _object(await _request('${_path(restaurant)}/branding')),
        );
      }),
    );
  }

  Restaurant _withBranding(Restaurant restaurant, Map<String, dynamic> brand) {
    final result = restaurant.copyWith(
      name: _string(brand['name'], restaurant.name),
      address: _translated(brand, 'address'),
      phone: _string(brand['phone']),
      timeZone: _string(brand['timeZoneId'], 'Europe/Sofia'),
      opensAt: _string(brand['walkInOpeningTime'], '10:00'),
      closesAt: _string(brand['publicLatestReservationTime'], '21:00'),
      leadMinutes: brand['publicLeadMinutes'] as int? ?? 15,
      maxDaysAhead: brand['publicMaxReservationDaysAhead'] as int? ?? 10,
      cancellationLeadMinutes:
          brand['guestCancellationLeadMinutes'] as int? ?? 180,
    );
    return result.copyWith(
      availableTimes: timesFor(
        result,
        _restaurantNow(result),
      ).where((time) => _minutes(time) >= 17 * 60).take(4).toList(),
    );
  }

  Future<Restaurant> loadRestaurantDetail(Restaurant restaurant) async {
    if (demoMode) return restaurant;
    final values = await Future.wait([
      _request('${_path(restaurant)}/branding'),
      _request('${_path(restaurant)}/floor-plan'),
    ]);
    return _withBranding(
      restaurant,
      _object(values[0]),
    ).copyWith(floorPlan: parseFloorPlan(_object(values[1])));
  }

  FloorPlan parseFloorPlan(Map<String, dynamic> value) {
    if (value['schemaVersion'] != 1 || value['revision'] is! String) {
      throw SeatMapException(appStrings.msgThisMapVersionIsNotSupportedYet);
    }
    final zones = _list(value['zones']).map((raw) {
      final zone = _object(raw);
      final names = zone['names'];
      return Zone(
        id: zone['id'] as String,
        name: names is Map
            ? _string(
                names[languageCode],
                _string(
                  names['en'],
                  _string(names['bg'], _string(zone['name'])),
                ),
              )
            : _string(zone['name']),
        presentation: _string(zone['presentation'], 'plain'),
        active: zone['isActive'] == true,
      );
    }).toList();
    final tables = _list(value['tables'])
        .where((raw) => _object(raw)['isActive'] == true)
        .map((raw) {
          final row = _object(raw);
          final id = row['id'] as String, area = row['area'] as String;
          return SeatTable(
            id: id,
            zoneId: area,
            label: id,
            x: (row['x'] as num).toDouble(),
            y: (row['y'] as num).toDouble(),
            capacity: row['seats'] as int,
            wide: row['wide'] == true,
            occupied: !zones.any((zone) => zone.id == area && zone.active),
            description: appStrings.msgUpToPGuests((row['seats']).toString()),
          );
        })
        .toList();
    return FloorPlan(
      revision: value['revision'] as String,
      landmarks: (value['landmarks'] as List? ?? []).map((raw) {
        final item = _object(raw);
        final names = item['names'];
        return FloorLandmark(
          id: item['id'] as String,
          zoneId: item['zoneId'] as String,
          kind: item['kind'] as String,
          x: (item['x'] as num).toDouble(),
          y: (item['y'] as num).toDouble(),
          width: (item['width'] as num).toDouble(),
          height: (item['height'] as num).toDouble(),
          label: names is Map
              ? _string(
                  names[languageCode],
                  _string(names['en'], _string(names['bg'])),
                )
              : '',
        );
      }).toList(),
      zones: zones,
      tables: tables,
      combinations: _list(value['combinations'])
          .map((group) => List<String>.from(_list(group)))
          .toList(),
      publicMaxGuests: value['publicMaxGuests'] as int,
      publicMaxTables: value['publicMaxTables'] as int,
    );
  }

  Future<FloorPlan> loadAvailability(
    Restaurant restaurant, {
    required DateTime date,
    required String time,
    required int guests,
  }) async {
    if (demoMode) return restaurant.floorPlan;
    final values = await Future.wait([
      _request('${_path(restaurant)}/floor-plan'),
      _request('${_path(restaurant)}/reservations/blocked-slots'),
      _request('${_path(restaurant)}/zones'),
      _request('${_path(restaurant)}/closure'),
    ]);
    final plan = parseFloorPlan(_object(values[0]));
    final zones = _object(values[2]);
    final closedZones = Set<String>.from(_list(zones['closedAreas']));
    final closure = _object(values[3]);
    final day = dateOnly(date);
    final restaurantClosed =
        closure['enabled'] == true &&
        day.compareTo(closure['startDate'] as String) >= 0 &&
        day.compareTo(closure['endDate'] as String) <= 0;
    final occupied = <String>{};
    for (final raw in _list(values[1])) {
      final slot = _object(raw);
      if (slot['reservedDate'] != day) continue;
      final overlaps =
          slot['isPublicHold'] == true ||
          blockedAt(
            slot['reservedTime'] as String,
            time,
            isHallBlock: slot['isHallBlock'] == true,
          );
      if (overlaps) {
        occupied.addAll(
          List<String>.from(_list(slot['tableIds']))
              .map((id) => id.toLowerCase()),
        );
      }
    }
    return plan.copyWith(
      zones: plan.zones
          .map(
            (zone) => Zone(
              id: zone.id,
              name: zone.name,
              presentation: zone.presentation,
              active:
                  zone.active &&
                  !restaurantClosed &&
                  !closedZones.contains(zone.id),
            ),
          )
          .toList(),
      tables: plan.tables
          .map(
            (table) => table.copyWith(
              occupied:
                  table.occupied ||
                  restaurantClosed ||
                  closedZones.contains(table.zoneId) ||
                  occupied.contains(table.id.toLowerCase()),
            ),
          )
          .toList(),
    );
  }

  static bool blockedAt(
    String value,
    String target, {
    bool isHallBlock = false,
  }) {
    final minute = _minutes(target);
    for (final part in value.split(',')) {
      final range = part.trim().split(' - '),
          start = _minutes(part.trim().split(' - ').first);
      final end = range.length > 1 ? _minutes(range[1]) : start;
      if (isHallBlock) {
        if (start <= end
            ? minute >= start && minute <= end
            : minute >= start || minute <= end) {
          return true;
        }
      } else {
        final last = end < start ? end + 1440 : end;
        for (var point = start; point <= last; point += 60) {
          final distance = ((point % 1440) - minute).abs();
          if (distance < 180 || 1440 - distance < 180) return true;
        }
      }
    }
    return false;
  }

  static int _minutes(String value) {
    if (!RegExp(r'^([01]\d|2[0-3]):[0-5]\d$').hasMatch(value)) {
      throw SeatMapException(appStrings.msgInvalidRestaurantOpeningTimes);
    }
    return int.parse(value.substring(0, 2)) * 60 +
        int.parse(value.substring(3));
  }

  DateTime _restaurantNow(Restaurant restaurant) =>
      tz.TZDateTime.from(_now().toUtc(), tz.getLocation(restaurant.timeZone));
  List<String> timesFor(Restaurant restaurant, DateTime date) {
    final now = _restaurantNow(restaurant);
    final day = DateTime(date.year, date.month, date.day),
        today = DateTime(now.year, now.month, now.day);
    if (day.isBefore(today) ||
        day.isAfter(today.add(Duration(days: restaurant.maxDaysAhead)))) {
      return [];
    }
    final times = <String>[];
    for (
      var minute = _minutes(restaurant.opensAt);
      minute <= _minutes(restaurant.closesAt);
      minute += 15
    ) {
      if (day == today &&
          minute < now.hour * 60 + now.minute + restaurant.leadMinutes) {
        continue;
      }
      times.add(
        '${(minute ~/ 60).toString().padLeft(2, '0')}:${(minute % 60).toString().padLeft(2, '0')}',
      );
    }
    return times;
  }

  Future<Booking> createBooking({
    required Restaurant restaurant,
    required List<String> tableIds,
    required DateTime date,
    required String time,
    required int guests,
    required String guestName,
    required String phone,
    String? email,
    String? notes,
  }) async {
    if (restaurant.id == 'casa-di-fratelli' && guests > 8) {
      throw SeatMapException(
        appStrings.msgForPGuestsPleaseContactTheRestaurant(guests.toString()),
      );
    }
    if (!demoMode && !timesFor(restaurant, date).contains(time)) {
      throw SeatMapException(
        appStrings.msgChooseAnAvailableTimeDuringTheRestaurantOpening,
      );
    }
    if (guestName.trim().length < 2 ||
        phone.replaceAll(RegExp(r'\D'), '').length < 7 ||
        (email ?? '').trim().isEmpty) {
      throw SeatMapException(appStrings.msgEnterYourNamePhoneAndEmail);
    }
    final plan = await loadAvailability(
      restaurant,
      date: date,
      time: time,
      guests: guests,
    );
    final tables = plan.tables
        .where((table) => tableIds.contains(table.id))
        .toList();
    if (tables.length != tableIds.toSet().length ||
        tableIds.toSet().length != tableIds.length ||
        !canSelect(plan, tables, guests)) {
      throw SeatMapException(
        appStrings.msgChooseAnAvailableTableWithEnoughSeats,
      );
    }
    var id = 'demo-${_now().microsecondsSinceEpoch}',
        status = 'confirmed',
        managementToken = '';
    Map<String, dynamic>? guestStatus;
    if (!demoMode) {
      final response = _object(
        await _request(
          '${_path(restaurant)}/reservations',
          body: {
            'guestName': guestName.trim(),
            'phone': phone.trim(),
            'email': email!.trim(),
            'guestCount': guests,
            'area': tables.first.zoneId,
            'reservedDate': dateOnly(date),
            'reservedTime': time,
            'notes': notes?.trim(),
            'tableIds': tableIds,
            'privacyConsent': true,
            'marketingConsent': false,
          },
        ),
      );
      if (response['id'] is! int ||
          ![
            'Approved',
            'AwaitingEmailConfirmation',
          ].contains(response['status']) ||
          response['reservedDate'] != dateOnly(date) ||
          response['reservedTime'] != time) {
        throw SeatMapException(
          appStrings.msgCouldNotVerifyTheResultCheckWithThe,
          uncertain: true,
        );
      }
      id = '${restaurant.id}:${response['id']}';
      status = response['status'] == 'Approved' ? 'confirmed' : 'pending';
      managementToken = _string(response['managementToken']);
      guestStatus = response['guestReservation'] is Map<String, dynamic>
          ? response['guestReservation'] as Map<String, dynamic>
          : null;
    }
    final booking = Booking(
      id: id,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      restaurantImage: restaurant.imageAsset,
      date: date,
      time: time,
      guests: guests,
      tableIds: tableIds,
      tableLabel: tables.map((table) => table.label).join(' + '),
      guestName: guestName.trim(),
      phone: phone.trim(),
      status: status,
      demo: demoMode,
      restaurantPhone: restaurant.phone,
      timeZone: restaurant.timeZone,
      managementToken: managementToken,
      cancellationLeadMinutes: restaurant.cancellationLeadMinutes,
    );
    return guestStatus == null
        ? booking
        : _withGuestStatus(booking, guestStatus);
  }

  DateTime bookingStartsAt(Booking booking) {
    if (booking.startsAtUtc != null) return booking.startsAtUtc!;
    final parts = booking.time.split(':');
    return tz.TZDateTime(
      tz.getLocation(booking.timeZone),
      booking.date.year,
      booking.date.month,
      booking.date.day,
      int.parse(parts[0]),
      int.parse(parts[1]),
    ).toUtc();
  }

  DateTime cancellationDeadline(Booking booking) =>
      booking.cancellationDeadlineUtc ??
      bookingStartsAt(booking)
          .subtract(Duration(minutes: booking.cancellationLeadMinutes));

  bool canCancelBooking(Booking booking) =>
      (booking.demo || booking.managementToken.isNotEmpty) &&
      booking.serverCanCancel &&
      ['confirmed', 'pending'].contains(booking.status) &&
      !_now().toUtc().isAfter(cancellationDeadline(booking));

  Booking _withGuestStatus(Booking booking, Map<String, dynamic> value) {
    if ('${booking.restaurantId}:${value['id']}' != booking.id ||
        value['status'] is! String) {
      throw SeatMapException(appStrings.bookingUpdateFailed);
    }
    final status = switch (value['status']) {
      'Approved' => 'confirmed',
      'AwaitingEmailConfirmation' || 'Pending' => 'pending',
      'Cancelled' => 'cancelled',
      _ => 'completed',
    };
    return booking.copyWith(
      status: status,
      serverCanCancel: value['canCancel'] == true,
      date: DateTime.tryParse(value['reservedDate']?.toString() ?? ''),
      time: value['reservedTime'] as String?,
      startsAtUtc: DateTime.tryParse(value['startsAtUtc']?.toString() ?? ''),
      cancellationDeadlineUtc: DateTime.tryParse(
        value['cancellationDeadlineUtc']?.toString() ?? '',
      ),
      cancellationLeadMinutes: value['cancellationLeadMinutes'] as int? ?? 180,
      restaurantPhone: value['restaurantPhone'] as String?,
      guests: value['guestCount'] as int?,
      tableIds: value['tableIds'] is List
          ? List<String>.from(value['tableIds'] as List)
          : null,
      tableLabel: value['tableIds'] is List
          ? (value['tableIds'] as List).join(' + ')
          : null,
    );
  }

  String _bookingPath(Booking booking) =>
      '/api/v1/restaurants/${Uri.encodeComponent(booking.restaurantId)}/reservations/${Uri.encodeComponent(booking.id.split(':').last)}';

  Future<Booking> refreshBooking(Booking booking) async {
    if (booking.demo || booking.managementToken.isEmpty) return booking;
    final data = await _request(
      '${_bookingPath(booking)}/guest',
      headers: {'X-Reservation-Token': booking.managementToken},
      guestManagement: true,
    );
    return _withGuestStatus(booking, _object(data));
  }

  Future<Booking> cancelBooking(Booking booking) async {
    if (booking.demo) {
      if (!canCancelBooking(booking)) {
        throw SeatMapException(appStrings.cancellationContactRequired);
      }
      return booking.copyWith(status: 'cancelled', serverCanCancel: false);
    }
    if (booking.managementToken.isEmpty) {
      throw SeatMapException(appStrings.bookingAccessUnavailable);
    }
    // Always let the server decide the deadline and ownership, including safe retries.
    final data = await _request(
      '${_bookingPath(booking)}/cancel',
      body: {},
      headers: {'X-Reservation-Token': booking.managementToken},
      guestManagement: true,
    );
    return _withGuestStatus(booking, _object(data));
  }

  static bool canSelect(FloorPlan plan, List<SeatTable> tables, int guests) {
    if (tables.isEmpty ||
        tables.any((table) => table.occupied) ||
        tables.length > plan.publicMaxTables ||
        guests < 1 ||
        guests > plan.publicMaxGuests ||
        tables.map((table) => table.zoneId).toSet().length != 1 ||
        tables.fold(0, (sum, table) => sum + table.capacity) < guests) {
      return false;
    }
    final ids = tables.map((table) => table.id).toSet();
    return tables.length == 1 ||
        plan.combinations.any(
          (group) => group.length == ids.length && ids.containsAll(group),
        );
  }

  Future<List<MenuDish>> loadMenu(Restaurant restaurant) async {
    if (demoMode) {
      final names = [
        appStrings.msgShopskaSalad,
        appStrings.msgBurrataWithTomatoes,
        appStrings.msgBeefTartare,
        appStrings.msgDuckBreast,
        appStrings.msgMushroomRisotto,
        appStrings.msgChocolateFondant,
      ];
      final descriptions = [
        appStrings.msgTomatoesCucumberRoastedPepperWhiteCheese,
        appStrings.msgSeasonalTomatoesAndFreshBasil,
        appStrings.msgCapersMustardCreamToast,
        appStrings.msgCeleriacSeasonalVegetablesSourCherrySauce,
        appStrings.msgWildMushroomsArborioRiceParmesan,
        appStrings.msgWarmChocolateAndVanillaIceCream,
      ];
      return [
        for (var i = 0; i < names.length; i++)
          MenuDish(
            id: i + 1,
            name: names[i],
            description: descriptions[i],
            priceMinor: [950, 1300, 1700, 2400, 1800, 850][i],
            category: i < 2
                ? 'salads'
                : i == 5
                ? 'desserts'
                : 'mains',
            weight: i == 5 ? '160 g' : '300 g',
          ),
        MenuDish(
          id: 7,
          name: appStrings.menuCoffee,
          priceMinor: 350,
          category: 'hot-drinks',
          drink: true,
          weight: '60 ml',
        ),
        MenuDish(
          id: 8,
          name: appStrings.menuLemonade,
          priceMinor: 650,
          category: 'lemonades',
          drink: true,
          weight: '400 ml',
        ),
      ];
    }
    return _list(
      await _request('${_path(restaurant)}/menu'),
    ).map(_object).where((item) => item['isActive'] != false).map((item) {
      var image = _string(item['imageUrl']);
      if (image.startsWith('/') && !image.startsWith('//')) {
        final website = Uri.tryParse(restaurant.websiteUrl);
        image =
            website != null && website.scheme == 'https' && website.hasAuthority
            ? website.resolve(image).toString()
            : '';
      }
      if (!(image.startsWith('https://') || image.startsWith('data:image/'))) {
        image = '';
      }
      return MenuDish(
        id: item['id'] as int,
        name: _translated(item, 'name'),
        description: _translated(item, 'description'),
        priceMinor: ((item['price'] as num) * 100).round(),
        category: _string(item['category'], 'mains'),
        drink: _string(item['department']).toLowerCase() == 'bar',
        image: image,
        weight: _string(item['weight']),
      );
    }).toList();
  }

  Future<PreorderSettings> preorderSettings(Restaurant restaurant) async =>
      demoMode
      ? const PreorderSettings(enabled: true)
      : PreorderSettings.fromJson(
          _object(await _request('${_path(restaurant)}/preorders/settings')),
        );

  Future<Map<String, dynamic>> sommelier(
    Restaurant restaurant,
    int dishId, {
    String? serving,
    String? style,
    int? maxPriceMinor,
  }) async {
    if (demoMode) return {'status': 'not_configured', 'recommendations': []};
    final query = Uri(
      queryParameters: {
        'dishId': '$dishId',
        'language': AppLanguage.code,
        'serving': ?serving,
        'style': ?style,
        if (maxPriceMinor != null) 'maxPriceMinor': '$maxPriceMinor',
      },
    ).query;
    return _object(await _request('${_path(restaurant)}/sommelier?$query'));
  }

  String _preorderPath(Booking booking) {
    final id = booking.id.split(':').last;
    if (!RegExp(r'^\d+$').hasMatch(id) || booking.managementToken.isEmpty) {
      throw SeatMapException(
        appStrings.bookingAccessUnavailable,
        code: 'RESERVATION_NOT_FOUND',
      );
    }
    return '/api/v1/restaurants/${Uri.encodeComponent(booking.restaurantId)}/reservations/$id/preorders';
  }

  Future<Map<String, dynamic>> savePreorderDraft(
    Booking booking,
    Map<String, dynamic> body,
  ) async => _object(
    await _request(
      _preorderPath(booking),
      body: body,
      headers: {'X-Reservation-Token': booking.managementToken},
      guestManagement: true,
    ),
  );
  Future<Map<String, dynamic>> updatePreorderDraft(
    Booking booking,
    String id,
    Map<String, dynamic> body,
  ) async => _object(
    await _request(
      '${_preorderPath(booking)}/${Uri.encodeComponent(id)}',
      body: body,
      headers: {'X-Reservation-Token': booking.managementToken},
      guestManagement: true,
    ),
  );
  Future<Map<String, dynamic>> quotePreorder(
    Booking booking,
    Map<String, dynamic> body,
  ) async => _object(
    await _request(
      '${_preorderPath(booking)}/quote',
      body: body,
      headers: {'X-Reservation-Token': booking.managementToken},
      guestManagement: true,
    ),
  );
  Future<List<Map<String, dynamic>>> preorderDrafts(Booking booking) async =>
      _list(
        await _request(
          _preorderPath(booking),
          headers: {'X-Reservation-Token': booking.managementToken},
          guestManagement: true,
        ),
      ).map(_object).toList();
}
