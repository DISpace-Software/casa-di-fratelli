import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:seatmap_mobile/data/guest_account_repository.dart';
import 'package:seatmap_mobile/data/seatmap_repository.dart';
import 'package:seatmap_mobile/data/demo_data.dart';
import 'package:seatmap_mobile/state/app_controller.dart';
import 'package:seatmap_mobile/ui/screens/seat_map_screen.dart';
import 'package:seatmap_mobile/ui/screens/account_screens.dart';
import 'package:seatmap_mobile/ui/components.dart';
import 'package:seatmap_mobile/ui/theme.dart';

http.Response response(Object value) => http.Response(
  jsonEncode(value),
  200,
  headers: {'content-type': 'application/json; charset=utf-8'},
);

class Sessions implements GuestSessionStore {
  String? value;
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String token) async {
    value = token;
  }

  @override
  Future<void> clear() async {
    value = null;
  }
}

void main() {
  testWidgets(
    'map polling removes stale selections and disables closed zones',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var removed = false, closed = false, reads = 0;
      final repository = SeatMapRepository(
        baseUrl: 'https://api.example.test',
        client: MockClient((request) async {
          if (request.url.path.endsWith('/floor-plan')) {
            reads++;
            return response({
              'schemaVersion': 1,
              'revision': '$removed-$closed',
              'publicMaxGuests': 6,
              'publicMaxTables': 2,
              'zones': [
                {'id': 'hall', 'name': 'Hall', 'isActive': true},
              ],
              'tables': removed
                  ? []
                  : [
                      {
                        'id': '10',
                        'area': 'hall',
                        'x': 50,
                        'y': 50,
                        'seats': 4,
                        'isActive': true,
                      },
                    ],
              'combinations': [],
            });
          }
          if (request.url.path.endsWith('/blocked-slots')) {
            return response([]);
          }
          if (request.url.path.endsWith('/zones')) {
            return response({
              'closedAreas': closed ? ['hall'] : [],
            });
          }
          return response({'enabled': false});
        }),
      );
      final controller = AppController(
        initialLanguage: 'en',
        repository: repository,
      );
      await tester.pumpWidget(
        MaterialApp(
          theme: seatMapTheme(),
          home: SeatMapScreen(
            controller: controller,
            restaurant: demoRestaurants.first,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('10').first);
      await tester.pump();
      expect(find.text('Table 10'), findsOneWidget);
      removed = true;
      await tester.pump(Duration(seconds: 3));
      await tester.pumpAndSettle();
      expect(reads, greaterThan(1));
      expect(find.text('Table 10'), findsNothing);
      expect(find.text('10'), findsNothing);
      closed = true;
      await tester.pump(Duration(seconds: 3));
      await tester.pumpAndSettle();
      final tab = tester.widget<ChoicePill>(
        find.byWidgetPredicate(
          (w) => w is ChoicePill && w.label == 'Hall · Closed',
        ),
      );
      expect(tab.onTap, isNull);
      expect(find.textContaining('No rooms are open'), findsOneWidget);
      await tester.pumpWidget(SizedBox());
      repository.close();
    },
  );
  testWidgets('password recovery submits code and revokes the local session', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final store = Sessions()..value = 'previous-session';
    var calls = 0;
    final accounts = GuestAccountRepository(
      baseUrl: 'https://api.example.test',
      store: store,
      client: MockClient((request) async {
        calls++;
        expect(request.headers.containsKey('authorization'), false);
        if (request.url.path.endsWith('/password/forgot')) {
          expect(jsonDecode(request.body)['email'], 'guest@example.test');
          return response({
            'challengeId': 'reset-challenge',
            'resendAfterSeconds': 60,
          });
        }
        expect(request.url.path, '/api/v1/guest/password/reset');
        final body = jsonDecode(request.body);
        expect(body['challengeId'], 'reset-challenge');
        expect(body['code'], '123456');
        expect(body['newPassword'], 'My new long passphrase!');
        return http.Response('', 204);
      }),
    );
    final controller = AppController(initialLanguage: 'en', accounts: accounts);
    await tester.pumpWidget(
      MaterialApp(
        theme: seatMapTheme(),
        home: EmailCodeScreen(
          controller: controller,
          email: 'guest@example.test',
          reset: true,
        ),
      ),
    );
    await tester.tap(find.byType(PrimaryButton));
    await tester.pumpAndSettle();
    Future<void> fill(String label, String value) async {
      final field = find.byWidgetPredicate(
        (w) => w is TextField && w.decoration?.labelText == label,
      );
      await tester.ensureVisible(field);
      await tester.enterText(field, value);
      await tester.pumpAndSettle();
    }

    await fill('6-digit code', '123456');
    await fill('New password', 'My new long passphrase!');
    await fill('Confirm new password', 'My new long passphrase!');
    await tester.ensureVisible(find.byType(PrimaryButton));
    await tester.tap(find.byType(PrimaryButton));
    await tester.pumpAndSettle();
    expect(calls, 2);
    expect(store.value, isNull);
    expect(controller.isLoggedIn, false);
    expect(find.textContaining('Password changed.'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(SizedBox());
    accounts.close();
  });
}
