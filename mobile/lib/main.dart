import 'l10n/language.dart';

import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import 'state/app_controller.dart';
import 'ui/screens/discovery_screens.dart';
import 'ui/theme.dart';

const _systemOverlayStyle = SystemUiOverlayStyle(
  statusBarColor: Colors.transparent,
  statusBarIconBrightness: Brightness.light,
  statusBarBrightness: Brightness.dark,
  systemNavigationBarColor: SeatMapColors.background,
  systemNavigationBarIconBrightness: Brightness.light,
  // Android 15+ draws behind system navigation; our dark safe area supplies
  // contrast, so the default gray three-button scrim is unnecessary.
  systemNavigationBarContrastEnforced: false,
);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(_systemOverlayStyle);
  runApp(SeatMapApp(controller: AppController()));
}

class SeatMapApp extends StatefulWidget {
  const SeatMapApp({
    super.key,
    required this.controller,
    this.previewChrome = kIsWeb,
  });
  final AppController controller;
  final bool previewChrome;
  @override
  State<SeatMapApp> createState() => _SeatMapAppState();
}

class _SeatMapAppState extends State<SeatMapApp> {
  @override
  void initState() {
    super.initState();
    widget.controller.initialize();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: widget.controller,
    builder: (context, _) => MaterialApp(
      localizationsDelegates: [
        AppLocalizations.delegate,
        ...GlobalMaterialLocalizations.delegates,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      locale: widget.controller.locale,
      title: 'SeatMap',
      debugShowCheckedModeBanner: false,
      theme: seatMapTheme(),
      home: AppShell(controller: widget.controller),
      builder: (context, child) => LayoutBuilder(
        builder: (context, constraints) {
          final framed = widget.previewChrome && constraints.maxWidth > 600;
          final size = framed
              ? Size(390, math.min(844, constraints.maxHeight - 36))
              : Size(constraints.maxWidth, constraints.maxHeight);
          final navigator = AnnotatedRegion<SystemUiOverlayStyle>(
            value: _systemOverlayStyle,
            child: MediaQuery(
              data: MediaQuery.of(context).copyWith(
                size: size,
                padding: widget.previewChrome && !kIsWeb
                    ? const EdgeInsets.only(top: 44, bottom: 24)
                    : framed
                    ? EdgeInsets.zero
                    : MediaQuery.paddingOf(context),
              ),
              child: Stack(
                children: [
                  Positioned.fill(child: child!),
                  if (widget.previewChrome)
                    const Positioned(
                      top: 0,
                      left: 0,
                      right: 0,
                      child: IgnorePointer(child: _PreviewStatusBar()),
                    ),
                  if (widget.previewChrome)
                    Positioned(
                      bottom: 10,
                      left: (size.width - 128) / 2,
                      child: IgnorePointer(
                        child: Container(
                          width: 128,
                          height: 4,
                          decoration: BoxDecoration(
                            color: SeatMapColors.text,
                            borderRadius: BorderRadius.circular(3),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          );
          if (!framed) return navigator;
          return ColoredBox(
            color: const Color(0xFFECE7DC),
            child: Center(
              child: SizedBox.fromSize(
                size: size,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(30),
                  child: navigator,
                ),
              ),
            ),
          );
        },
      ),
    ),
  );
}

class _PreviewStatusBar extends StatelessWidget {
  const _PreviewStatusBar();
  @override
  Widget build(BuildContext context) => SizedBox(
    height: 44,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(29, 12, 20, 0),
      child: Row(
        children: [
          const Text(
            '9:41',
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: SeatMapColors.text,
              decoration: TextDecoration.none,
            ),
          ),
          const Spacer(),
          const Icon(
            Icons.signal_cellular_alt_rounded,
            size: 17,
            color: SeatMapColors.text,
          ),
          const SizedBox(width: 2),
          const Icon(Icons.wifi_rounded, size: 17, color: SeatMapColors.text),
          const SizedBox(width: 3),
          Transform.rotate(
            angle: math.pi / 2,
            child: const Icon(
              Icons.battery_full_rounded,
              size: 22,
              color: SeatMapColors.text,
            ),
          ),
        ],
      ),
    ),
  );
}
