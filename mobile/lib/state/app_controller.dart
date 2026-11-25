import 'dart:convert';
import 'dart:ui' show Locale, PlatformDispatcher;

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/booking_access_store.dart';
import '../data/booking_response_mapper.dart';
import '../data/guest_account_repository.dart';
import '../data/seatmap_repository.dart';
import '../data/waitlist_inbox_snapshot.dart';
import '../domain/models.dart';
import '../l10n/language.dart';

class AppController extends ChangeNotifier {
  int preorderRevision = 0;
  void preordersChanged() {
    preorderRevision++;
    notifyListeners();
  }

  AppController({
    SeatMapRepository? repository,
    GuestAccountRepository? accounts,
    BookingAccessStore? bookingAccess,
    String? initialLanguage,
  }) : repository = repository ?? SeatMapRepository(),
       _accountsOverride = accounts,
       _bookingAccessOverride = bookingAccess,
       _initialLanguage = initialLanguage {
    _languageCode =
        initialLanguage ??
        resolveAppLanguage(deviceLocales: PlatformDispatcher.instance.locales);
    AppLanguage.code = _languageCode;
    this.repository.languageCode = _languageCode;
  }
  final String? _initialLanguage;
  late String _languageCode;
  String? _savedLanguage, _country;
  String get appLanguageCode => _languageCode;
  String? get languageOverride => _savedLanguage;
  Locale get locale => Locale(_languageCode);
  String get selectedCityLabel => switch (canonicalCity(selectedCity)) {
    'sofia' => appStrings.msgSofia,
    'plovdiv' => appStrings.msgPlovdiv,
    'varna' => appStrings.msgVarna,
    'burgas' => appStrings.msgBurgas,
    _ => selectedCity,
  };
  Future<void> setAppLanguage(String? value) async {
    _savedLanguage = value;
    if (value == null) {
      await _preferences?.remove('seatmap.appLanguage');
    } else {
      await _preferences?.setString('seatmap.appLanguage', value);
    }
    _applyLanguage();
    notifyListeners();
    await refreshRestaurants();
  }

  void _applyLanguage() {
    _languageCode = resolveAppLanguage(
      saved: _savedLanguage ?? _initialLanguage,
      countryCode: _country,
      deviceLocales: PlatformDispatcher.instance.locales,
    );
    AppLanguage.code = _languageCode;
    repository.languageCode = _languageCode;
  }

  final GuestAccountRepository? _accountsOverride;
  final BookingAccessStore? _bookingAccessOverride;
  late final BookingAccessStore bookingAccess =
      _bookingAccessOverride ?? SecureBookingAccessStore(repository.baseUrl);
  bool refreshingBookings = false;
  String? bookingsError;
  int _bookingRevision = 0;
  late final GuestAccountRepository accounts =
      _accountsOverride ?? GuestAccountRepository(baseUrl: repository.baseUrl);
  final SeatMapRepository repository;
  SharedPreferences? _preferences;
  List<Restaurant> restaurants = [];
  List<Booking> bookings = [];
  Set<String> favorites = {};
  GuestProfile profile = GuestProfile();
  String? accountError;
  bool isLoggedIn = false;
  bool demoNotifications = false;
  bool loading = true;
  String? error;
  bool get demoMode => repository.demoMode;
  String selectedCity = appStrings.msgSofia;
  List<Restaurant> get visibleRestaurants => restaurants
      .where(
        (restaurant) =>
            restaurant.city.isEmpty ||
            canonicalCity(restaurant.city) == canonicalCity(selectedCity),
      )
      .toList();
  DateTime selectedDate = _initialDate();
  static DateTime _initialDate() {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    return now.hour * 60 + now.minute >= 19 * 60 + 30
        ? today.add(Duration(days: 1))
        : today;
  }

  String get availabilityHeading {
    final now = DateTime.now();
    final days = DateTime(
      selectedDate.year,
      selectedDate.month,
      selectedDate.day,
    ).difference(DateTime(now.year, now.month, now.day)).inDays;
    return days == 0
        ? appStrings.msgAvailableToday
        : days == 1
        ? appStrings.msgAvailableTomorrow
        : appStrings.msgAvailableTables;
  }

  String selectedTime = '19:30';
  int guestCount = 2;
  bool _initialized = false;

  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;
    try {
      _preferences = await SharedPreferences.getInstance();
      _savedLanguage = _preferences!.getString('seatmap.appLanguage');
      _applyLanguage();
      isLoggedIn =
          demoMode && (_preferences!.getBool('seatmap.demoLogin') ?? false);
      if (demoMode) {
        profile = GuestProfile(
          name: appStrings.msgAlexander,
          firstName: appStrings.msgAlexander,
          lastName: appStrings.msgIvanov,
          email: 'demo@seatmap.app',
          phone: '+359888123456',
        );
      }
      demoNotifications =
          _preferences!.getBool('seatmap.demoNotifications') ?? false;
      favorites = (_preferences!.getStringList('seatmap.favorites') ?? [])
          .toSet();
      final storedProfile = _preferences!.getString('seatmap.profile');
      if (demoMode && storedProfile != null) {
        profile = GuestProfile.fromJson(
          jsonDecode(storedProfile) as Map<String, dynamic>,
        );
      }
      final storedBookings = _preferences!.getString('seatmap.bookings');
      if (storedBookings != null) {
        bookings = (jsonDecode(storedBookings) as List)
            .map(
              (value) =>
                  Booking.fromJson(Map<String, dynamic>.from(value as Map)),
            )
            .toList();
      }
    } catch (_) {
      error = appStrings.msgCouldNotRestoreSavedDataYouCanContinue;
    }
    if (!demoMode) {
      _country = await repository.detectCountry();
      _applyLanguage();
      try {
        final restored = await accounts.restore();
        if (restored != null) {
          profile = restored;
          isLoggedIn = true;
        }
      } catch (exception) {
        accountError = _message(exception);
      }
    }
    for (var i = 0; i < bookings.length; i++) {
      if (bookings[i].demo) continue;
      try {
        final token = await bookingAccess.read(bookings[i].id);
        if (token != null) {
          bookings[i] = bookings[i].copyWith(managementToken: token);
        }
      } catch (_) {
        /* Old/local metadata still remains visible with restaurant contact. */
      }
    }
    await refreshRestaurants();
    await refreshBookings();
  }

  Future<void> refreshRestaurants() async {
    loading = true;
    notifyListeners();
    try {
      restaurants = await repository.getRestaurants();
      error = null;
    } catch (exception) {
      error = _message(exception);
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<bool> login(String email, String password) async {
    if (!demoMode) {
      profile = await accounts.login(email, password);
      isLoggedIn = true;
      accountError = null;
      notifyListeners();
      return true;
    }
    await Future<void>.delayed(Duration(milliseconds: 450));
    if (email.trim().toLowerCase() != 'demo@seatmap.app' ||
        password != 'SeatMap2026!') {
      return false;
    }
    isLoggedIn = true;
    await _preferences?.setBool('seatmap.demoLogin', true);
    notifyListeners();
    return true;
  }

  Future<Map<String, dynamic>> register(
    GuestProfile value,
    String password,
    String confirmation, {
    required bool privacyConsent,
  }) async {
    if (demoMode) {
      throw GuestAccountException(
        appStrings.msgRegistrationIsAvailableInLiveMode,
      );
    }
    return accounts.register(
      value,
      password,
      confirmation,
      privacyConsent: privacyConsent,
    );
  }

  Future<void> verifyEmail(String challengeId, String code) async {
    profile = await accounts.verifyEmail(challengeId, code);
    isLoggedIn = true;
    accountError = null;
    notifyListeners();
  }

  Future<void> resetPassword(
    String challengeId,
    String code,
    String password,
    String confirmation,
  ) async {
    await accounts.resetPassword(challengeId, code, password, confirmation);
    isLoggedIn = false;
    waitlistEntries = [];
    waitlistError = null;
    profile = GuestProfile();
    notifyListeners();
  }

  Future<void> logout() async {
    if (!demoMode) {
      try {
        await accounts.logout();
      } on GuestAccountException catch (exception) {
        if (exception.status != 401) rethrow;
      }
      await accounts.forgetSession();
      profile = GuestProfile();
    }
    isLoggedIn = false;
    waitlistEntries = [];
    waitlistError = null;
    await _preferences?.setBool('seatmap.demoLogin', false);
    notifyListeners();
  }

  Future<T> _authenticated<T>(Future<T> Function() action) async {
    try {
      return await action();
    } on GuestAccountException catch (exception) {
      if (exception.status == 401) {
        isLoggedIn = false;
        waitlistEntries = [];
        waitlistError = null;
        profile = GuestProfile();
        notifyListeners();
      }
      rethrow;
    }
  }

  Future<void> changePassword(
    String current,
    String password,
    String confirmation,
  ) async {
    await _authenticated(
      () => accounts.changePassword(current, password, confirmation),
    );
    isLoggedIn = false;
    waitlistEntries = [];
    waitlistError = null;
    profile = GuestProfile();
    notifyListeners();
  }

  Future<void> deleteAccount(String password) async {
    await _authenticated(() => accounts.deleteAccount(password));
    isLoggedIn = false;
    waitlistEntries = [];
    waitlistError = null;
    profile = GuestProfile();
    notifyListeners();
  }

  Future<void> toggleFavorite(String restaurantId) async {
    if (!favorites.remove(restaurantId)) favorites.add(restaurantId);
    notifyListeners();
    await _preferences?.setStringList('seatmap.favorites', favorites.toList());
  }

  Future<void> updateProfile(
    GuestProfile value, {
    String? currentPassword,
  }) async {
    if (demoMode) {
      profile = value;
      await _preferences?.setString(
        'seatmap.profile',
        jsonEncode(profile.toJson()),
      );
    } else {
      final emailChanged =
          value.email.trim().toLowerCase() !=
          profile.email.trim().toLowerCase();
      profile = await _authenticated(
        () => accounts.update(value, currentPassword: currentPassword),
      );
      if (emailChanged) {
        await accounts.forgetSession();
        isLoggedIn = false;
        waitlistEntries = [];
        waitlistError = null;
      }
    }
    notifyListeners();
  }

  void setSearch({String? city, DateTime? date, String? time, int? guests}) {
    if (city != null) selectedCity = city;
    if (date != null) selectedDate = date;
    if (time != null) selectedTime = time;
    if (guests != null) guestCount = guests.clamp(1, 20);
    notifyListeners();
  }

  Future<Restaurant> loadRestaurantDetail(Restaurant restaurant) =>
      repository.loadRestaurantDetail(restaurant);
  Future<FloorPlan> loadAvailability(Restaurant restaurant) async {
    final plan = await repository.loadAvailability(
      restaurant,
      date: selectedDate,
      time: selectedTime,
      guests: guestCount,
    );
    if (!demoMode) return plan;
    return plan.copyWith(
      tables: plan.tables.map((table) {
        final locallyBooked = bookings.any(
          (booking) =>
              booking.demo &&
              booking.status != 'cancelled' &&
              booking.restaurantId == restaurant.id &&
              dateOnly(booking.date) == dateOnly(selectedDate) &&
              booking.tableIds.contains(table.id) &&
              SeatMapRepository.blockedAt(booking.time, selectedTime),
        );
        return table.copyWith(occupied: table.occupied || locallyBooked);
      }).toList(),
    );
  }

  Future<Booking> submitBooking({
    required Restaurant restaurant,
    required List<String> tableIds,
    required String guestName,
    required String phone,
    String? email,
    String? notes,
  }) async {
    if (tableIds.isEmpty) throw Exception(appStrings.msgChooseATable275);
    final currentPlan = await loadAvailability(restaurant);
    final booking = await repository.createBooking(
      restaurant: restaurant.copyWith(floorPlan: currentPlan),
      tableIds: tableIds,
      date: selectedDate,
      time: selectedTime,
      guests: guestCount,
      guestName: guestName,
      phone: phone,
      email: email,
      notes: notes,
    );
    if (booking.managementToken.isNotEmpty) {
      try {
        await bookingAccess.write(booking.id, booking.managementToken);
      } catch (_) {
        bookingsError = appStrings.bookingAccessSaveFailed;
      }
    }
    bookings.insert(0, booking);
    _bookingRevision++;
    await _saveBookings();
    notifyListeners();
    return booking;
  }

  List<Map<String, dynamic>> waitlistEntries = [];
  String? waitlistError;
  bool refreshingWaitlist = false;
  Duration waitlistClockOffset = Duration.zero;
  Future<void> refreshWaitlist() async {
    if (refreshingWaitlist) return;
    if (!isLoggedIn || demoMode) {
      if (waitlistEntries.isNotEmpty) {
        waitlistEntries = [];
        notifyListeners();
      }
      return;
    }
    refreshingWaitlist = true;
    final owner = profile.id;
    final updated = <Map<String, dynamic>>[];
    String? failure;
    try {
      final data = await _authenticated(() => accounts.waitlistInbox());
      final snapshot = WaitlistInboxSnapshot.fromJson(data);
      final serverTime = snapshot.serverTimeUtc;
      if (serverTime != null) {
        waitlistClockOffset = serverTime.difference(DateTime.now().toUtc());
      }
      updated.addAll(snapshot.mergeWith(waitlistEntries));
      if (snapshot.isPartial) failure = appStrings.waitlistLoadFailed;
    } catch (_) {
      failure = appStrings.waitlistLoadFailed;
      updated.addAll(waitlistEntries);
    }
    if (isLoggedIn && owner == profile.id) {
      waitlistEntries = updated;
      waitlistError = failure;
    }
    refreshingWaitlist = false;
    notifyListeners();
  }

  Future<void> confirmWaitlist(
    Restaurant restaurant,
    String entryId,
    String offerId,
  ) async {
    final owner = profile.id;
    final ownerPhone = profile.phone;
    final response = await _authenticated(
      () => accounts.waitlist(
        restaurant.id,
        path: '/$entryId/confirm',
        method: 'POST',
        body: {'offerId': offerId},
      ),
    );
    if (!isLoggedIn || profile.id != owner) return;
    final booking = BookingResponseMapper.fromWaitlistConfirmation(
      restaurant: restaurant,
      response: response,
      phone: ownerPhone,
    );
    await bookingAccess.write(booking.id, booking.managementToken);
    if (!isLoggedIn || profile.id != owner) return;
    bookings.removeWhere((b) => b.id == booking.id);
    bookings.insert(0, booking);
    _bookingRevision++;
    await _saveBookings();
    await refreshWaitlist();
    notifyListeners();
  }

  String restaurantPhoneFor(Booking booking) => restaurants
      .where((restaurant) => restaurant.id == booking.restaurantId)
      .map((restaurant) => restaurant.phone)
      .firstWhere(
        (phone) => phone.isNotEmpty,
        orElse: () => booking.restaurantPhone,
      );

  Future<void> refreshBookings() async {
    if (refreshingBookings || bookings.isEmpty) return;
    refreshingBookings = true;
    bookingsError = null;
    final revision = _bookingRevision;
    notifyListeners();
    try {
      final updates = await Future.wait(
        bookings.map((booking) async {
          try {
            return await repository.refreshBooking(booking);
          } catch (error) {
            bookingsError = _message(error);
            return booking;
          }
        }),
      );
      if (revision == _bookingRevision) {
        bookings = updates;
        await _saveBookings();
      }
    } catch (error) {
      bookingsError = _message(error);
    } finally {
      refreshingBookings = false;
      notifyListeners();
    }
  }

  Future<void> cancelBooking(String bookingId) async {
    final index = bookings.indexWhere((booking) => booking.id == bookingId);
    if (index < 0) return;
    _bookingRevision++;
    try {
      final updated = await repository.cancelBooking(bookings[index]);
      bookings[index] = updated;
      await _saveBookings();
    } catch (error) {
      try {
        bookings[index] = await repository.refreshBooking(bookings[index]);
        if (bookings[index].status == 'cancelled') {
          await _saveBookings();
          return;
        }
      } catch (_) {
        // Keep the last known status if the restaurant is unreachable.
      }
      if (error is SeatMapException && error.code == 'RESERVATION_NOT_FOUND') {
        bookings[index] = bookings[index].copyWith(serverCanCancel: false);
      }
      rethrow;
    } finally {
      _bookingRevision++;
      notifyListeners();
    }
  }

  Future<void> _saveBookings() async {
    // A completed server operation remains successful if device storage fails.
    // Keep its result in memory and surface the persistence warning separately.
    try {
      final saved = await _preferences?.setString(
        'seatmap.bookings',
        jsonEncode(bookings.map((booking) => booking.toJson()).toList()),
      );
      if (saved == false) bookingsError = appStrings.bookingHistorySaveFailed;
    } catch (_) {
      bookingsError = appStrings.bookingHistorySaveFailed;
    }
  }

  Future<void> setDemoNotifications(bool value) async {
    demoNotifications = value;
    notifyListeners();
    await _preferences?.setBool('seatmap.demoNotifications', value);
  }

  static String _message(Object exception) => exception.toString().replaceFirst(
    RegExp(r'^(Exception|StateError):\s*'),
    '',
  );
}
