import 'dart:ui';

/// Exact outlines from the bundled assets/fonts/Inter.ttf, extracted with
/// CoreText at font size 52, `wght` = 700 and `opsz` = 32 (the font maximum).
/// Pin optical size 32 in matching TextStyles when scaling these outlines.
/// Coordinates are logical pixels with the glyph baseline at (0, 0), positive
/// x rightward and positive y downward (CoreText's y axis is flipped).
/// Advance widths and font metrics share the same 52-pixel coordinate space.
/// No system-font substitution, outline simplification, or bitmap tracing.
abstract final class SeatMapInitialPaths {
  static const fontSize = 52.0;
  static const fontOpticalSize = 32.0;
  static const fontAscent = 50.375;
  static const fontDescent = 12.54296875;
  static const fontLeading = 0.0;
  static const capHeight = 37.83203125;
  static const sAdvance = 33.929411292;
  static const mAdvance = 46.477969885;
  static const sBounds = Rect.fromLTWH(
    1.788452148,
    -38.44140625,
    30.352508545,
    39.05078125,
  );
  static const mBounds = Rect.fromLTWH(
    2.825500488,
    -37.83203125,
    40.826934814,
    37.83203125,
  );

  static final Path sPath = Path()
    ..moveTo(17.127563477, 0.609375)
    ..quadraticBezierTo(12.294219971, 0.609375, 8.861923218, -0.931518555)
    ..quadraticBezierTo(5.429626465, -2.472412109, 3.609039307, -5.389556885)
    ..quadraticBezierTo(1.788452148, -8.30670166, 1.788452148, -12.406890869)
    ..lineTo(9.325897217, -12.406890869)
    ..quadraticBezierTo(9.367156982, -10.346282959, 10.318710327, -8.863113403)
    ..quadraticBezierTo(11.270263672, -7.379943848, 13.024002075, -6.591644287)
    ..quadraticBezierTo(14.777740479, -5.803344727, 17.19619751, -5.803344727)
    ..quadraticBezierTo(19.374237061, -5.803344727, 20.98614502, -6.403198242)
    ..quadraticBezierTo(22.598052979, -7.003051758, 23.500808716, -8.096633911)
    ..quadraticBezierTo(24.403564453, -9.190216064, 24.403564453, -10.659301758)
    ..quadraticBezierTo(24.403564453, -11.877258301, 23.708297729, -12.78477478)
    ..quadraticBezierTo(23.013031006, -13.69229126, 21.519348145, -14.369308472)
    ..quadraticBezierTo(
      20.025665283,
      -15.046325684,
      17.612365723,
      -15.569610596,
    )
    ..lineTo(13.632781982, -16.432495117)
    ..quadraticBezierTo(8.008361816, -17.648468018, 5.265579224, -20.268264771)
    ..quadraticBezierTo(2.522796631, -22.888061523, 2.522796631, -26.939453125)
    ..quadraticBezierTo(2.522796631, -30.392974854, 4.320175171, -32.975479126)
    ..quadraticBezierTo(6.117553711, -35.557983398, 9.350891113, -36.999694824)
    ..quadraticBezierTo(12.584228516, -38.44140625, 16.876037598, -38.44140625)
    ..quadraticBezierTo(21.236480713, -38.44140625, 24.411102295, -36.972518921)
    ..quadraticBezierTo(
      27.585723877,
      -35.503631592,
      29.347793579,
      -32.766998291,
    )
    ..quadraticBezierTo(31.109863281, -30.03036499, 31.225311279, -26.221374512)
    ..lineTo(23.908843994, -26.221374512)
    ..quadraticBezierTo(23.719604492, -28.925872803, 21.842880249, -30.4715271)
    ..quadraticBezierTo(
      19.966156006,
      -32.017181396,
      16.915710449,
      -32.017181396,
    )
    ..quadraticBezierTo(14.99911499, -32.017181396, 13.511978149, -31.417129517)
    ..quadraticBezierTo(12.024841309, -30.817077637, 11.178817749, -29.7605896)
    ..quadraticBezierTo(
      10.332794189,
      -28.704101562,
      10.332794189,
      -27.318725586,
    )
    ..quadraticBezierTo(
      10.332794189,
      -26.147979736,
      10.998504639,
      -25.302947998,
    )
    ..quadraticBezierTo(11.664215088, -24.45791626, 13.107910156, -23.818786621)
    ..quadraticBezierTo(
      14.551605225,
      -23.179656982,
      16.868896484,
      -22.672241211,
    )
    ..lineTo(20.488250732, -21.879974365)
    ..quadraticBezierTo(23.516082764, -21.235687256, 25.718719482, -20.28453064)
    ..quadraticBezierTo(27.921356201, -19.333374023, 29.34362793, -18.022781372)
    ..quadraticBezierTo(
      30.765899658,
      -16.712188721,
      31.453430176,
      -15.010620117,
    )
    ..quadraticBezierTo(
      32.140960693,
      -13.309051514,
      32.140960693,
      -11.177825928,
    )
    ..quadraticBezierTo(32.140960693, -7.532287598, 30.331085205, -4.886306763)
    ..quadraticBezierTo(28.521209717, -2.240325928, 25.155166626, -0.815475464)
    ..quadraticBezierTo(21.789123535, 0.609375, 17.127563477, 0.609375)
    ..close();

  static final Path mPath = Path()
    ..moveTo(2.825500488, 0)
    ..lineTo(2.825500488, -37.83203125)
    ..lineTo(14.215179443, -37.83203125)
    ..lineTo(20.467224121, -20.206573486)
    ..quadraticBezierTo(20.85244751, -19.010040283, 21.377914429, -17.275146484)
    ..quadraticBezierTo(
      21.903381348,
      -15.540252686,
      22.461181641,
      -13.642105103,
    )
    ..quadraticBezierTo(23.018981934, -11.74395752, 23.498626709, -10.026519775)
    ..quadraticBezierTo(23.978271484, -8.309082031, 24.2734375, -7.147857666)
    ..lineTo(22.327484131, -7.147857666)
    ..quadraticBezierTo(22.622650146, -8.309082031, 23.096343994, -10.026519775)
    ..quadraticBezierTo(23.570037842, -11.74395752, 24.12109375, -13.642105103)
    ..quadraticBezierTo(
      24.672149658,
      -15.540252686,
      25.190872192,
      -17.275146484,
    )
    ..quadraticBezierTo(25.709594727, -19.010040283, 26.08291626, -20.206573486)
    ..lineTo(32.237365723, -37.83203125)
    ..lineTo(43.652435303, -37.83203125)
    ..lineTo(43.652435303, 0)
    ..lineTo(35.991210938, 0)
    ..lineTo(35.991210938, -17.988861084)
    ..quadraticBezierTo(35.991210938, -19.24887085, 36.031280518, -21.001815796)
    ..quadraticBezierTo(
      36.071350098,
      -22.754760742,
      36.130065918,
      -24.748321533,
    )
    ..quadraticBezierTo(36.188781738, -26.741882324, 36.24055481, -28.781463623)
    ..quadraticBezierTo(
      36.292327881,
      -30.821044922,
      36.304229736,
      -32.654327393,
    )
    ..lineTo(37.240509033, -32.654327393)
    ..quadraticBezierTo(36.660491943, -30.657592773, 36.03742981, -28.549972534)
    ..quadraticBezierTo(
      35.414367676,
      -26.442352295,
      34.827407837,
      -24.455535889,
    )
    ..quadraticBezierTo(
      34.240447998,
      -22.468719482,
      33.728469849,
      -20.803451538,
    )
    ..quadraticBezierTo(
      33.216491699,
      -19.138183594,
      32.833648682,
      -17.988861084,
    )
    ..lineTo(26.420532227, 0)
    ..lineTo(20.085174561, 0)
    ..lineTo(13.607391357, -17.988861084)
    ..quadraticBezierTo(13.22454834, -19.138183594, 12.693130493, -20.803451538)
    ..quadraticBezierTo(
      12.161712646,
      -22.468719482,
      11.561859131,
      -24.455535889,
    )
    ..quadraticBezierTo(
      10.962005615,
      -26.442352295,
      10.320495605,
      -28.549972534,
    )
    ..quadraticBezierTo(9.678985596, -30.657592773, 9.061676025, -32.654327393)
    ..lineTo(10.18560791, -32.654327393)
    ..quadraticBezierTo(10.209014893, -30.821044922, 10.2550354, -28.781463623)
    ..quadraticBezierTo(
      10.301055908,
      -26.741882324,
      10.359573364,
      -24.748321533,
    )
    ..quadraticBezierTo(10.41809082, -22.754760742, 10.4581604, -21.001815796)
    ..quadraticBezierTo(10.49822998, -19.24887085, 10.49822998, -17.988861084)
    ..lineTo(10.49822998, 0)
    ..close();
}
