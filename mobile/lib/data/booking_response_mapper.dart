import '../domain/models.dart';
import '../l10n/language.dart';
import 'seatmap_exception.dart';

/// Translates server vocabulary into the existing local booking model.
/// Capability tokens belong in secure storage; this mapper never persists them.
abstract final class BookingResponseMapper {
  static Booking withGuestStatus(Booking booking, Map<String, dynamic> value) {
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

  static Booking fromWaitlistConfirmation({
    required Restaurant restaurant,
    required Map<String, dynamic> response,
    required String phone,
  }) {
    var booking = Booking(
      id: '${restaurant.id}:${response['id']}',
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      restaurantImage: restaurant.imageAsset,
      date: DateTime.parse(response['reservedDate']),
      time: response['reservedTime'],
      guests: response['guestCount'],
      tableIds: List<String>.from(response['tableIds']),
      tableLabel: (response['tableIds'] as List).join(' + '),
      guestName: response['guestName'],
      phone: phone,
      status: response['status'] == 'Approved' ? 'confirmed' : 'pending',
      demo: false,
      restaurantPhone: restaurant.phone,
      timeZone: restaurant.timeZone,
      managementToken: response['managementToken'],
      cancellationLeadMinutes: restaurant.cancellationLeadMinutes,
    );
    if (response['guestReservation'] is Map) {
      booking = withGuestStatus(
        booking,
        Map<String, dynamic>.from(response['guestReservation']),
      );
    }
    return booking;
  }
}
