import 'package:flutter_test/flutter_test.dart';
import 'package:seatmap_mobile/data/seatmap_repository.dart';
import 'package:seatmap_mobile/state/app_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';
// Platform fault injection exercises storage failures after a booking succeeds.
// ignore: depend_on_referenced_packages
import 'package:shared_preferences_platform_interface/shared_preferences_platform_interface.dart';

class _FailingBookingStore extends InMemorySharedPreferencesStore {
  _FailingBookingStore(this.throwsError) : super.empty();
  final bool throwsError;
  @override
  Future<bool> setValue(String valueType, String key, Object value) async {
    if (key.endsWith('seatmap.bookings')) {
      if (throwsError) throw StateError('Storage unavailable');
      return false;
    }
    return super.setValue(valueType, key, value);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final throwsError in [true, false]) {
    test(
      'successful booking survives storage ${throwsError ? 'exception' : 'failure'}',
      () async {
        SharedPreferences.setMockInitialValues({});
        final original = SharedPreferencesStorePlatform.instance;
        addTearDown(() => SharedPreferencesStorePlatform.instance = original);
        final controller = AppController(
          initialLanguage: 'en',
          repository: SeatMapRepository(baseUrl: ''),
        );
        addTearDown(controller.dispose);
        await controller.initialize();
        SharedPreferencesStorePlatform.instance = _FailingBookingStore(
          throwsError,
        );
        controller.setSearch(date: DateTime.now().add(const Duration(days: 1)));
        final booking = await controller.submitBooking(
          restaurant: controller.restaurants.first,
          tableIds: ['08'],
          guestName: 'Test Guest',
          phone: '+359888123456',
          email: 'guest@example.test',
        );
        expect(controller.bookings.single.id, booking.id);
        expect(controller.bookingsError, contains('could not be saved'));
        await controller.cancelBooking(booking.id);
        expect(controller.bookings.single.status, 'cancelled');
      },
    );
  }
}
