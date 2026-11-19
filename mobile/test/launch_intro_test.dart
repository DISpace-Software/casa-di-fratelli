import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:seatmap_mobile/data/seatmap_repository.dart';
import 'package:seatmap_mobile/main.dart';
import 'package:seatmap_mobile/state/app_controller.dart';
import 'package:seatmap_mobile/ui/brand/seatmap_launch_intro.dart';
import 'package:seatmap_mobile/ui/theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _introKey = ValueKey('seatmap-launch-intro');

void _phone(WidgetTester tester) {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Widget _host(VoidCallback onComplete, {bool reducedMotion = false}) =>
    MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: seatMapTheme(),
      home: Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(disableAnimations: reducedMotion),
          child: Scaffold(
            body: SeatMapLaunchIntro(key: _introKey, onComplete: onComplete),
          ),
        ),
      ),
    );

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('launch intro completes once within its bounded duration', (
    tester,
  ) async {
    _phone(tester);
    var completions = 0;
    await tester.pumpWidget(_host(() => completions++));
    await tester.pump();

    await tester.pump(const Duration(milliseconds: 2600));
    expect(completions, 0);
    await tester.pump(const Duration(milliseconds: 400));
    expect(completions, 1);
    await tester.pump(const Duration(seconds: 5));
    expect(completions, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a tap skips the intro and cannot complete it twice', (
    tester,
  ) async {
    _phone(tester);
    var completions = 0;
    await tester.pumpWidget(_host(() => completions++));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.tapAt(const Offset(195, 422));
    await tester.pump();
    expect(completions, 1);

    await tester.tapAt(const Offset(195, 422));
    await tester.pump(const Duration(seconds: 4));
    expect(completions, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('reduced motion finishes quickly without the assembly sequence', (
    tester,
  ) async {
    _phone(tester);
    var completions = 0;
    await tester.pumpWidget(_host(() => completions++, reducedMotion: true));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(completions, 0);
    await tester.pump(const Duration(milliseconds: 250));
    expect(completions, 1);
    await tester.pump(const Duration(seconds: 4));
    expect(completions, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'disposing midway cancels the intro without invoking completion',
    (tester) async {
      _phone(tester);
      var completions = 0;
      await tester.pumpWidget(_host(() => completions++));
      await tester.pump(const Duration(milliseconds: 900));
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 4));
      expect(completions, 0);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'rotation during assembly preserves the state and completion deadline',
    (tester) async {
      _phone(tester);
      var completions = 0;
      await tester.pumpWidget(_host(() => completions++));
      await tester.pump();
      final initialIntroState = tester.state(find.byType(SeatMapLaunchIntro));
      await tester.pump(const Duration(milliseconds: 1000));
      tester.view.physicalSize = const Size(844, 390);
      await tester.pump();
      expect(
        tester.state(find.byType(SeatMapLaunchIntro)),
        same(initialIntroState),
      );
      expect(completions, 0);
      // Exercise the remaining paint phases at a shallow landscape height.
      for (var frame = 0; frame < 20; frame++) {
        await tester.pump(const Duration(milliseconds: 100));
        expect(tester.takeException(), isNull);
      }
      expect(completions, 1);
    },
  );

  testWidgets(
    'app initializes behind the intro and controller notifications do not reset it',
    (tester) async {
      _phone(tester);
      final controller = _IntroController();
      await tester.pumpWidget(
        SeatMapApp(controller: controller, previewChrome: false),
      );
      await tester.pump();
      expect(controller.initializationCalls, 1);
      expect(find.byKey(_introKey), findsOneWidget);
      final initialIntroState = tester.state(find.byType(SeatMapLaunchIntro));

      // Demo initialization is genuinely asynchronous (preferences + repository),
      // yet must finish while the intro is still on screen.
      for (
        var tick = 0;
        tick < 10 && !controller.initializationCompleted;
        tick++
      ) {
        await tester.pump(const Duration(milliseconds: 20));
      }
      expect(controller.initializationCompleted, isTrue);
      expect(controller.loading, isFalse);
      expect(controller.restaurants, isNotEmpty);
      expect(find.byKey(_introKey), findsOneWidget);

      await tester.pump(const Duration(milliseconds: 1200));
      controller.announce();
      await tester.pump();
      expect(
        tester.state(find.byType(SeatMapLaunchIntro)),
        same(initialIntroState),
      );
      await tester.pump(const Duration(milliseconds: 1700));
      await tester.pump();
      expect(find.byKey(_introKey), findsNothing);
      expect(controller.initializationCalls, 1);

      controller.announce();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.byKey(_introKey), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      controller.dispose();
    },
  );

  testWidgets('the skip tap cannot activate a control underneath the intro', (
    tester,
  ) async {
    _phone(tester);
    final controller = _IntroController();
    await tester.pumpWidget(
      SeatMapApp(controller: controller, previewChrome: false),
    );
    await tester.pump(const Duration(milliseconds: 500));
    final profileTab = find.byKey(const ValueKey('navigation-tab-3'));
    expect(find.byKey(_introKey), findsOneWidget);
    expect(tester.widget<Semantics>(profileTab).properties.selected, isFalse);

    await tester.tapAt(tester.getCenter(profileTab));
    await tester.pump();
    expect(find.byKey(_introKey), findsNothing);
    expect(tester.widget<Semantics>(profileTab).properties.selected, isFalse);

    await tester.tap(profileTab);
    await tester.pumpAndSettle();
    expect(tester.widget<Semantics>(profileTab).properties.selected, isTrue);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    controller.dispose();
  });

  testWidgets('returning to the app does not replay a completed launch intro', (
    tester,
  ) async {
    _phone(tester);
    final controller = _IntroController();
    await tester.pumpWidget(
      SeatMapApp(controller: controller, previewChrome: false),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(_introKey), findsNothing);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump(const Duration(seconds: 1));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();

    expect(find.byKey(_introKey), findsNothing);
    expect(controller.initializationCalls, 1);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    controller.dispose();
  });

  testWidgets('capture key logo assembly frames for visual review', (
    tester,
  ) async {
    _phone(tester);
    await (FontLoader(
      'Inter',
    )..addFont(rootBundle.load('assets/fonts/Inter.ttf'))).load();
    final captureKey = GlobalKey();
    await tester.pumpWidget(
      RepaintBoundary(key: captureKey, child: _host(() {})),
    );
    await tester.pump();
    var elapsed = 0;
    for (final time in [350, 900, 1350, 1800, 2250]) {
      await tester.pump(Duration(milliseconds: time - elapsed));
      elapsed = time;
      expect(tester.takeException(), isNull);
      await _capture(
        tester,
        captureKey,
        '.local/launch-${time.toString().padLeft(4, '0')}.png',
      );
    }
    await tester.pumpWidget(const SizedBox.shrink());
  }, skip: !const bool.fromEnvironment('CAPTURE_LAUNCH'));

  testWidgets('capture the launch motion at 30 fps including the app reveal', (
    tester,
  ) async {
    _phone(tester);
    await (FontLoader(
      'Inter',
    )..addFont(rootBundle.load('assets/fonts/Inter.ttf'))).load();
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
    final controller = AppController(
      initialLanguage: 'bg',
      repository: SeatMapRepository(baseUrl: ''),
    );
    await tester.runAsync(controller.initialize);
    final captureKey = GlobalKey();
    await tester.pumpWidget(
      RepaintBoundary(
        key: captureKey,
        child: SeatMapApp(controller: controller, previewChrome: false),
      ),
    );
    await tester.runAsync(() async {
      for (final asset in [
        'assets/images/cosmos.png',
        'assets/images/made_in_blue.png',
        'assets/images/cofein.webp',
        'assets/images/casa.webp',
        'assets/brand/seatmap-mark.png',
      ]) {
        await precacheImage(AssetImage(asset), captureKey.currentContext!);
      }
    });
    await tester.pump();
    var elapsedMicroseconds = 0;
    for (var frame = 0; frame <= 90; frame++) {
      final time = (frame * 1000000 / 30).round();
      await tester.pump(Duration(microseconds: time - elapsedMicroseconds));
      elapsedMicroseconds = time;
      expect(tester.takeException(), isNull);
      await _capture(
        tester,
        captureKey,
        '.local/launch-motion/frame-${frame.toString().padLeft(3, '0')}.png',
      );
    }
    expect(find.byKey(_introKey), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
    controller.dispose();
  }, skip: !const bool.fromEnvironment('CAPTURE_LAUNCH_MOTION'));
}

Future<void> _capture(
  WidgetTester tester,
  GlobalKey captureKey,
  String path,
) async {
  await tester.runAsync(() async {
    final boundary =
        captureKey.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 2);
    final png = await image.toByteData(format: ui.ImageByteFormat.png);
    final file = File(path);
    await file.parent.create(recursive: true);
    await file.writeAsBytes(png!.buffer.asUint8List());
    image.dispose();
  });
}

class _IntroController extends AppController {
  _IntroController()
    : super(
        initialLanguage: 'en',
        repository: SeatMapRepository(baseUrl: ''),
      );

  int initializationCalls = 0;
  bool initializationCompleted = false;

  @override
  Future<void> initialize() async {
    initializationCalls++;
    await super.initialize();
    initializationCompleted = true;
  }

  void announce() => notifyListeners();
}
