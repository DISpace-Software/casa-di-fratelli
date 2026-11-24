import '../l10n/language.dart';

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import '../domain/models.dart';

class GuestAccountException implements Exception {
  GuestAccountException(
    this.message, {
    this.status = 0,
    this.code = '',
    this.fields = const {},
  });
  final String message, code;
  final int status;
  final Map<String, String> fields;
  @override
  String toString() => message;
}

abstract interface class GuestSessionStore {
  Future<String?> read();
  Future<void> write(String token);
  Future<void> clear();
}

class SecureGuestSessionStore implements GuestSessionStore {
  SecureGuestSessionStore(String origin)
    : key = 'seatmap.guest.${base64Url.encode(utf8.encode(origin))}';
  final String key;
  static final _storage = FlutterSecureStorage();
  String? _webToken;
  // Native credentials use Keychain/encrypted Android storage. The review-only
  // browser session stays in memory, never SharedPreferences/localStorage.
  @override
  Future<String?> read() async => kIsWeb ? _webToken : _storage.read(key: key);
  @override
  Future<void> write(String token) async {
    if (kIsWeb) {
      _webToken = token;
    } else {
      await _storage.write(key: key, value: token);
    }
  }

  @override
  Future<void> clear() async {
    if (kIsWeb) {
      _webToken = null;
    } else {
      await _storage.delete(key: key);
    }
  }
}

class GuestAccountRepository {
  GuestAccountRepository({
    required this.baseUrl,
    http.Client? client,
    GuestSessionStore? store,
  }) : _client = client ?? http.Client(),
       _store = store ?? SecureGuestSessionStore(baseUrl);
  final String baseUrl;
  final http.Client _client;
  final GuestSessionStore _store;
  String? _token;

  Future<dynamic> _request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    bool authenticated = true,
    String? restaurantId,
  }) async {
    final request = http.Request(
      method,
      Uri.parse(
        restaurantId == null
            ? '$baseUrl/api/v1/guest/$path'
            : '$baseUrl/api/v1/restaurants/${Uri.encodeComponent(restaurantId)}/waitlist$path',
      ),
    );
    request.headers.addAll({
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    });
    if (authenticated) {
      _token ??= await _store.read();
      if (_token == null) {
        throw GuestAccountException(
          appStrings.msgPleaseSignIn,
          status: 401,
          code: 'SESSION_EXPIRED',
        );
      }
      request.headers['Authorization'] = 'Bearer $_token';
    }
    if (body != null) request.body = jsonEncode(body);
    http.Response response;
    try {
      response = await http.Response.fromStream(await _client.send(request))
          .timeout(Duration(seconds: 20));
    } on Exception {
      throw GuestAccountException(
        appStrings.msgCouldNotReachTheServerCheckYourConnection,
      );
    }
    dynamic json;
    try {
      json = response.body.isEmpty ? null : jsonDecode(response.body);
    } on FormatException {
      json = null;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final map = json is Map ? json : <String, dynamic>{};
      if (response.statusCode == 401 && authenticated) await forgetSession();
      final fields = <String, String>{};
      if (map['errors'] is Map) {
        for (final entry in (map['errors'] as Map).entries) {
          fields[entry.key.toString().toLowerCase()] = entry.value is List
              ? (entry.value as List).join(' ')
              : entry.value.toString();
        }
      }
      throw GuestAccountException(
        _messageForCode(map['code']?.toString()) ??
            switch (response.statusCode) {
              400 => appStrings.msgCheckTheDetailsYouEntered,
              401 =>
                authenticated
                    ? appStrings.msgYourSessionHasExpiredPleaseSignInAgain
                    : appStrings.msgIncorrectEmailOrPassword,
              404 ||
              503 => appStrings.msgRegistrationAndProfilesAreNotAvailableOnThis,
              409 => appStrings.msgThisEmailCannotBeUsedTrySigningIn,
              429 => appStrings.msgTooManyAttemptsPleaseTryAgainInMinutes,
              _ =>
                appStrings.msgTheServerIsTemporarilyUnavailablePleaseTryLater,
            },
        status: response.statusCode,
        code: map['code']?.toString() ?? '',
        fields: fields,
      );
    }
    return json;
  }

  String? _messageForCode(String? code) => switch (code) {
    'OFFER_EXPIRED' || 'WAITLIST_CLOSED' => appStrings.waitlistExpired,
    'WAITLIST_PAUSED' => appStrings.waitlistUnavailable,
    'TIMES_INVALID' ||
    'DATE_INVALID' ||
    'ZONE_CLOSED' ||
    'PARTY_SIZE' ||
    'NO_SUITABLE_TABLE' => appStrings.waitlistInvalid,
    'VERIFIED_PROFILE_REQUIRED' => appStrings.waitlistLogin,
    'EMAIL_NOT_VERIFIED' => appStrings.emailNotVerified,
    'INVALID_EMAIL_CODE' => appStrings.invalidEmailCode,
    'EMAIL_DELIVERY_FAILED' => appStrings.emailDeliveryFailed,
    'INVALID_CREDENTIALS' => appStrings.invalidCredentials,
    'CURRENT_PASSWORD_REQUIRED' => appStrings.currentPasswordRequired,
    'EMAIL_IN_USE' => appStrings.emailInUse,
    'SESSION_EXPIRED' => appStrings.msgYourSessionHasExpiredPleaseSignInAgain,
    'GUEST_ACCOUNTS_UNAVAILABLE' =>
      appStrings.msgRegistrationAndProfilesAreNotAvailableOnThis,
    'RATE_LIMITED' => appStrings.msgTooManyAttemptsPleaseTryAgainInMinutes,
    _ => null,
  };

  Future<Map<String, dynamic>> waitlistInbox() async =>
      Map<String, dynamic>.from(await _request('waitlist') as Map);

  Future<Map<String, dynamic>> waitlist(
    String restaurantId, {
    String path = '',
    String method = 'GET',
    Map<String, dynamic>? body,
  }) async => Map<String, dynamic>.from(
    await _request(path, restaurantId: restaurantId, method: method, body: body)
        as Map,
  );

  Future<GuestProfile?> restore() async {
    _token = await _store.read();
    if (_token == null) return null;
    return fetchProfile();
  }

  Future<GuestProfile> fetchProfile() async => GuestProfile.fromJson(
    Map<String, dynamic>.from(await _request('me') as Map),
  );
  Future<GuestProfile> login(String email, String password) async =>
      _authenticate('login', {'email': email.trim(), 'password': password});
  Future<Map<String, dynamic>> register(
    GuestProfile profile,
    String password,
    String confirmation, {
    required bool privacyConsent,
  }) async => Map<String, dynamic>.from(
    await _request(
      'register',
      method: 'POST',
      authenticated: false,
      body: {
        ...profile.toJson(),
        'password': password,
        'confirmPassword': confirmation,
        'privacyConsent': privacyConsent,
      },
    ) as Map,
  );

  Future<Map<String, dynamic>> sendEmailCode(
    String email, {
    bool reset = false,
  }) async => Map<String, dynamic>.from(
    await _request(
      reset ? 'password/forgot' : 'email/code',
      method: 'POST',
      authenticated: false,
      body: {'email': email.trim()},
    ) as Map,
  );

  Future<GuestProfile> verifyEmail(String challengeId, String code) =>
      _authenticate('email/verify', {'challengeId': challengeId, 'code': code});

  Future<void> resetPassword(
    String challengeId,
    String code,
    String password,
    String confirmation,
  ) async {
    await _request(
      'password/reset',
      method: 'POST',
      authenticated: false,
      body: {
        'challengeId': challengeId,
        'code': code,
        'newPassword': password,
        'confirmPassword': confirmation,
      },
    );
    await forgetSession();
  }

  Future<GuestProfile> _authenticate(
    String path,
    Map<String, dynamic> body,
  ) async {
    final result = Map<String, dynamic>.from(
      await _request(path, method: 'POST', body: body, authenticated: false)
          as Map,
    );
    final token = result['token'] as String?;
    if (token == null || token.length < 32 || result['profile'] is! Map) {
      throw GuestAccountException(
        appStrings.msgTheServerReturnedIncompleteAccountDetails,
      );
    }
    await _store.write(token);
    _token = token;
    return GuestProfile.fromJson(
      Map<String, dynamic>.from(result['profile'] as Map),
    );
  }

  Future<GuestProfile> update(
    GuestProfile profile, {
    String? currentPassword,
  }) async => GuestProfile.fromJson(
    Map<String, dynamic>.from(
      await _request(
        'me',
        method: 'PUT',
        body: {...profile.toJson(), 'currentPassword': ?currentPassword},
      ) as Map,
    ),
  );
  Future<void> changePassword(
    String current,
    String password,
    String confirmation,
  ) async {
    await _request(
      'password',
      method: 'POST',
      body: {
        'currentPassword': current,
        'newPassword': password,
        'confirmPassword': confirmation,
      },
    );
    await forgetSession();
  }

  Future<void> deleteAccount(String password) async {
    await _request('me', method: 'DELETE', body: {'currentPassword': password});
    await forgetSession();
  }

  Future<void> logout() async {
    await _request('logout', method: 'POST');
    await forgetSession();
  }

  Future<void> forgetSession() async {
    _token = null;
    await _store.clear();
  }

  void close() => _client.close();
}
