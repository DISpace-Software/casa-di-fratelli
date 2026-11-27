import '../domain/models.dart';

/// Stable device-storage identity for an unsent cart or a server draft.
/// Keep this format compatible with installed apps when moving UI code.
String preorderCartKey(Booking booking, Map<String, dynamic>? draft) =>
    'preorder-cart-${booking.restaurantId}-${booking.id}-${draft?['id'] ?? 'new'}';
