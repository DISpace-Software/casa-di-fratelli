import 'package:material_ui/material_ui.dart';

import 'generated/app_localizations.dart';
import 'language_state.dart';
export 'language_state.dart';
export 'generated/app_localizations.dart';

AppLocalizations get appStrings =>
    lookupAppLocalizations(Locale(AppLanguage.code));

extension SeatMapLocalizations on BuildContext {
  AppLocalizations get l10n =>
      Localizations.of<AppLocalizations>(this, AppLocalizations) ?? appStrings;
}

String resolveAppLanguage({
  String? saved,
  String? countryCode,
  required List<Locale> deviceLocales,
}) {
  if (AppLanguage.supported.contains(saved)) return saved!;
  if (countryCode?.toUpperCase() == 'BG' ||
      deviceLocales.any(
        (locale) => locale.countryCode?.toUpperCase() == 'BG',
      )) {
    return 'bg';
  }
  for (final locale in deviceLocales) {
    if (AppLanguage.supported.contains(locale.languageCode)) {
      return locale.languageCode;
    }
  }
  return 'en';
}

String canonicalCity(String city) => switch (city.toLowerCase()) {
  'софия' || 'софии' || 'sofia' => 'sofia',
  'пловдив' || 'пловдива' || 'plovdiv' => 'plovdiv',
  'варна' || 'varna' => 'varna',
  'бургас' || 'burgas' => 'burgas',
  _ => city.toLowerCase(),
};
