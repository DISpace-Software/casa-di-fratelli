// Shared locale state with no Flutter dependency; also used by read-only CLI checks.
abstract final class AppLanguage {
  static String code = 'ru';
  static const supported = ['bg', 'en', 'ru'];
}
