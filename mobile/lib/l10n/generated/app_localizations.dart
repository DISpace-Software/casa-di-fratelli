import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_bg.dart';
import 'app_localizations_en.dart';
import 'app_localizations_ru.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'generated/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('bg'),
    Locale('en'),
    Locale('ru'),
  ];

  /// No description provided for @msgJan.
  ///
  /// In ru, this message translates to:
  /// **'янв'**
  String get msgJan;

  /// No description provided for @msgFeb.
  ///
  /// In ru, this message translates to:
  /// **'фев'**
  String get msgFeb;

  /// No description provided for @msgMar.
  ///
  /// In ru, this message translates to:
  /// **'мар'**
  String get msgMar;

  /// No description provided for @msgApr.
  ///
  /// In ru, this message translates to:
  /// **'апр'**
  String get msgApr;

  /// No description provided for @msgMay.
  ///
  /// In ru, this message translates to:
  /// **'мая'**
  String get msgMay;

  /// No description provided for @msgJun.
  ///
  /// In ru, this message translates to:
  /// **'июн'**
  String get msgJun;

  /// No description provided for @msgJul.
  ///
  /// In ru, this message translates to:
  /// **'июл'**
  String get msgJul;

  /// No description provided for @msgAug.
  ///
  /// In ru, this message translates to:
  /// **'авг'**
  String get msgAug;

  /// No description provided for @msgSep.
  ///
  /// In ru, this message translates to:
  /// **'сен'**
  String get msgSep;

  /// No description provided for @msgOct.
  ///
  /// In ru, this message translates to:
  /// **'окт'**
  String get msgOct;

  /// No description provided for @msgNov.
  ///
  /// In ru, this message translates to:
  /// **'ноя'**
  String get msgNov;

  /// No description provided for @msgDec.
  ///
  /// In ru, this message translates to:
  /// **'дек'**
  String get msgDec;

  /// No description provided for @msgToday.
  ///
  /// In ru, this message translates to:
  /// **'Сегодня, '**
  String get msgToday;

  /// No description provided for @msgGuest.
  ///
  /// In ru, this message translates to:
  /// **'гость'**
  String get msgGuest;

  /// No description provided for @msgGuests.
  ///
  /// In ru, this message translates to:
  /// **'гостя'**
  String get msgGuests;

  /// No description provided for @msgGuests15.
  ///
  /// In ru, this message translates to:
  /// **'гостей'**
  String get msgGuests15;

  /// No description provided for @msgDiscover.
  ///
  /// In ru, this message translates to:
  /// **'Обзор'**
  String get msgDiscover;

  /// No description provided for @msgSearch.
  ///
  /// In ru, this message translates to:
  /// **'Поиск'**
  String get msgSearch;

  /// No description provided for @msgBookings.
  ///
  /// In ru, this message translates to:
  /// **'Брони'**
  String get msgBookings;

  /// No description provided for @msgProfile.
  ///
  /// In ru, this message translates to:
  /// **'Профиль'**
  String get msgProfile;

  /// No description provided for @msgWhereShallWeDine.
  ///
  /// In ru, this message translates to:
  /// **'Где поужинаем?'**
  String get msgWhereShallWeDine;

  /// Столики в ресторанах {p0}
  ///
  /// In ru, this message translates to:
  /// **'Столики в ресторанах {p0}'**
  String msgRestaurantTablesInP(String p0);

  /// No description provided for @msgSofia.
  ///
  /// In ru, this message translates to:
  /// **'София'**
  String get msgSofia;

  /// No description provided for @msgSofia23.
  ///
  /// In ru, this message translates to:
  /// **'Софии'**
  String get msgSofia23;

  /// No description provided for @msgPlovdiv.
  ///
  /// In ru, this message translates to:
  /// **'Пловдив'**
  String get msgPlovdiv;

  /// No description provided for @msgPlovdiv25.
  ///
  /// In ru, this message translates to:
  /// **'Пловдива'**
  String get msgPlovdiv25;

  /// No description provided for @msgAllPlaces.
  ///
  /// In ru, this message translates to:
  /// **'Все места'**
  String get msgAllPlaces;

  /// No description provided for @msgForASpecialEvening.
  ///
  /// In ru, this message translates to:
  /// **'Для особенного вечера'**
  String get msgForASpecialEvening;

  /// No description provided for @msgToday28.
  ///
  /// In ru, this message translates to:
  /// **'Сегодня'**
  String get msgToday28;

  /// No description provided for @msgFindATable.
  ///
  /// In ru, this message translates to:
  /// **'Найти столик'**
  String get msgFindATable;

  /// No description provided for @msgNew.
  ///
  /// In ru, this message translates to:
  /// **'Новое'**
  String get msgNew;

  /// No description provided for @msgRemoveFromFavourites.
  ///
  /// In ru, this message translates to:
  /// **'Убрать из избранного'**
  String get msgRemoveFromFavourites;

  /// No description provided for @msgAddToFavourites.
  ///
  /// In ru, this message translates to:
  /// **'В избранное'**
  String get msgAddToFavourites;

  /// No description provided for @msgBack.
  ///
  /// In ru, this message translates to:
  /// **'Назад'**
  String get msgBack;

  /// No description provided for @msgAll.
  ///
  /// In ru, this message translates to:
  /// **'Все'**
  String get msgAll;

  /// No description provided for @msgFavouritePlaces.
  ///
  /// In ru, this message translates to:
  /// **'Избранные места'**
  String get msgFavouritePlaces;

  /// No description provided for @msgFindYourPlace.
  ///
  /// In ru, this message translates to:
  /// **'Найдём ваше место'**
  String get msgFindYourPlace;

  /// No description provided for @msgRestaurantsWorthReturningTo.
  ///
  /// In ru, this message translates to:
  /// **'Рестораны, в которые хочется вернуться'**
  String get msgRestaurantsWorthReturningTo;

  /// No description provided for @msgAGreatEveningStartsHere.
  ///
  /// In ru, this message translates to:
  /// **'Хороший вечер начинается здесь'**
  String get msgAGreatEveningStartsHere;

  /// No description provided for @msgRestaurantCuisineOrArea.
  ///
  /// In ru, this message translates to:
  /// **'Ресторан, кухня или район'**
  String get msgRestaurantCuisineOrArea;

  /// No description provided for @msgBulgarian.
  ///
  /// In ru, this message translates to:
  /// **'Болгарская'**
  String get msgBulgarian;

  /// No description provided for @msgEuropean.
  ///
  /// In ru, this message translates to:
  /// **'Европейская'**
  String get msgEuropean;

  /// No description provided for @msgItalian.
  ///
  /// In ru, this message translates to:
  /// **'Итальянская'**
  String get msgItalian;

  /// No description provided for @msgRestaurant.
  ///
  /// In ru, this message translates to:
  /// **'ресторан'**
  String get msgRestaurant;

  /// No description provided for @msgRestaurants.
  ///
  /// In ru, this message translates to:
  /// **'ресторана'**
  String get msgRestaurants;

  /// No description provided for @msgFavourites.
  ///
  /// In ru, this message translates to:
  /// **'Избранное'**
  String get msgFavourites;

  /// No description provided for @msgNoPlacesFoundYet.
  ///
  /// In ru, this message translates to:
  /// **'Пока ничего не нашлось'**
  String get msgNoPlacesFoundYet;

  /// No description provided for @msgTryAnotherNameOrCuisineYourPlaceIs.
  ///
  /// In ru, this message translates to:
  /// **'Попробуйте другое название или кухню.\nВаше место обязательно найдётся.'**
  String get msgTryAnotherNameOrCuisineYourPlaceIs;

  /// No description provided for @msgTryAgain.
  ///
  /// In ru, this message translates to:
  /// **'Попробовать ещё раз'**
  String get msgTryAgain;

  /// No description provided for @msgOf.
  ///
  /// In ru, this message translates to:
  /// **'1 из 6'**
  String get msgOf;

  /// No description provided for @msgOf50.
  ///
  /// In ru, this message translates to:
  /// **'1 из 1'**
  String get msgOf50;

  /// {p0} кухня
  ///
  /// In ru, this message translates to:
  /// **'{p0} кухня'**
  String msgPCuisine(String p0);

  /// No description provided for @msgBookATable.
  ///
  /// In ru, this message translates to:
  /// **'Забронировать стол'**
  String get msgBookATable;

  /// No description provided for @msgAvailableTimes.
  ///
  /// In ru, this message translates to:
  /// **'Доступное время'**
  String get msgAvailableTimes;

  /// No description provided for @msgAboutTheRestaurant.
  ///
  /// In ru, this message translates to:
  /// **'О ресторане'**
  String get msgAboutTheRestaurant;

  /// No description provided for @msgViewMenu.
  ///
  /// In ru, this message translates to:
  /// **'Посмотреть меню'**
  String get msgViewMenu;

  /// No description provided for @msgChooseATable.
  ///
  /// In ru, this message translates to:
  /// **'Выбрать столик'**
  String get msgChooseATable;

  /// {p0} из {p1}
  ///
  /// In ru, this message translates to:
  /// **'{p0} из {p1}'**
  String msgPOfP(String p0, String p1);

  /// No description provided for @msgAtmosphereDemoPhotos.
  ///
  /// In ru, this message translates to:
  /// **'Атмосфера · демонстрационные фото'**
  String get msgAtmosphereDemoPhotos;

  /// Меню · {p0}
  ///
  /// In ru, this message translates to:
  /// **'Меню · {p0}'**
  String msgMenuP(String p0);

  /// No description provided for @msgCouldNotLoadTheMenuPleaseTryLater.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось загрузить меню. Попробуйте позже.'**
  String get msgCouldNotLoadTheMenuPleaseTryLater;

  /// No description provided for @msgMenuComingSoon.
  ///
  /// In ru, this message translates to:
  /// **'Меню скоро появится'**
  String get msgMenuComingSoon;

  /// No description provided for @msgWhenShallWeMeet.
  ///
  /// In ru, this message translates to:
  /// **'Когда встретимся?'**
  String get msgWhenShallWeMeet;

  /// No description provided for @msgSelect.
  ///
  /// In ru, this message translates to:
  /// **'Выбрать'**
  String get msgSelect;

  /// No description provided for @msgWhatTimeShallWeExpectYou.
  ///
  /// In ru, this message translates to:
  /// **'Во сколько вас ждать?'**
  String get msgWhatTimeShallWeExpectYou;

  /// No description provided for @msgHowManyGuests.
  ///
  /// In ru, this message translates to:
  /// **'Сколько вас будет?'**
  String get msgHowManyGuests;

  /// No description provided for @msgDone.
  ///
  /// In ru, this message translates to:
  /// **'Готово'**
  String get msgDone;

  /// No description provided for @msgYourCity.
  ///
  /// In ru, this message translates to:
  /// **'Ваш город'**
  String get msgYourCity;

  /// No description provided for @msgVarna.
  ///
  /// In ru, this message translates to:
  /// **'Варна'**
  String get msgVarna;

  /// No description provided for @msgBurgas.
  ///
  /// In ru, this message translates to:
  /// **'Бургас'**
  String get msgBurgas;

  /// No description provided for @msgJanuary.
  ///
  /// In ru, this message translates to:
  /// **'января'**
  String get msgJanuary;

  /// No description provided for @msgFebruary.
  ///
  /// In ru, this message translates to:
  /// **'февраля'**
  String get msgFebruary;

  /// No description provided for @msgMarch.
  ///
  /// In ru, this message translates to:
  /// **'марта'**
  String get msgMarch;

  /// No description provided for @msgApril.
  ///
  /// In ru, this message translates to:
  /// **'апреля'**
  String get msgApril;

  /// No description provided for @msgJune.
  ///
  /// In ru, this message translates to:
  /// **'июня'**
  String get msgJune;

  /// No description provided for @msgJuly.
  ///
  /// In ru, this message translates to:
  /// **'июля'**
  String get msgJuly;

  /// No description provided for @msgAugust.
  ///
  /// In ru, this message translates to:
  /// **'августа'**
  String get msgAugust;

  /// No description provided for @msgSeptember.
  ///
  /// In ru, this message translates to:
  /// **'сентября'**
  String get msgSeptember;

  /// No description provided for @msgOctober.
  ///
  /// In ru, this message translates to:
  /// **'октября'**
  String get msgOctober;

  /// No description provided for @msgNovember.
  ///
  /// In ru, this message translates to:
  /// **'ноября'**
  String get msgNovember;

  /// No description provided for @msgDecember.
  ///
  /// In ru, this message translates to:
  /// **'декабря'**
  String get msgDecember;

  /// No description provided for @msgGotIt.
  ///
  /// In ru, this message translates to:
  /// **'Понятно'**
  String get msgGotIt;

  /// No description provided for @msgIncorrectEmailOrPassword.
  ///
  /// In ru, this message translates to:
  /// **'Неверный email или пароль.'**
  String get msgIncorrectEmailOrPassword;

  /// No description provided for @msgYourTableIsWaiting.
  ///
  /// In ru, this message translates to:
  /// **'Ваш столик\nуже ждёт'**
  String get msgYourTableIsWaiting;

  /// No description provided for @msgFavouritePlacesAndEveningPlansAllInOne.
  ///
  /// In ru, this message translates to:
  /// **'Любимые места и планы на вечер —\nв одном приложении.'**
  String get msgFavouritePlacesAndEveningPlansAllInOne;

  /// No description provided for @msgEnterAValidEmail.
  ///
  /// In ru, this message translates to:
  /// **'Введите корректный email'**
  String get msgEnterAValidEmail;

  /// No description provided for @msgPassword.
  ///
  /// In ru, this message translates to:
  /// **'Пароль'**
  String get msgPassword;

  /// No description provided for @msgShowOrHidePassword.
  ///
  /// In ru, this message translates to:
  /// **'Показать или скрыть пароль'**
  String get msgShowOrHidePassword;

  /// No description provided for @msgEnterYourPassword.
  ///
  /// In ru, this message translates to:
  /// **'Введите пароль'**
  String get msgEnterYourPassword;

  /// No description provided for @msgSignIn.
  ///
  /// In ru, this message translates to:
  /// **'Войти'**
  String get msgSignIn;

  /// No description provided for @msgNoAccountSignUp.
  ///
  /// In ru, this message translates to:
  /// **'Нет аккаунта? Зарегистрироваться'**
  String get msgNoAccountSignUp;

  /// No description provided for @msgEnterTheEmailAndPasswordForYourSeatMap.
  ///
  /// In ru, this message translates to:
  /// **'Введите email и пароль вашего аккаунта SeatMap.'**
  String get msgEnterTheEmailAndPasswordForYourSeatMap;

  /// No description provided for @msgTESTACCOUNT.
  ///
  /// In ru, this message translates to:
  /// **'ТЕСТОВЫЙ АККАУНТ'**
  String get msgTESTACCOUNT;

  /// No description provided for @msgMeetSeatMap.
  ///
  /// In ru, this message translates to:
  /// **'Познакомьтесь с SeatMap'**
  String get msgMeetSeatMap;

  /// No description provided for @msgDemoSignInWorksOnlyOnThisDevice.
  ///
  /// In ru, this message translates to:
  /// **'Вход работает локально. Регистрация и облачный профиль появятся позже.'**
  String get msgDemoSignInWorksOnlyOnThisDevice;

  /// No description provided for @msgEmailDemoSeatmapAppPasswordSeatMap.
  ///
  /// In ru, this message translates to:
  /// **'Email: demo@seatmap.app\nПароль: SeatMap2026!'**
  String get msgEmailDemoSeatmapAppPasswordSeatMap;

  /// No description provided for @msgSignInToTheTestAccount.
  ///
  /// In ru, this message translates to:
  /// **'Войти в тестовый аккаунт →'**
  String get msgSignInToTheTestAccount;

  /// No description provided for @msgYouCanBrowseRestaurantsAndTablesWithoutSigning.
  ///
  /// In ru, this message translates to:
  /// **'Выбирать рестораны и столики можно без входа.'**
  String get msgYouCanBrowseRestaurantsAndTablesWithoutSigning;

  /// No description provided for @msgSignOutOfYourAccount.
  ///
  /// In ru, this message translates to:
  /// **'Выйти из аккаунта?'**
  String get msgSignOutOfYourAccount;

  /// No description provided for @msgYourLocalBookingsWillRemainOnThisDevice.
  ///
  /// In ru, this message translates to:
  /// **'Ваши локальные брони останутся на этом устройстве.'**
  String get msgYourLocalBookingsWillRemainOnThisDevice;

  /// No description provided for @msgStay.
  ///
  /// In ru, this message translates to:
  /// **'Остаться'**
  String get msgStay;

  /// No description provided for @msgSignOut.
  ///
  /// In ru, this message translates to:
  /// **'Выйти'**
  String get msgSignOut;

  /// No description provided for @msgFavouritePlacesSpecialMomentsAllHere.
  ///
  /// In ru, this message translates to:
  /// **'Любимые места. Важные встречи. Всё здесь.'**
  String get msgFavouritePlacesSpecialMomentsAllHere;

  /// No description provided for @msgSeatMapGuest.
  ///
  /// In ru, this message translates to:
  /// **'Гость SeatMap'**
  String get msgSeatMapGuest;

  /// No description provided for @msgYourNextEveningStartsHere.
  ///
  /// In ru, this message translates to:
  /// **'Ваш следующий вечер — здесь'**
  String get msgYourNextEveningStartsHere;

  /// No description provided for @msgTESTPROFILE.
  ///
  /// In ru, this message translates to:
  /// **'ТЕСТОВЫЙ ПРОФИЛЬ'**
  String get msgTESTPROFILE;

  /// No description provided for @msgSEATMAPACCOUNT.
  ///
  /// In ru, this message translates to:
  /// **'АККАУНТ SEATMAP'**
  String get msgSEATMAPACCOUNT;

  /// No description provided for @msgDataIsSavedOnThisDevice.
  ///
  /// In ru, this message translates to:
  /// **'Данные сохранены на этом устройстве.'**
  String get msgDataIsSavedOnThisDevice;

  /// No description provided for @msgYourProfileIsSavedOnTheServerYour.
  ///
  /// In ru, this message translates to:
  /// **'Ваш профиль сохранён на сервере. Контакты готовы для бронирования.'**
  String get msgYourProfileIsSavedOnTheServerYour;

  /// No description provided for @msgSignInToSeatMap.
  ///
  /// In ru, this message translates to:
  /// **'Войти в SeatMap'**
  String get msgSignInToSeatMap;

  /// No description provided for @msgYourSeatMap.
  ///
  /// In ru, this message translates to:
  /// **'Ваш SeatMap'**
  String get msgYourSeatMap;

  /// No description provided for @msgFavouritePlaces111.
  ///
  /// In ru, this message translates to:
  /// **'Любимые места'**
  String get msgFavouritePlaces111;

  /// {p0} сохранено
  ///
  /// In ru, this message translates to:
  /// **'{p0} сохранено'**
  String msgPSaved(String p0);

  /// No description provided for @msgMyDetails.
  ///
  /// In ru, this message translates to:
  /// **'Мои данные'**
  String get msgMyDetails;

  /// No description provided for @msgPersonalDetailsContactsAndPreferences.
  ///
  /// In ru, this message translates to:
  /// **'Личные данные, контакты и предпочтения'**
  String get msgPersonalDetailsContactsAndPreferences;

  /// No description provided for @msgSecurity.
  ///
  /// In ru, this message translates to:
  /// **'Безопасность'**
  String get msgSecurity;

  /// No description provided for @msgPasswordAndAccountDeletion.
  ///
  /// In ru, this message translates to:
  /// **'Пароль и удаление аккаунта'**
  String get msgPasswordAndAccountDeletion;

  /// No description provided for @msgReminders.
  ///
  /// In ru, this message translates to:
  /// **'Напоминания'**
  String get msgReminders;

  /// No description provided for @msgDemoNoNotificationsSent.
  ///
  /// In ru, this message translates to:
  /// **'Демо · без отправки уведомлений'**
  String get msgDemoNoNotificationsSent;

  /// No description provided for @msgHereToHelp.
  ///
  /// In ru, this message translates to:
  /// **'Мы рядом'**
  String get msgHereToHelp;

  /// No description provided for @msgHelp.
  ///
  /// In ru, this message translates to:
  /// **'Помощь'**
  String get msgHelp;

  /// No description provided for @msgHowItWorks.
  ///
  /// In ru, this message translates to:
  /// **'Как это работает'**
  String get msgHowItWorks;

  /// No description provided for @msgFindARestaurantChooseADateAndTime.
  ///
  /// In ru, this message translates to:
  /// **'Найдите ресторан, выберите дату и время, затем свободный столик на схеме. Оставьте контакты — детали появятся в разделе «Брони».\n\nВ демо-режиме брони не отправляются в ресторан. При подключённом API запросы отправляются только после нажатия «Забронировать».'**
  String get msgFindARestaurantChooseADateAndTime;

  /// No description provided for @msgAboutSeatMap.
  ///
  /// In ru, this message translates to:
  /// **'О SeatMap'**
  String get msgAboutSeatMap;

  /// No description provided for @msgAGreatEveningStartsWithAPlace.
  ///
  /// In ru, this message translates to:
  /// **'Хороший вечер начинается с места'**
  String get msgAGreatEveningStartsWithAPlace;

  /// SeatMap помогает найти ресторан и выбрать конкретный столик до визита.
  ///
  /// Мобильный MVP · 1.0.0
  /// iOS и Android
  ///
  /// {p0}
  /// Регистрация и профиль подключены к серверу. Избранное и история броней сохраняются на устройстве.
  ///
  /// In ru, this message translates to:
  /// **'SeatMap помогает найти ресторан и выбрать конкретный столик до визита.\n\nМобильный MVP · 1.0.0\niOS и Android\n\n{p0}\nРегистрация и профиль подключены к серверу. Избранное и история броней сохраняются на устройстве.'**
  String msgSeatMapHelpsYouFindARestaurantAndChoose(String p0);

  /// No description provided for @msgDemoCatalogueAndBookings.
  ///
  /// In ru, this message translates to:
  /// **'Демо-каталог и бронирования.'**
  String get msgDemoCatalogueAndBookings;

  /// No description provided for @msgConnectedToTheRestaurantAPI.
  ///
  /// In ru, this message translates to:
  /// **'Подключён API ресторанов.'**
  String get msgConnectedToTheRestaurantAPI;

  /// No description provided for @msgSignOutOfAccount.
  ///
  /// In ru, this message translates to:
  /// **'Выйти из аккаунта'**
  String get msgSignOutOfAccount;

  /// No description provided for @msgSeatMapMoreThanATable.
  ///
  /// In ru, this message translates to:
  /// **'SeatMap · больше, чем просто столик'**
  String get msgSeatMapMoreThanATable;

  /// No description provided for @msgContactTheRestaurant.
  ///
  /// In ru, this message translates to:
  /// **'Свяжитесь с рестораном'**
  String get msgContactTheRestaurant;

  /// No description provided for @msgOnlineCancellationIsNotAvailableYetPleaseCall.
  ///
  /// In ru, this message translates to:
  /// **'Отмена онлайн ещё не подключена. Пожалуйста, позвоните в ресторан.\n\nВаша бронь остаётся действующей.'**
  String get msgOnlineCancellationIsNotAvailableYetPleaseCall;

  /// No description provided for @msgCancelThisBooking.
  ///
  /// In ru, this message translates to:
  /// **'Отменить бронирование?'**
  String get msgCancelThisBooking;

  /// {p0}
  /// {p1} · {p2}
  ///
  /// Это тестовая бронь.
  ///
  /// In ru, this message translates to:
  /// **'{p0}\n{p1} · {p2}\n\nЭто тестовая бронь.'**
  String msgPPPThisIsADemoBooking(String p0, String p1, String p2);

  /// No description provided for @msgKeepBooking.
  ///
  /// In ru, this message translates to:
  /// **'Оставить'**
  String get msgKeepBooking;

  /// No description provided for @msgCancelBooking.
  ///
  /// In ru, this message translates to:
  /// **'Отменить бронь'**
  String get msgCancelBooking;

  /// No description provided for @msgDemoBookingCancelled.
  ///
  /// In ru, this message translates to:
  /// **'Тестовая бронь отменена'**
  String get msgDemoBookingCancelled;

  /// No description provided for @msgMyBookings.
  ///
  /// In ru, this message translates to:
  /// **'Мои брони'**
  String get msgMyBookings;

  /// No description provided for @msgAllYourPlansForAGreatEvening.
  ///
  /// In ru, this message translates to:
  /// **'Все ваши планы на хороший вечер.'**
  String get msgAllYourPlansForAGreatEvening;

  /// No description provided for @msgUpcoming.
  ///
  /// In ru, this message translates to:
  /// **'Предстоящие'**
  String get msgUpcoming;

  /// No description provided for @msgHistory.
  ///
  /// In ru, this message translates to:
  /// **'История'**
  String get msgHistory;

  /// No description provided for @msgNoBookingHistoryYet.
  ///
  /// In ru, this message translates to:
  /// **'История пока пуста'**
  String get msgNoBookingHistoryYet;

  /// No description provided for @msgYourEveningIsStillOpen.
  ///
  /// In ru, this message translates to:
  /// **'Вечер ещё не запланирован'**
  String get msgYourEveningIsStillOpen;

  /// No description provided for @msgPastAndCancelledBookingsWillAppearHere.
  ///
  /// In ru, this message translates to:
  /// **'Здесь появятся прошедшие\nи отменённые бронирования.'**
  String get msgPastAndCancelledBookingsWillAppearHere;

  /// No description provided for @msgChooseARestaurantAndYourFavouriteTableWe.
  ///
  /// In ru, this message translates to:
  /// **'Выберите ресторан и любимый столик.\nМы сохраним все детали здесь.'**
  String get msgChooseARestaurantAndYourFavouriteTableWe;

  /// {p0} гостя · стол {p1}
  ///
  /// In ru, this message translates to:
  /// **'{p0} гостя · стол {p1}'**
  String msgPGuestsTableP(String p0, String p1);

  /// No description provided for @msgDEMO.
  ///
  /// In ru, this message translates to:
  /// **'ДЕМО'**
  String get msgDEMO;

  /// No description provided for @msgCancelled.
  ///
  /// In ru, this message translates to:
  /// **'Отменена'**
  String get msgCancelled;

  /// No description provided for @msgConfirmYourBookingByEmail.
  ///
  /// In ru, this message translates to:
  /// **'Подтвердите бронь по email'**
  String get msgConfirmYourBookingByEmail;

  /// No description provided for @msgConfirmed.
  ///
  /// In ru, this message translates to:
  /// **'Подтверждена'**
  String get msgConfirmed;

  /// No description provided for @msgCancel.
  ///
  /// In ru, this message translates to:
  /// **'Отменить'**
  String get msgCancel;

  /// No description provided for @msgContact.
  ///
  /// In ru, this message translates to:
  /// **'Связаться'**
  String get msgContact;

  /// No description provided for @msgBookingsAreStoredOnThisDeviceTestBookings.
  ///
  /// In ru, this message translates to:
  /// **'Список броней хранится на этом устройстве. Тестовые брони отмечены значком «Демо».'**
  String get msgBookingsAreStoredOnThisDeviceTestBookings;

  /// No description provided for @msgPleaseConsentToSharingYourDetailsWithThe.
  ///
  /// In ru, this message translates to:
  /// **'Подтвердите согласие на передачу данных ресторану.'**
  String get msgPleaseConsentToSharingYourDetailsWithThe;

  /// No description provided for @msgAlmostThere.
  ///
  /// In ru, this message translates to:
  /// **'Почти готово'**
  String get msgAlmostThere;

  /// No description provided for @msgLeaveYourContactDetailsYourTableAwaits.
  ///
  /// In ru, this message translates to:
  /// **'Оставьте контакты — и столик ваш.'**
  String get msgLeaveYourContactDetailsYourTableAwaits;

  /// {p0} гостя
  ///
  /// In ru, this message translates to:
  /// **'{p0} гостя'**
  String msgPGuests(String p0);

  /// Стол {p0}
  ///
  /// In ru, this message translates to:
  /// **'Стол {p0}'**
  String msgTableP(String p0);

  /// No description provided for @msgDemoModeThisBookingStaysOnYourDevice.
  ///
  /// In ru, this message translates to:
  /// **'Демо-режим. Бронь сохранится на устройстве и не будет отправлена ресторану.'**
  String get msgDemoModeThisBookingStaysOnYourDevice;

  /// No description provided for @msgYourContactDetails.
  ///
  /// In ru, this message translates to:
  /// **'Ваши контакты'**
  String get msgYourContactDetails;

  /// No description provided for @msgAlexanderIvanov.
  ///
  /// In ru, this message translates to:
  /// **'Александр Иванов'**
  String get msgAlexanderIvanov;

  /// No description provided for @msgFillWithTestDetails.
  ///
  /// In ru, this message translates to:
  /// **'Заполнить тестом'**
  String get msgFillWithTestDetails;

  /// No description provided for @msgYourName.
  ///
  /// In ru, this message translates to:
  /// **'Ваше имя'**
  String get msgYourName;

  /// No description provided for @msgEnterYourName.
  ///
  /// In ru, this message translates to:
  /// **'Введите имя'**
  String get msgEnterYourName;

  /// No description provided for @msgPhoneNumber.
  ///
  /// In ru, this message translates to:
  /// **'Телефон'**
  String get msgPhoneNumber;

  /// No description provided for @msgEnterAValidPhoneNumber.
  ///
  /// In ru, this message translates to:
  /// **'Введите корректный телефон'**
  String get msgEnterAValidPhoneNumber;

  /// No description provided for @msgRequestsOptional.
  ///
  /// In ru, this message translates to:
  /// **'Пожелания · необязательно'**
  String get msgRequestsOptional;

  /// No description provided for @msgSpecialOccasionHighChair.
  ///
  /// In ru, this message translates to:
  /// **'Особый повод, детский стульчик…'**
  String get msgSpecialOccasionHighChair;

  /// No description provided for @msgIAgreeToShareMyContactDetailsWith.
  ///
  /// In ru, this message translates to:
  /// **'Согласен передать контактные данные ресторану для оформления бронирования.'**
  String get msgIAgreeToShareMyContactDetailsWith;

  /// No description provided for @msgContactRestaurant.
  ///
  /// In ru, this message translates to:
  /// **'Связаться с рестораном'**
  String get msgContactRestaurant;

  /// No description provided for @msgCreateDemoBooking.
  ///
  /// In ru, this message translates to:
  /// **'Создать тестовую бронь'**
  String get msgCreateDemoBooking;

  /// No description provided for @msgBook.
  ///
  /// In ru, this message translates to:
  /// **'Забронировать'**
  String get msgBook;

  /// No description provided for @msgCheckYourBookingStatus.
  ///
  /// In ru, this message translates to:
  /// **'Уточните статус брони'**
  String get msgCheckYourBookingStatus;

  /// Свяжитесь с {p0}{p1}. Не отправляйте новый запрос, пока не узнаете, сохранена ли бронь.
  ///
  /// In ru, this message translates to:
  /// **'Свяжитесь с {p0}{p1}. Не отправляйте новый запрос, пока не узнаете, сохранена ли бронь.'**
  String msgContactPPDoNotSubmitAnotherRequest(String p0, String p1);

  /// No description provided for @msgOneStepLeft.
  ///
  /// In ru, this message translates to:
  /// **'Остался один шаг'**
  String get msgOneStepLeft;

  /// No description provided for @msgYourDemoTableIsBooked.
  ///
  /// In ru, this message translates to:
  /// **'Ваш тестовый\nстолик забронирован'**
  String get msgYourDemoTableIsBooked;

  /// No description provided for @msgYourTableIsBooked.
  ///
  /// In ru, this message translates to:
  /// **'Столик ваш!'**
  String get msgYourTableIsBooked;

  /// No description provided for @msgConfirmUsingTheLinkInYourEmailYour.
  ///
  /// In ru, this message translates to:
  /// **'Подтвердите бронь по ссылке в письме.\nДо подтверждения столик не закреплён.'**
  String get msgConfirmUsingTheLinkInYourEmailYour;

  /// No description provided for @msgAllTheDetailsAreSavedOnThisDevice.
  ///
  /// In ru, this message translates to:
  /// **'Все детали сохранены на этом устройстве.\nХороший вечер начинается здесь.'**
  String get msgAllTheDetailsAreSavedOnThisDevice;

  /// {p0} ждёт вас.
  /// Детали визита сохранены в приложении.
  ///
  /// In ru, this message translates to:
  /// **'{p0} ждёт вас.\nДетали визита сохранены в приложении.'**
  String msgPIsExpectingYouYourVisitDetailsAre(String p0);

  /// No description provided for @msgBookingReference.
  ///
  /// In ru, this message translates to:
  /// **'Номер бронирования'**
  String get msgBookingReference;

  /// No description provided for @msgCopyReference.
  ///
  /// In ru, this message translates to:
  /// **'Скопировать номер'**
  String get msgCopyReference;

  /// No description provided for @msgReferenceCopied.
  ///
  /// In ru, this message translates to:
  /// **'Номер скопирован'**
  String get msgReferenceCopied;

  /// No description provided for @msgThisIsADemoBookingNoRequestWas.
  ///
  /// In ru, this message translates to:
  /// **'Это демонстрационная бронь. Ресторан не получал запрос, реальный столик не зарезервирован.'**
  String get msgThisIsADemoBookingNoRequestWas;

  /// No description provided for @msgConfirmationOpensOnTheRestaurantWebsiteStatusUpdates.
  ///
  /// In ru, this message translates to:
  /// **'Подтверждение откроется на сайте ресторана. Обновление статуса в приложении пока не подключено.'**
  String get msgConfirmationOpensOnTheRestaurantWebsiteStatusUpdates;

  /// No description provided for @msgIfYourPlansChangePleaseContactTheRestaurant.
  ///
  /// In ru, this message translates to:
  /// **'Если планы изменятся, свяжитесь с рестораном заранее.'**
  String get msgIfYourPlansChangePleaseContactTheRestaurant;

  /// No description provided for @msgKeepExploring.
  ///
  /// In ru, this message translates to:
  /// **'Продолжить поиск'**
  String get msgKeepExploring;

  /// No description provided for @msgViewMyBookings.
  ///
  /// In ru, this message translates to:
  /// **'К моим броням'**
  String get msgViewMyBookings;

  /// No description provided for @msgPersonalDetails.
  ///
  /// In ru, this message translates to:
  /// **'Личные данные'**
  String get msgPersonalDetails;

  /// No description provided for @msgFirstName.
  ///
  /// In ru, this message translates to:
  /// **'Имя *'**
  String get msgFirstName;

  /// No description provided for @msgLastName.
  ///
  /// In ru, this message translates to:
  /// **'Фамилия *'**
  String get msgLastName;

  /// No description provided for @msgEnterYourLastName.
  ///
  /// In ru, this message translates to:
  /// **'Введите фамилию'**
  String get msgEnterYourLastName;

  /// No description provided for @msgPhoneNumber192.
  ///
  /// In ru, this message translates to:
  /// **'Телефон *'**
  String get msgPhoneNumber192;

  /// No description provided for @msgIncludeTheCountryCodeForExample.
  ///
  /// In ru, this message translates to:
  /// **'Укажите код страны, например +359888123456'**
  String get msgIncludeTheCountryCodeForExample;

  /// No description provided for @msgAboutYouOptional.
  ///
  /// In ru, this message translates to:
  /// **'О вас · необязательно'**
  String get msgAboutYouOptional;

  /// No description provided for @msgCity.
  ///
  /// In ru, this message translates to:
  /// **'Город'**
  String get msgCity;

  /// No description provided for @msgCountry.
  ///
  /// In ru, this message translates to:
  /// **'Страна'**
  String get msgCountry;

  /// No description provided for @msgDateOfBirth.
  ///
  /// In ru, this message translates to:
  /// **'Дата рождения'**
  String get msgDateOfBirth;

  /// No description provided for @msgCancel198.
  ///
  /// In ru, this message translates to:
  /// **'Отмена'**
  String get msgCancel198;

  /// No description provided for @msgRemoveDateOfBirth.
  ///
  /// In ru, this message translates to:
  /// **'Убрать дату рождения'**
  String get msgRemoveDateOfBirth;

  /// No description provided for @msgCommunicationLanguage.
  ///
  /// In ru, this message translates to:
  /// **'Язык общения'**
  String get msgCommunicationLanguage;

  /// No description provided for @msg.
  ///
  /// In ru, this message translates to:
  /// **'Русский'**
  String get msg;

  /// No description provided for @msg202.
  ///
  /// In ru, this message translates to:
  /// **'Български'**
  String get msg202;

  /// No description provided for @msgYourCommunicationLanguageIsSavedInYourProfile.
  ///
  /// In ru, this message translates to:
  /// **'Язык общения сохраняется в профиле. Интерфейс приложения пока на русском.'**
  String get msgYourCommunicationLanguageIsSavedInYourProfile;

  /// No description provided for @msgOffersAndNews.
  ///
  /// In ru, this message translates to:
  /// **'Предложения и новости'**
  String get msgOffersAndNews;

  /// No description provided for @msgOptionalYouCanTurnThisOffAtAny.
  ///
  /// In ru, this message translates to:
  /// **'Необязательно. Можно отключить в любой момент.'**
  String get msgOptionalYouCanTurnThisOffAtAny;

  /// No description provided for @msgCompleteYourProfile.
  ///
  /// In ru, this message translates to:
  /// **'Дополнить профиль'**
  String get msgCompleteYourProfile;

  /// No description provided for @msgCityBirthdayAndPreferencesOptional.
  ///
  /// In ru, this message translates to:
  /// **'Город, дата рождения и предпочтения · необязательно'**
  String get msgCityBirthdayAndPreferencesOptional;

  /// No description provided for @msgShowPassword.
  ///
  /// In ru, this message translates to:
  /// **'Показать пароль'**
  String get msgShowPassword;

  /// No description provided for @msgHidePassword.
  ///
  /// In ru, this message translates to:
  /// **'Скрыть пароль'**
  String get msgHidePassword;

  /// No description provided for @msgPasswordsDoNotMatch.
  ///
  /// In ru, this message translates to:
  /// **'Пароли не совпадают'**
  String get msgPasswordsDoNotMatch;

  /// No description provided for @msgUseAtLeastCharacters.
  ///
  /// In ru, this message translates to:
  /// **'Используйте не менее 12 символов'**
  String get msgUseAtLeastCharacters;

  /// No description provided for @msgDataProcessing.
  ///
  /// In ru, this message translates to:
  /// **'Обработка данных'**
  String get msgDataProcessing;

  /// No description provided for @msgYourNameEmailAndPhoneAreUsedFor.
  ///
  /// In ru, this message translates to:
  /// **'Имя, email и телефон нужны для аккаунта и заполнения бронирований. Город, страна и дата рождения необязательны. Пароль хранится только в виде защищённого хеша.\n\nСогласие на предложения отдельно и по умолчанию выключено. Данные профиля можно изменить, аккаунт — удалить в разделе безопасности. Удаление аккаунта не отменяет бронирования и не удаляет записи ресторанов.\n\nРедакция: seatmap-privacy-v1.'**
  String get msgYourNameEmailAndPhoneAreUsedFor;

  /// No description provided for @msgCreateAccount.
  ///
  /// In ru, this message translates to:
  /// **'Создать аккаунт'**
  String get msgCreateAccount;

  /// No description provided for @msgYourDetailsMakeBookingEasierFieldsMarkedWith.
  ///
  /// In ru, this message translates to:
  /// **'Ваши данные — для удобного бронирования. Поля со звёздочкой обязательны.'**
  String get msgYourDetailsMakeBookingEasierFieldsMarkedWith;

  /// No description provided for @msgPassword216.
  ///
  /// In ru, this message translates to:
  /// **'Пароль *'**
  String get msgPassword216;

  /// No description provided for @msgAtLeastCharactersUseALongUniquePassphrase.
  ///
  /// In ru, this message translates to:
  /// **'Не менее 12 символов. Лучше использовать длинную уникальную фразу.'**
  String get msgAtLeastCharactersUseALongUniquePassphrase;

  /// No description provided for @msgConfirmPassword.
  ///
  /// In ru, this message translates to:
  /// **'Повторите пароль *'**
  String get msgConfirmPassword;

  /// No description provided for @msgIConsentToProcessingMyAccountData.
  ///
  /// In ru, this message translates to:
  /// **'Согласен на обработку данных для аккаунта *'**
  String get msgIConsentToProcessingMyAccountData;

  /// No description provided for @msgPleaseConsentToProcessingYourData.
  ///
  /// In ru, this message translates to:
  /// **'Подтвердите согласие на обработку данных'**
  String get msgPleaseConsentToProcessingYourData;

  /// No description provided for @msgHowMyDataIsUsed.
  ///
  /// In ru, this message translates to:
  /// **'Как используются мои данные'**
  String get msgHowMyDataIsUsed;

  /// No description provided for @msgProfileSaved.
  ///
  /// In ru, this message translates to:
  /// **'Профиль сохранён'**
  String get msgProfileSaved;

  /// No description provided for @msgDemoProfileOnThisDevice.
  ///
  /// In ru, this message translates to:
  /// **'Демонстрационный профиль на этом устройстве.'**
  String get msgDemoProfileOnThisDevice;

  /// No description provided for @msgYourProfileIsSavedOnTheServerYour224.
  ///
  /// In ru, this message translates to:
  /// **'Профиль сохраняется на сервере. Имя и контакты подставляются при бронировании.'**
  String get msgYourProfileIsSavedOnTheServerYour224;

  /// No description provided for @msgConfirmEmailChange.
  ///
  /// In ru, this message translates to:
  /// **'Подтверждение смены email'**
  String get msgConfirmEmailChange;

  /// No description provided for @msgAfterSavingUseYourNewEmailToSign.
  ///
  /// In ru, this message translates to:
  /// **'После сохранения используйте новый email для входа.'**
  String get msgAfterSavingUseYourNewEmailToSign;

  /// No description provided for @msgCurrentPassword.
  ///
  /// In ru, this message translates to:
  /// **'Текущий пароль'**
  String get msgCurrentPassword;

  /// No description provided for @msgSaveChanges.
  ///
  /// In ru, this message translates to:
  /// **'Сохранить изменения'**
  String get msgSaveChanges;

  /// No description provided for @msgPasswordChangedSignInAgainOnAllYour.
  ///
  /// In ru, this message translates to:
  /// **'Пароль изменён. Войдите снова на всех устройствах.'**
  String get msgPasswordChangedSignInAgainOnAllYour;

  /// No description provided for @msgDeleteYourAccountPermanently.
  ///
  /// In ru, this message translates to:
  /// **'Удалить аккаунт навсегда?'**
  String get msgDeleteYourAccountPermanently;

  /// No description provided for @msgYourProfileAndSessionsWillBeDeletedRestaurant.
  ///
  /// In ru, this message translates to:
  /// **'Профиль и сессии будут удалены. Записи ресторанов сохранятся; существующие брони не отменяются. Восстановить аккаунт не получится.'**
  String get msgYourProfileAndSessionsWillBeDeletedRestaurant;

  /// No description provided for @msgKeepAccount.
  ///
  /// In ru, this message translates to:
  /// **'Оставить аккаунт'**
  String get msgKeepAccount;

  /// No description provided for @msgDeletePermanently.
  ///
  /// In ru, this message translates to:
  /// **'Удалить навсегда'**
  String get msgDeletePermanently;

  /// No description provided for @msgPasswordsAreNotStoredInTheAppChanging.
  ///
  /// In ru, this message translates to:
  /// **'Пароли не сохраняются в приложении. После смены пароля все активные сессии завершаются.'**
  String get msgPasswordsAreNotStoredInTheAppChanging;

  /// No description provided for @msgChangePassword.
  ///
  /// In ru, this message translates to:
  /// **'Изменить пароль'**
  String get msgChangePassword;

  /// No description provided for @msgNewPassword.
  ///
  /// In ru, this message translates to:
  /// **'Новый пароль'**
  String get msgNewPassword;

  /// No description provided for @msgConfirmNewPassword.
  ///
  /// In ru, this message translates to:
  /// **'Повторите новый пароль'**
  String get msgConfirmNewPassword;

  /// No description provided for @msgDeleteAccount.
  ///
  /// In ru, this message translates to:
  /// **'Удалить аккаунт'**
  String get msgDeleteAccount;

  /// No description provided for @msgThisDeletesYourGlobalSeatMapProfileContactEach.
  ///
  /// In ru, this message translates to:
  /// **'Удаляется глобальный профиль SeatMap. Брони необходимо отменить отдельно через ресторан.'**
  String get msgThisDeletesYourGlobalSeatMapProfileContactEach;

  /// No description provided for @msgPasswordToDeleteAccount.
  ///
  /// In ru, this message translates to:
  /// **'Пароль для удаления'**
  String get msgPasswordToDeleteAccount;

  /// No description provided for @msgDeleteMyAccount.
  ///
  /// In ru, this message translates to:
  /// **'Удалить мой аккаунт'**
  String get msgDeleteMyAccount;

  /// No description provided for @msgChooseYourTable.
  ///
  /// In ru, this message translates to:
  /// **'Выберите столик'**
  String get msgChooseYourTable;

  /// No description provided for @msgTable.
  ///
  /// In ru, this message translates to:
  /// **'Стол'**
  String get msgTable;

  /// No description provided for @msgTables.
  ///
  /// In ru, this message translates to:
  /// **'Столы'**
  String get msgTables;

  /// No description provided for @msgRefreshAvailability.
  ///
  /// In ru, this message translates to:
  /// **'Обновить доступность'**
  String get msgRefreshAvailability;

  /// No description provided for @msgTryAgain246.
  ///
  /// In ru, this message translates to:
  /// **'Попробовать снова'**
  String get msgTryAgain246;

  /// No description provided for @msgThisRoomIsNotSetUpYet.
  ///
  /// In ru, this message translates to:
  /// **'Зал пока не настроен'**
  String get msgThisRoomIsNotSetUpYet;

  /// No description provided for @msgChooseAnotherRoomOrContactTheRestaurant.
  ///
  /// In ru, this message translates to:
  /// **'Выберите другой зал или свяжитесь с рестораном.'**
  String get msgChooseAnotherRoomOrContactTheRestaurant;

  /// No description provided for @msgAvailable.
  ///
  /// In ru, this message translates to:
  /// **'Свободен'**
  String get msgAvailable;

  /// No description provided for @msgOccupied.
  ///
  /// In ru, this message translates to:
  /// **'Занят'**
  String get msgOccupied;

  /// No description provided for @msgSelected.
  ///
  /// In ru, this message translates to:
  /// **'Выбран'**
  String get msgSelected;

  /// Для {p0} гостей свяжитесь с рестораном.
  ///
  /// In ru, this message translates to:
  /// **'Для {p0} гостей свяжитесь с рестораном.'**
  String msgForPGuestsPleaseContactTheRestaurant(String p0);

  /// No description provided for @msgChooseALargerTableOrAnAllowedTable.
  ///
  /// In ru, this message translates to:
  /// **'Выберите столик вместительнее или разрешённое объединение.'**
  String get msgChooseALargerTableOrAnAllowedTable;

  /// No description provided for @msgTapAnAvailableTableOnTheMap.
  ///
  /// In ru, this message translates to:
  /// **'Нажмите на свободный стол на схеме'**
  String get msgTapAnAvailableTableOnTheMap;

  /// {p0} мест · {p1}
  ///
  /// In ru, this message translates to:
  /// **'{p0} мест · {p1}'**
  String msgPSeatsP(String p0, String p1);

  /// No description provided for @msgContinue.
  ///
  /// In ru, this message translates to:
  /// **'Продолжить'**
  String get msgContinue;

  /// No description provided for @msgFitEntireRoom.
  ///
  /// In ru, this message translates to:
  /// **'Показать весь зал'**
  String get msgFitEntireRoom;

  /// Стол {p0}, {p1} места, {p2}
  ///
  /// In ru, this message translates to:
  /// **'Стол {p0}, {p1} места, {p2}'**
  String msgTablePPSeatsP(String p0, String p1, String p2);

  /// No description provided for @msgOccupied259.
  ///
  /// In ru, this message translates to:
  /// **'занят'**
  String get msgOccupied259;

  /// No description provided for @msgSelected260.
  ///
  /// In ru, this message translates to:
  /// **'выбран'**
  String get msgSelected260;

  /// No description provided for @msgAvailable261.
  ///
  /// In ru, this message translates to:
  /// **'свободен'**
  String get msgAvailable261;

  /// Стол {p0} · {p1} места{p2}
  ///
  /// In ru, this message translates to:
  /// **'Стол {p0} · {p1} места{p2}'**
  String msgTablePPSeatsP262(String p0, String p1, String p2);

  /// No description provided for @msgOccupied263.
  ///
  /// In ru, this message translates to:
  /// **' · занят'**
  String get msgOccupied263;

  /// No description provided for @msgTERRACE.
  ///
  /// In ru, this message translates to:
  /// **'ТЕРРАСА'**
  String get msgTERRACE;

  /// No description provided for @msgWINDOWS.
  ///
  /// In ru, this message translates to:
  /// **'ОКНА'**
  String get msgWINDOWS;

  /// No description provided for @msgENTRANCE.
  ///
  /// In ru, this message translates to:
  /// **'ВХОД'**
  String get msgENTRANCE;

  /// No description provided for @msgBAR.
  ///
  /// In ru, this message translates to:
  /// **'БАР'**
  String get msgBAR;

  /// No description provided for @msgAvailableToday.
  ///
  /// In ru, this message translates to:
  /// **'Свободно сегодня'**
  String get msgAvailableToday;

  /// No description provided for @msgAvailableTomorrow.
  ///
  /// In ru, this message translates to:
  /// **'Свободно завтра'**
  String get msgAvailableTomorrow;

  /// No description provided for @msgAvailableTables.
  ///
  /// In ru, this message translates to:
  /// **'Свободные места'**
  String get msgAvailableTables;

  /// No description provided for @msgAlexander.
  ///
  /// In ru, this message translates to:
  /// **'Александр'**
  String get msgAlexander;

  /// No description provided for @msgIvanov.
  ///
  /// In ru, this message translates to:
  /// **'Иванов'**
  String get msgIvanov;

  /// No description provided for @msgCouldNotRestoreSavedDataYouCanContinue.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось восстановить сохранённые данные. Можно продолжить работу.'**
  String get msgCouldNotRestoreSavedDataYouCanContinue;

  /// No description provided for @msgRegistrationIsAvailableInLiveMode.
  ///
  /// In ru, this message translates to:
  /// **'Регистрация доступна при подключении к API.'**
  String get msgRegistrationIsAvailableInLiveMode;

  /// No description provided for @msgChooseATable275.
  ///
  /// In ru, this message translates to:
  /// **'Выберите столик.'**
  String get msgChooseATable275;

  /// No description provided for @msgOnlineCancellationIsNotAvailableYetContactThe.
  ///
  /// In ru, this message translates to:
  /// **'Отмена онлайн пока недоступна. Свяжитесь с рестораном: бронь не отменена.'**
  String get msgOnlineCancellationIsNotAvailableYetContactThe;

  /// No description provided for @msgEnterAValidAPIAddressWithoutCredentialsOr.
  ///
  /// In ru, this message translates to:
  /// **'Укажите корректный адрес API без паролей и параметров.'**
  String get msgEnterAValidAPIAddressWithoutCredentialsOr;

  /// No description provided for @msgCouldNotReachTheRestaurantCheckYourConnection.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось связаться с рестораном. Проверьте интернет и попробуйте ещё раз.'**
  String get msgCouldNotReachTheRestaurantCheckYourConnection;

  /// No description provided for @msgNoResponseReceivedYourBookingMayHaveBeen.
  ///
  /// In ru, this message translates to:
  /// **'Ответ не получен. Бронь могла сохраниться: уточните у ресторана перед повторной отправкой.'**
  String get msgNoResponseReceivedYourBookingMayHaveBeen;

  /// Ресторан вернул непонятный ответ. {p0}
  ///
  /// In ru, this message translates to:
  /// **'Ресторан вернул непонятный ответ. {p0}'**
  String msgTheRestaurantReturnedAnUnexpectedResponseP(String p0);

  /// No description provided for @msgPleaseTryLater.
  ///
  /// In ru, this message translates to:
  /// **'Попробуйте позже.'**
  String get msgPleaseTryLater;

  /// No description provided for @msgCheckWhetherYourBookingWasSavedBeforeTrying.
  ///
  /// In ru, this message translates to:
  /// **'Перед повтором уточните, сохранена ли бронь.'**
  String get msgCheckWhetherYourBookingWasSavedBeforeTrying;

  /// No description provided for @msgThisTableIsAlreadyTakenReturnToThe.
  ///
  /// In ru, this message translates to:
  /// **'Этот столик уже занят. Вернитесь к схеме и выберите другой.'**
  String get msgThisTableIsAlreadyTakenReturnToThe;

  /// No description provided for @msgTheBookingLimitHasBeenReachedPleaseTry.
  ///
  /// In ru, this message translates to:
  /// **'Достигнут лимит бронирований. Попробуйте позже.'**
  String get msgTheBookingLimitHasBeenReachedPleaseTry;

  /// No description provided for @msgTheRestaurantOrItsDetailsAreNotAvailable.
  ///
  /// In ru, this message translates to:
  /// **'Ресторан или его данные пока недоступны.'**
  String get msgTheRestaurantOrItsDetailsAreNotAvailable;

  /// Не удалось выполнить запрос ({p0}).
  ///
  /// In ru, this message translates to:
  /// **'Не удалось выполнить запрос ({p0}).'**
  String msgCouldNotCompleteTheRequestP(String p0);

  /// No description provided for @msgInvalidRestaurantData.
  ///
  /// In ru, this message translates to:
  /// **'Некорректные данные ресторана.'**
  String get msgInvalidRestaurantData;

  /// No description provided for @msgInvalidRestaurantCatalogue.
  ///
  /// In ru, this message translates to:
  /// **'Некорректный каталог ресторанов.'**
  String get msgInvalidRestaurantCatalogue;

  /// No description provided for @msgThisMapVersionIsNotSupportedYet.
  ///
  /// In ru, this message translates to:
  /// **'Эта версия карты пока не поддерживается.'**
  String get msgThisMapVersionIsNotSupportedYet;

  /// До {p0} гостей
  ///
  /// In ru, this message translates to:
  /// **'До {p0} гостей'**
  String msgUpToPGuests(String p0);

  /// No description provided for @msgInvalidRestaurantOpeningTimes.
  ///
  /// In ru, this message translates to:
  /// **'Некорректное время ресторана.'**
  String get msgInvalidRestaurantOpeningTimes;

  /// No description provided for @msgChooseAnAvailableTimeDuringTheRestaurantOpening.
  ///
  /// In ru, this message translates to:
  /// **'Выберите доступное время в часы работы ресторана.'**
  String get msgChooseAnAvailableTimeDuringTheRestaurantOpening;

  /// No description provided for @msgEnterYourNamePhoneAndEmail.
  ///
  /// In ru, this message translates to:
  /// **'Укажите имя, телефон и email.'**
  String get msgEnterYourNamePhoneAndEmail;

  /// No description provided for @msgChooseAnAvailableTableWithEnoughSeats.
  ///
  /// In ru, this message translates to:
  /// **'Выберите свободный столик подходящей вместимости.'**
  String get msgChooseAnAvailableTableWithEnoughSeats;

  /// No description provided for @msgCouldNotVerifyTheResultCheckWithThe.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось проверить результат. Уточните бронь у ресторана перед повтором.'**
  String get msgCouldNotVerifyTheResultCheckWithThe;

  /// No description provided for @msgShopskaSalad.
  ///
  /// In ru, this message translates to:
  /// **'Шопский салат'**
  String get msgShopskaSalad;

  /// No description provided for @msgTomatoesCucumberRoastedPepperWhiteCheese.
  ///
  /// In ru, this message translates to:
  /// **'Томаты, огурцы, печёный перец, брынза'**
  String get msgTomatoesCucumberRoastedPepperWhiteCheese;

  /// No description provided for @msgBurrataWithTomatoes.
  ///
  /// In ru, this message translates to:
  /// **'Буррата с томатами'**
  String get msgBurrataWithTomatoes;

  /// No description provided for @msgSeasonalTomatoesAndFreshBasil.
  ///
  /// In ru, this message translates to:
  /// **'Сезонные томаты и свежий базилик'**
  String get msgSeasonalTomatoesAndFreshBasil;

  /// No description provided for @msgBeefTartare.
  ///
  /// In ru, this message translates to:
  /// **'Тартар из говядины'**
  String get msgBeefTartare;

  /// No description provided for @msgCapersMustardCreamToast.
  ///
  /// In ru, this message translates to:
  /// **'Каперсы, горчичный крем, тосты'**
  String get msgCapersMustardCreamToast;

  /// No description provided for @msgDuckBreast.
  ///
  /// In ru, this message translates to:
  /// **'Утиная грудка'**
  String get msgDuckBreast;

  /// No description provided for @msgCeleriacSeasonalVegetablesSourCherrySauce.
  ///
  /// In ru, this message translates to:
  /// **'Сельдерей, сезонные овощи, вишнёвый соус'**
  String get msgCeleriacSeasonalVegetablesSourCherrySauce;

  /// No description provided for @msgMushroomRisotto.
  ///
  /// In ru, this message translates to:
  /// **'Ризотто с грибами'**
  String get msgMushroomRisotto;

  /// No description provided for @msgWildMushroomsArborioRiceParmesan.
  ///
  /// In ru, this message translates to:
  /// **'Лесные грибы, арборио, пармезан'**
  String get msgWildMushroomsArborioRiceParmesan;

  /// No description provided for @msgChocolateFondant.
  ///
  /// In ru, this message translates to:
  /// **'Шоколадный фондан'**
  String get msgChocolateFondant;

  /// No description provided for @msgWarmChocolateAndVanillaIceCream.
  ///
  /// In ru, this message translates to:
  /// **'Тёплый шоколад и ванильное мороженое'**
  String get msgWarmChocolateAndVanillaIceCream;

  /// No description provided for @msgPleaseSignIn.
  ///
  /// In ru, this message translates to:
  /// **'Войдите в аккаунт.'**
  String get msgPleaseSignIn;

  /// No description provided for @msgCouldNotReachTheServerCheckYourConnection.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.'**
  String get msgCouldNotReachTheServerCheckYourConnection;

  /// No description provided for @msgCheckTheDetailsYouEntered.
  ///
  /// In ru, this message translates to:
  /// **'Проверьте введённые данные.'**
  String get msgCheckTheDetailsYouEntered;

  /// No description provided for @msgYourSessionHasExpiredPleaseSignInAgain.
  ///
  /// In ru, this message translates to:
  /// **'Сессия истекла. Войдите ещё раз.'**
  String get msgYourSessionHasExpiredPleaseSignInAgain;

  /// No description provided for @msgRegistrationAndProfilesAreNotAvailableOnThis.
  ///
  /// In ru, this message translates to:
  /// **'Регистрация и профиль ещё не доступны на этом сервере.'**
  String get msgRegistrationAndProfilesAreNotAvailableOnThis;

  /// No description provided for @msgThisEmailCannotBeUsedTrySigningIn.
  ///
  /// In ru, this message translates to:
  /// **'Этот email нельзя использовать. Попробуйте войти.'**
  String get msgThisEmailCannotBeUsedTrySigningIn;

  /// No description provided for @msgTooManyAttemptsPleaseTryAgainInMinutes.
  ///
  /// In ru, this message translates to:
  /// **'Слишком много попыток. Попробуйте через 5 минут.'**
  String get msgTooManyAttemptsPleaseTryAgainInMinutes;

  /// No description provided for @msgTheServerIsTemporarilyUnavailablePleaseTryLater.
  ///
  /// In ru, this message translates to:
  /// **'Сервер временно недоступен. Попробуйте позже.'**
  String get msgTheServerIsTemporarilyUnavailablePleaseTryLater;

  /// No description provided for @msgTheServerReturnedIncompleteAccountDetails.
  ///
  /// In ru, this message translates to:
  /// **'Сервер вернул неполные данные аккаунта.'**
  String get msgTheServerReturnedIncompleteAccountDetails;

  /// No description provided for @msgMainRoom.
  ///
  /// In ru, this message translates to:
  /// **'Основной зал'**
  String get msgMainRoom;

  /// No description provided for @msgTerrace.
  ///
  /// In ru, this message translates to:
  /// **'Терраса'**
  String get msgTerrace;

  /// No description provided for @msgMainRoomSeatsTwo.
  ///
  /// In ru, this message translates to:
  /// **'В основном зале · на двоих'**
  String get msgMainRoomSeatsTwo;

  /// No description provided for @msgByTheWindowSeatsTwo.
  ///
  /// In ru, this message translates to:
  /// **'У окна · на двоих'**
  String get msgByTheWindowSeatsTwo;

  /// No description provided for @msgByTheWindowUpToFourGuests.
  ///
  /// In ru, this message translates to:
  /// **'У окна · до четырёх гостей'**
  String get msgByTheWindowUpToFourGuests;

  /// No description provided for @msgQuietCornerUpToFourGuests.
  ///
  /// In ru, this message translates to:
  /// **'Тихий уголок · до четырёх гостей'**
  String get msgQuietCornerUpToFourGuests;

  /// No description provided for @msgTerraceSeatsFour.
  ///
  /// In ru, this message translates to:
  /// **'На террасе · на четверых'**
  String get msgTerraceSeatsFour;

  /// No description provided for @msgTerraceSeatsTwo.
  ///
  /// In ru, this message translates to:
  /// **'На террасе · на двоих'**
  String get msgTerraceSeatsTwo;

  /// No description provided for @msgModernBulgarian.
  ///
  /// In ru, this message translates to:
  /// **'Современная болгарская'**
  String get msgModernBulgarian;

  /// No description provided for @msgLaveleStSofiaCentre.
  ///
  /// In ru, this message translates to:
  /// **'ул. Лавеле, 19 · Центр Софии'**
  String get msgLaveleStSofiaCentre;

  /// No description provided for @msgWindowTableAvailable.
  ///
  /// In ru, this message translates to:
  /// **'Свободен стол у окна'**
  String get msgWindowTableAvailable;

  /// No description provided for @msgAModernTakeOnBulgarianCuisineChooseA.
  ///
  /// In ru, this message translates to:
  /// **'Болгарская кухня в современной подаче. Для камерного ужина подойдут столики у окна.'**
  String get msgAModernTakeOnBulgarianCuisineChooseA;

  /// No description provided for @msgM.
  ///
  /// In ru, this message translates to:
  /// **'850 м'**
  String get msgM;

  /// No description provided for @msgYuriVenelinStSofia.
  ///
  /// In ru, this message translates to:
  /// **'ул. Юрий Венелин, 6 · София'**
  String get msgYuriVenelinStSofia;

  /// No description provided for @msgACosyHomeWithCreativeEuropeanCuisineAnd.
  ///
  /// In ru, this message translates to:
  /// **'Уютный дом с авторской европейской кухней и зелёным двориком.'**
  String get msgACosyHomeWithCreativeEuropeanCuisineAnd;

  /// No description provided for @msgItalianCuisineHomemadePastaAndWarmGatheringsAround.
  ///
  /// In ru, this message translates to:
  /// **'Итальянская кухня, домашняя паста и тёплые встречи за общим столом.'**
  String get msgItalianCuisineHomemadePastaAndWarmGatheringsAround;

  /// No description provided for @msgCafAndBistro.
  ///
  /// In ru, this message translates to:
  /// **'Кафе и бистро'**
  String get msgCafAndBistro;

  /// No description provided for @msgSofiaCentre.
  ///
  /// In ru, this message translates to:
  /// **'София · Центр'**
  String get msgSofiaCentre;

  /// No description provided for @msgSpecialtyCoffeeSeasonalDishesAndRelaxedEvenings.
  ///
  /// In ru, this message translates to:
  /// **'Спешелти кофе, сезонные блюда и неспешные вечера.'**
  String get msgSpecialtyCoffeeSeasonalDishesAndRelaxedEvenings;

  /// No description provided for @appLanguage.
  ///
  /// In ru, this message translates to:
  /// **'Язык приложения'**
  String get appLanguage;

  /// No description provided for @automaticLanguage.
  ///
  /// In ru, this message translates to:
  /// **'Автоматически'**
  String get automaticLanguage;

  /// No description provided for @languageSelectionHint.
  ///
  /// In ru, this message translates to:
  /// **'В Болгарии по умолчанию используется болгарский. Ручной выбор сохраняется.'**
  String get languageSelectionHint;

  /// No description provided for @restaurantLabel.
  ///
  /// In ru, this message translates to:
  /// **'Ресторан'**
  String get restaurantLabel;

  /// No description provided for @currentPasswordRequired.
  ///
  /// In ru, this message translates to:
  /// **'Введите верный текущий пароль.'**
  String get currentPasswordRequired;

  /// No description provided for @emailInUse.
  ///
  /// In ru, this message translates to:
  /// **'Этот email уже используется. Попробуйте войти.'**
  String get emailInUse;

  /// No description provided for @invalidCredentials.
  ///
  /// In ru, this message translates to:
  /// **'Неверный email или пароль. После нескольких попыток попробуйте через 15 минут.'**
  String get invalidCredentials;

  /// No description provided for @guestCount.
  ///
  /// In ru, this message translates to:
  /// **'{count, plural, one{{count} гость} few{{count} гостя} many{{count} гостей} other{{count} гостя}}'**
  String guestCount(int count);

  /// No description provided for @restaurantCount.
  ///
  /// In ru, this message translates to:
  /// **'{count, plural, one{{count} ресторан} few{{count} ресторана} many{{count} ресторанов} other{{count} ресторана}}'**
  String restaurantCount(int count);

  /// No description provided for @centreLabel.
  ///
  /// In ru, this message translates to:
  /// **'Центр'**
  String get centreLabel;

  /// No description provided for @cancellationContactRequired.
  ///
  /// In ru, this message translates to:
  /// **'Самостоятельная отмена недоступна. Свяжитесь с рестораном.'**
  String get cancellationContactRequired;

  /// No description provided for @bookingAccessUnavailable.
  ///
  /// In ru, this message translates to:
  /// **'Нет ключа управления этой бронью. Свяжитесь с рестораном.'**
  String get bookingAccessUnavailable;

  /// No description provided for @bookingUpdateFailed.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось обновить бронь. Проверьте соединение и повторите.'**
  String get bookingUpdateFailed;

  /// No description provided for @bookingAccessSaveFailed.
  ///
  /// In ru, this message translates to:
  /// **'Бронь создана, но не удалось сохранить ключ отмены на устройстве. Не удаляйте приложение; при необходимости свяжитесь с рестораном.'**
  String get bookingAccessSaveFailed;

  /// No description provided for @bookingCancelled.
  ///
  /// In ru, this message translates to:
  /// **'Бронь отменена'**
  String get bookingCancelled;

  /// No description provided for @cancelBookingConfirmation.
  ///
  /// In ru, this message translates to:
  /// **'Отменить бронь в {restaurant} на {date}, {time}?'**
  String cancelBookingConfirmation(String restaurant, String date, String time);

  /// No description provided for @cancellationRuleHours.
  ///
  /// In ru, this message translates to:
  /// **'Отмена в приложении доступна не позднее чем за {hours} ч до начала. Позже — только через ресторан.'**
  String cancellationRuleHours(String hours);

  /// No description provided for @cancellationDeadlineLabel.
  ///
  /// In ru, this message translates to:
  /// **'Отменить до {deadline} · время ресторана'**
  String cancellationDeadlineLabel(String deadline);

  /// No description provided for @callRestaurant.
  ///
  /// In ru, this message translates to:
  /// **'Позвонить в ресторан'**
  String get callRestaurant;

  /// No description provided for @phoneUnavailable.
  ///
  /// In ru, this message translates to:
  /// **'Телефон пока не указан рестораном.'**
  String get phoneUnavailable;

  /// No description provided for @couldNotOpenDialer.
  ///
  /// In ru, this message translates to:
  /// **'Не удалось открыть телефон. Номер можно скопировать.'**
  String get couldNotOpenDialer;

  /// No description provided for @copyPhone.
  ///
  /// In ru, this message translates to:
  /// **'Скопировать номер'**
  String get copyPhone;

  /// No description provided for @phoneCopied.
  ///
  /// In ru, this message translates to:
  /// **'Номер скопирован'**
  String get phoneCopied;

  /// No description provided for @cancellingBooking.
  ///
  /// In ru, this message translates to:
  /// **'Отменяем…'**
  String get cancellingBooking;

  /// No description provided for @refreshBookings.
  ///
  /// In ru, this message translates to:
  /// **'Обновить брони'**
  String get refreshBookings;

  /// No description provided for @bookingCompleted.
  ///
  /// In ru, this message translates to:
  /// **'Завершена'**
  String get bookingCompleted;

  /// No description provided for @mapWindow.
  ///
  /// In ru, this message translates to:
  /// **'Окно'**
  String get mapWindow;

  /// No description provided for @mapEntrance.
  ///
  /// In ru, this message translates to:
  /// **'Вход'**
  String get mapEntrance;

  /// No description provided for @mapTerraceEntrance.
  ///
  /// In ru, this message translates to:
  /// **'На террасу'**
  String get mapTerraceEntrance;

  /// No description provided for @mapRestaurantEntrance.
  ///
  /// In ru, this message translates to:
  /// **'В ресторан'**
  String get mapRestaurantEntrance;

  /// No description provided for @mapTv.
  ///
  /// In ru, this message translates to:
  /// **'Телевизор'**
  String get mapTv;

  /// No description provided for @mapWall.
  ///
  /// In ru, this message translates to:
  /// **'Перегородка'**
  String get mapWall;

  /// No description provided for @mapBar.
  ///
  /// In ru, this message translates to:
  /// **'Бар'**
  String get mapBar;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['bg', 'en', 'ru'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'bg':
      return AppLocalizationsBg();
    case 'en':
      return AppLocalizationsEn();
    case 'ru':
      return AppLocalizationsRu();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
