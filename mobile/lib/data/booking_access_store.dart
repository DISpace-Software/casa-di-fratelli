import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract interface class BookingAccessStore {
  Future<String?> read(String bookingId);
  Future<void> write(String bookingId, String token);
}

class SecureBookingAccessStore implements BookingAccessStore {
  SecureBookingAccessStore(this.origin);
  final String origin;
  static final _storage = FlutterSecureStorage();
  final Map<String, String> _webTokens = {};
  String _key(String id) =>
      'seatmap.booking.${base64Url.encode(utf8.encode('$origin/$id'))}';
  @override
  Future<String?> read(String bookingId) async =>
      kIsWeb ? _webTokens[bookingId] : _storage.read(key: _key(bookingId));
  @override
  Future<void> write(String bookingId, String token) async {
    if (kIsWeb) {
      _webTokens[bookingId] = token;
    } else {
      await _storage.write(key: _key(bookingId), value: token);
    }
  }
}
