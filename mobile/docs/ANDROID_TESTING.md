# Проверка SeatMap на Android через USB

Требуется телефон с Android 7.0 или новее (API 24), кабель с передачей данных и интернет на телефоне. Приложение работает с production API: отправленная бронь создаёт настоящую резервацию.

19 ноября 2026 ARM64 release-сборка установлена и запущена по USB на Samsung `SM-S948B`: Android 16, архитектура `arm64-v8a`. Проверена загрузка Casa di Fratelli и Cofein из production API. Реальные бронирования при проверке не создавались.

## Подготовка телефона

1. Подключите разблокированный телефон к Mac. При необходимости выберите USB-режим «Передача файлов».
2. На Samsung откройте **Настройки → Сведения о телефоне → Сведения о ПО** и нажмите «Номер сборки» семь раз. Затем в **Параметрах разработчика** включите **Отладку по USB**.
3. Если Samsung блокирует отладку или установку, временно выключите **Настройки → Безопасность и конфиденциальность → Автоблокировка (Auto Blocker)**. Эта функция может блокировать USB-команды и установку приложений вне магазина; после проверки включите её снова. Названия пунктов зависят от версии One UI. [Инструкция Samsung](https://www.samsung.com/us/support/answer/ANS10003636/).
4. На телефоне подтвердите запрос «Разрешить отладку по USB?» для этого Mac. [Подключение физического устройства: Android Developers](https://developer.android.com/studio/run/device).

## Инструменты на этом Mac

Flutter: `/Users/macbookpro/develop/flutter`. Android SDK: `/Users/macbookpro/Library/Android/sdk`. Для сборки используется полный Temurin JDK 21.0.13+9: `/Users/macbookpro/develop/jdks/temurin-21/Contents/Home`. Нужны инструменты `java`, `javac` и `jlink`; встроенный runtime Rider не подходит, поскольку в нём отсутствует `jlink`.

После установки Android SDK настройте пути:

```sh
cd /Users/macbookpro/casa-di-fratelli/mobile
export ANDROID_HOME=/Users/macbookpro/Library/Android/sdk
export JAVA_HOME=/Users/macbookpro/develop/jdks/temurin-21/Contents/Home
export PATH="$ANDROID_HOME/platform-tools:/Users/macbookpro/develop/flutter/bin:$JAVA_HOME/bin:$PATH"
java -version
javac -version
jlink --version
flutter config --android-sdk "$ANDROID_HOME" --jdk-dir "$JAVA_HOME"
flutter doctor -v
adb devices -l
```

Для текущего окружения используются Android SDK Platform 36, SDK Platform Tools, Build Tools `36.0.0` и NDK `28.2.13676358`. Плагинам также потребовались Platform 35 и CMake `3.22.1`, которые сборщик установил автоматически. Gradle и зависимости загружаются при первой сборке. Для SDK, NDK и сборки необходимо свободное место на Mac.

В `adb devices -l` напротив телефона должно быть **device**. При **unauthorized** подтвердите запрос на экране телефона. Если список пуст, проверьте кабель, USB-режим и отладку. Далее замените `SERIAL` на идентификатор из списка; `-s` выбирает конкретный телефон, если подключено несколько устройств.

## Сборка, установка и запуск

Проверьте архитектуру телефона:

```sh
adb -s SERIAL shell getprop ro.product.cpu.abilist
```

Если в результате есть **arm64-v8a**, можно собрать компактный APK для этого телефона:

```sh
flutter pub get
flutter build apk --release --target-platform android-arm64 \
  --dart-define=SEATMAP_API_BASE_URL=https://casa-di-fratelli-api.onrender.com
adb -s SERIAL install -r build/app/outputs/flutter-apk/app-release.apk
adb -s SERIAL shell am start -W \
  -n com.seatmap.seatmap_mobile/.MainActivity
```

Если архитектура другая или нужен APK для нескольких типов устройств, уберите `--target-platform android-arm64` из команды сборки. Установка `-r` обновляет приложение с той же подписью, сохраняя его данные.

Альтернатива — собрать, установить и запустить одной командой:

```sh
flutter run --release -d SERIAL \
  --dart-define=SEATMAP_API_BASE_URL=https://casa-di-fratelli-api.onrender.com
```

Текущая release-сборка подписывается локальным debug-ключом: этого достаточно для установки через кабель. Для публикации в Google Play потребуется отдельная настройка подписи. После установки приложение открывается с иконки **SeatMap**, работает без кабеля и обращается к API напрямую.

## Проверка на телефоне

- Каталог Casa di Fratelli и Cofein, поиск, фотографии и меню.
- Выбор даты, времени, гостей и столика; карта Cofein, масштабирование и переключение частей зала.
- Регистрация, подтверждение email, вход, восстановление пароля и профиль.
- Переключение болгарского, английского и русского; сохранение сессии после перезапуска.
- После завершения отключите USB-отладку, если она больше не нужна, и снова включите Samsung Auto Blocker.
