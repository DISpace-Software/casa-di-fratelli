import 'package:material_ui/material_ui.dart';

abstract final class SeatMapColors {
  static const background = Color(0xFF10101D);
  static const surface = Color(0xFF1B1A2C);
  static const elevated = Color(0xFF26243B);
  static const lavender = Color(0xFFC0A8FF);
  static const lavenderSoft = Color(0xFF332A4E);
  static const text = Color(0xFFF5F2FC);
  static const muted = Color(0xFFA7A3BC);
  static const line = Color(0xFF353148);
  static const occupied = Color(0xFF363348);
  static const available = Color(0xFF2B253F);
  static const peach = Color(0xFFFFCEB8);
}

ThemeData seatMapTheme() => ThemeData(
  useMaterial3: true,
  brightness: Brightness.dark,
  fontFamily: 'Inter',
  scaffoldBackgroundColor: SeatMapColors.background,
  colorScheme: const ColorScheme.dark(
    primary: SeatMapColors.lavender,
    onPrimary: SeatMapColors.background,
    surface: SeatMapColors.surface,
    onSurface: SeatMapColors.text,
    secondary: SeatMapColors.lavender,
    error: Color(0xFFFFA6A6),
  ),
  textTheme: const TextTheme(
    headlineLarge: TextStyle(
      fontSize: 32,
      fontWeight: FontWeight.w700,
      letterSpacing: -1.1,
    ),
    headlineMedium: TextStyle(
      fontSize: 29,
      fontWeight: FontWeight.w700,
      letterSpacing: -.8,
    ),
    titleLarge: TextStyle(
      fontSize: 21,
      fontWeight: FontWeight.w700,
      letterSpacing: -.6,
    ),
    titleMedium: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
    bodyMedium: TextStyle(fontSize: 14, height: 1.45),
    bodySmall: TextStyle(fontSize: 12, color: SeatMapColors.muted, height: 1.4),
  ),
  appBarTheme: const AppBarTheme(
    backgroundColor: SeatMapColors.background,
    surfaceTintColor: Colors.transparent,
    elevation: 0,
  ),
  dividerColor: SeatMapColors.line,
  bottomSheetTheme: const BottomSheetThemeData(
    backgroundColor: SeatMapColors.surface,
    showDragHandle: true,
    dragHandleColor: SeatMapColors.line,
  ),
  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: SeatMapColors.surface,
    contentPadding: const EdgeInsets.symmetric(horizontal: 17, vertical: 16),
    hintStyle: const TextStyle(color: SeatMapColors.muted, fontSize: 14),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(15),
      borderSide: const BorderSide(color: SeatMapColors.line),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(15),
      borderSide: const BorderSide(color: SeatMapColors.line),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(15),
      borderSide: const BorderSide(color: SeatMapColors.lavender),
    ),
  ),
  snackBarTheme: SnackBarThemeData(
    backgroundColor: SeatMapColors.elevated,
    contentTextStyle: const TextStyle(color: SeatMapColors.text),
    behavior: SnackBarBehavior.floating,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
  ),
  pageTransitionsTheme: const PageTransitionsTheme(
    builders: {
      TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
      TargetPlatform.iOS: FadeForwardsPageTransitionsBuilder(),
      TargetPlatform.macOS: FadeForwardsPageTransitionsBuilder(),
      TargetPlatform.windows: FadeForwardsPageTransitionsBuilder(),
      TargetPlatform.linux: FadeForwardsPageTransitionsBuilder(),
    },
  ),
);
