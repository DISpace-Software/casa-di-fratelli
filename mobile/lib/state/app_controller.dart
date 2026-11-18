import '../l10n/language.dart';

import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'dart:ui' show Locale, PlatformDispatcher;

import 'package:shared_preferences/shared_preferences.dart';

import '../domain/models.dart';
import '../data/seatmap_repository.dart';
import '../data/guest_account_repository.dart';

class AppController extends ChangeNotifier {
  AppController({
    SeatMapRepository? repository,
    GuestAccountRepository? accounts,
    String? initialLanguage,
  }) : repository = repository ?? SeatMapRepository(),
       _accountsOverride = accounts,
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
    await refreshRestaurants();
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

  Future<void> register(
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
    profile = await accounts.register(
      value,
      password,
      confirmation,
      privacyConsent: privacyConsent,
    );
    isLoggedIn = true;
    accountError = null;
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
    await _preferences?.setBool('seatmap.demoLogin', false);
    notifyListeners();
  }

  Future<T> _authenticated<T>(Future<T> Function() action) async {
    try {
      return await action();
    } on GuestAccountException catch (exception) {
      if (exception.status == 401) {
        isLoggedIn = false;
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
    profile = GuestProfile();
    notifyListeners();
  }

  Future<void> deleteAccount(String password) async {
    await _authenticated(() => accounts.deleteAccount(password));
    isLoggedIn = false;
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
      profile = await _authenticated(
        () => accounts.update(value, currentPassword: currentPassword),
      );
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
    bookings.insert(0, booking);
    await _saveBookings();
    notifyListeners();
    return booking;
  }

  Future<void> cancelBooking(String bookingId) async {
    final index = bookings.indexWhere((booking) => booking.id == bookingId);
    if (index < 0) return;
    final booking = bookings[index];
    if (!booking.demo) {
      throw Exception(
        appStrings.msgOnlineCancellationIsNotAvailableYetContactThe,
      );
    }
    bookings[index] = Booking(
      id: booking.id,
      restaurantId: booking.restaurantId,
      restaurantName: booking.restaurantName,
      restaurantImage: booking.restaurantImage,
      date: booking.date,
      time: booking.time,
      guests: booking.guests,
      tableIds: booking.tableIds,
      tableLabel: booking.tableLabel,
      guestName: booking.guestName,
      phone: booking.phone,
      status: 'cancelled',
      demo: true,
    );
    await _saveBookings();
    notifyListeners();
  }

  Future<void> _saveBookings() async {
    await _preferences?.setString(
      'seatmap.bookings',
      jsonEncode(bookings.map((booking) => booking.toJson()).toList()),
    );
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
