import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:seatmap_mobile/data/guest_account_repository.dart';
import 'package:seatmap_mobile/data/seatmap_repository.dart';
import 'package:seatmap_mobile/domain/models.dart';
import 'package:seatmap_mobile/state/app_controller.dart';
import 'package:seatmap_mobile/ui/screens/account_screens.dart';
import 'package:seatmap_mobile/ui/theme.dart';
import 'package:seatmap_mobile/ui/components.dart';

http.Response utf8Response(String body, int status) => http.Response(
  body,
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

class MemorySessions implements GuestSessionStore {
  String? token;
  @override
  Future<String?> read() async => token;
  @override
  Future<void> write(String value) async {
    token = value;
  }

  @override
  Future<void> clear() async {
    token = null;
  }
}

const token = 'a-long-server-session-token-that-is-not-a-password';
const profile = GuestProfile(
  id: 'guest-1',
  firstName: 'Мария',
  lastName: 'Иванова',
  email: 'maria@example.test',
  phone: '+359888123456',
  city: 'София',
  country: 'България',
  preferredLanguage: 'bg',
);
http.Response authenticated() => utf8Response(
  jsonEncode({'token': token, 'profile': profile.toJson()}),
  201,
);

void main() {
  test(
    'registration waits for email verification before persisting a session',
    () async {
      final store = MemorySessions();
      final api = GuestAccountRepository(
        baseUrl: 'https://api.example.test',
        store: store,
        client: MockClient((request) async {
          expect(request.url.path, '/api/v1/guest/register');
          final body = jsonDecode(request.body) as Map;
          expect(body['firstName'], 'Мария');
          expect(body['lastName'], 'Иванова');
          expect(body['phone'], '+359888123456');
          expect(body['privacyConsent'], true);
          expect(body['confirmPassword'], 'A unique passphrase!');
          expect(body['preferredLanguage'], 'bg');
          expect(request.headers.containsKey('authorization'), false);
          return utf8Response(
            jsonEncode({
              'challengeId': 'challenge-1',
              'resendAfterSeconds': 60,
            }),
            201,
          );
        }),
      );
      final result = await api.register(
        profile,
        'A unique passphrase!',
        'A unique passphrase!',
        privacyConsent: true,
      );
      expect(result['challengeId'], 'challenge-1');
      expect(store.token, isNull);
      api.close();
    },
  );
  test(
    'restore fetches server profile and logout clears the session',
    () async {
      final store = MemorySessions()..token = token;
      final api = GuestAccountRepository(
        baseUrl: 'https://api.example.test',
        store: store,
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer $token');
          return request.url.path.endsWith('/logout')
              ? utf8Response('', 204)
              : utf8Response(jsonEncode(profile.toJson()), 200);
        }),
      );
      expect((await api.restore())!.email, profile.email);
      await api.logout();
      expect(store.token, isNull);
      api.close();
    },
  );
  test(
    'expired session is removed; failed edit never becomes local success',
    () async {
      final store = MemorySessions()..token = token;
      final api = GuestAccountRepository(
        baseUrl: 'https://api.example.test',
        store: store,
        client: MockClient(
          (request) async => utf8Response(
            jsonEncode({'code': 'SESSION_EXPIRED', 'message': 'Войдите снова'}),
            401,
          ),
        ),
      );
      final controller =
          AppController(
              initialLanguage: 'ru',
              repository: SeatMapRepository(
                baseUrl: 'https://api.example.test',
              ),
              accounts: api,
            )
            ..profile = profile
            ..isLoggedIn = true;
      await expectLater(
        controller.updateProfile(profile),
        throwsA(isA<GuestAccountException>()),
      );
      expect(store.token, isNull);
      expect(controller.isLoggedIn, false);
      expect(controller.profile.email, isEmpty);
      api.close();
    },
  );
  test(
    'server validation keeps field errors without creating session',
    () async {
      final store = MemorySessions();
      final api = GuestAccountRepository(
        baseUrl: 'https://api.example.test',
        store: store,
        client: MockClient(
          (request) async => utf8Response(
            jsonEncode({
              'errors': {
                'Phone': ['Invalid international phone'],
              },
            }),
            400,
          ),
        ),
      );
      await expectLater(
        api.register(
          profile,
          'A unique passphrase!',
          'A unique passphrase!',
          privacyConsent: true,
        ),
        throwsA(
          isA<GuestAccountException>().having(
            (e) => e.fields['phone'],
            'field error',
            'Invalid international phone',
          ),
        ),
      );
      expect(store.token, isNull);
      api.close();
    },
  );
  testWidgets('registration validates fields, waits for code, then signs in', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    var calls = 0;
    final api = GuestAccountRepository(
      baseUrl: 'https://api.example.test',
      store: MemorySessions(),
      client: MockClient((request) async {
        calls++;
        if (request.url.path.endsWith('/register')) {
          return utf8Response(
            jsonEncode({
              'challengeId': 'challenge-1',
              'resendAfterSeconds': 60,
            }),
            201,
          );
        }
        expect(request.url.path, '/api/v1/guest/email/verify');
        expect(jsonDecode(request.body)['code'], '123456');
        return authenticated();
      }),
    );
    final controller = AppController(
      initialLanguage: 'ru',
      repository: SeatMapRepository(baseUrl: 'https://api.example.test'),
      accounts: api,
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: seatMapTheme(),
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => Navigator.push<void>(
                context,
                MaterialPageRoute(
                  builder: (_) => RegisterScreen(controller: controller),
                ),
              ),
              child: const Text('Start'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Start'));
    await tester.pumpAndSettle();
    Future<void> fill(String label, String value) async {
      final field = find.byWidgetPredicate(
        (w) => w is TextField && w.decoration?.labelText == label,
      );
      await tester.ensureVisible(field);
      await tester.pumpAndSettle();
      await tester.enterText(field, value);
      await tester.pumpAndSettle();
    }

    await fill('Имя *', 'Мария');
    await fill('Фамилия *', 'Иванова');
    await fill('Email *', 'maria@example.test');
    await fill('Телефон *', '+359888123456');
    await fill('Пароль *', 'A unique passphrase!');
    await fill('Повторите пароль *', 'different password');
    final consent = find.byType(CheckboxListTile);
    await tester.ensureVisible(consent);
    await tester.pumpAndSettle();
    await tester.tap(consent);
    await tester.pumpAndSettle();
    final submit = find.byType(PrimaryButton);
    await tester.ensureVisible(submit);
    await tester.pumpAndSettle();
    await tester.tap(submit);
    await tester.pumpAndSettle();
    expect(
      find.text('Пароли не совпадают'),
      findsOneWidget,
      reason: tester
          .widgetList<Text>(find.byType(Text))
          .map((w) => w.data)
          .join(' | '),
    );
    expect(calls, 0);
    await fill('Повторите пароль *', 'A unique passphrase!');
    await tester.ensureVisible(submit);
    await tester.pumpAndSettle();
    await tester.tap(submit);
    await tester.pumpAndSettle();
    expect(calls, 1);
    expect(controller.isLoggedIn, false);
    await fill('Код из 6 цифр', '123456');
    final verify = find.byType(PrimaryButton);
    await tester.ensureVisible(verify);
    await tester.tap(verify);
    await tester.pumpAndSettle();
    expect(calls, 2);
    expect(controller.isLoggedIn, true);
    expect(controller.profile.email, profile.email);
    expect(find.text('Start'), findsOneWidget);
    expect(tester.takeException(), isNull);
    api.close();
  });
}
