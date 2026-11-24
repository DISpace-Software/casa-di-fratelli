import 'waitlist_screen.dart';

import 'dart:async';

import 'package:intl/intl.dart';
import 'package:timezone/timezone.dart' as tz;

import '../restaurant_contact.dart';
import '../../l10n/language.dart';
import 'account_screens.dart';
import 'menu_screen.dart';

import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';

import '../../domain/models.dart';
import '../../state/app_controller.dart';
import '../../data/seatmap_repository.dart';
import '../../data/guest_account_repository.dart';
import '../components.dart';
import '../theme.dart';

final _demoEmail = 'demo@seatmap.app';
final _demoPassword = 'SeatMap2026!';
String _date(DateTime date) {
  final months = [
    appStrings.msgJanuary,
    appStrings.msgFebruary,
    appStrings.msgMarch,
    appStrings.msgApril,
    appStrings.msgMay,
    appStrings.msgJune,
    appStrings.msgJuly,
    appStrings.msgAugust,
    appStrings.msgSeptember,
    appStrings.msgOctober,
    appStrings.msgNovember,
    appStrings.msgDecember,
  ];
  return '${date.day} ${months[date.month - 1]}';
}

String _error(Object error) =>
    error.toString().replaceFirst(RegExp(r'^(Exception|StateError):\s*'), '');
void _snack(BuildContext context, String text) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

class DemoNotice extends StatelessWidget {
  const DemoNotice(this.message, {super.key, this.error = false});
  final String message;
  final bool error;
  @override
  Widget build(BuildContext context) => Container(
    padding: EdgeInsets.all(15),
    decoration: BoxDecoration(
      color: (error ? SeatMapColors.peach : SeatMapColors.lavender).withValues(
        alpha: .08,
      ),
      borderRadius: BorderRadius.circular(15),
      border: Border.all(
        color: (error ? SeatMapColors.peach : SeatMapColors.lavender)
            .withValues(alpha: .25),
      ),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          error ? Icons.error_outline_rounded : Icons.info_outline_rounded,
          color: error ? SeatMapColors.peach : SeatMapColors.lavender,
          size: 18,
        ),
        SizedBox(width: 10),
        Expanded(
          child: Text(
            message,
            style: TextStyle(
              color: error ? SeatMapColors.peach : SeatMapColors.muted,
              fontSize: 12,
              height: 1.5,
            ),
          ),
        ),
      ],
    ),
  );
}

class _Badge extends StatelessWidget {
  const _Badge(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Container(
    padding: EdgeInsets.symmetric(horizontal: 9, vertical: 5),
    decoration: BoxDecoration(
      color: SeatMapColors.lavenderSoft,
      borderRadius: BorderRadius.circular(7),
    ),
    child: Text(
      text,
      style: TextStyle(
        color: SeatMapColors.lavender,
        fontSize: 9,
        fontWeight: FontWeight.w700,
        letterSpacing: .5,
      ),
    ),
  );
}

class _Panel extends StatelessWidget {
  const _Panel({required this.child, this.padding = 20});
  final Widget child;
  final double padding;
  @override
  Widget build(BuildContext context) => Material(
    color: SeatMapColors.surface,
    borderRadius: BorderRadius.circular(20),
    clipBehavior: Clip.antiAlias,
    child: SizedBox(
      width: double.infinity,
      child: Padding(padding: EdgeInsets.all(padding), child: child),
    ),
  );
}

class _Back extends StatelessWidget {
  const _Back();
  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.centerLeft,
    child: IconButton.outlined(
      tooltip: context.l10n.msgBack,
      onPressed: () => Navigator.pop(context),
      icon: Icon(Icons.chevron_left_rounded),
      style: IconButton.styleFrom(
        side: BorderSide(color: SeatMapColors.line),
        fixedSize: Size(40, 40),
      ),
    ),
  );
}

class _BottomAction extends StatelessWidget {
  const _BottomAction({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Container(
    padding: EdgeInsets.fromLTRB(24, 16, 24, bottomInset(context) + 10),
    decoration: BoxDecoration(
      color: SeatMapColors.surface,
      border: Border(top: BorderSide(color: SeatMapColors.line)),
    ),
    child: child,
  );
}

Future<void> _info(BuildContext context, String title, String text) =>
    showSeatMapSheet<void>(
      context,
      title: title,
      child: Column(
        children: [
          Text(
            text,
            style: TextStyle(
              fontSize: 14,
              height: 1.6,
              color: SeatMapColors.muted,
            ),
          ),
          SizedBox(height: 24),
          PrimaryButton(
            label: context.l10n.msgGotIt,
            icon: null,
            onPressed: () => Navigator.pop(context),
          ),
        ],
      ),
    );

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.controller});
  final AppController controller;
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final form = GlobalKey<FormState>();
  final email = TextEditingController(), password = TextEditingController();
  bool busy = false, obscure = true;
  String? error;
  @override
  void dispose() {
    email.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> _login({bool demo = false}) async {
    if (busy) return;
    if (demo) {
      email.text = _demoEmail;
      password.text = _demoPassword;
    }
    if (!form.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final success = await widget.controller.login(
        email.text.trim(),
        password.text,
      );
      if (!mounted) return;
      if (success) {
        Navigator.pop(context, true);
      } else {
        setState(() => error = context.l10n.msgIncorrectEmailOrPassword);
      }
    } catch (exception) {
      if (!mounted) return;
      if (exception is GuestAccountException &&
          exception.code == 'EMAIL_NOT_VERIFIED') {
        final verified = await Navigator.push<bool>(
          context,
          MaterialPageRoute(
            builder: (_) => EmailCodeScreen(
              controller: widget.controller,
              email: email.text.trim(),
            ),
          ),
        );
        if (mounted && verified == true) Navigator.pop(context, true);
      } else {
        setState(() => error = _error(exception));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Padding(
      padding: EdgeInsets.only(top: topInset(context)),
      child: ListView(
        padding: EdgeInsets.fromLTRB(24, 12, 24, 35),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        children: [
          _Back(),
          SizedBox(height: 29),
          Align(
            alignment: Alignment.centerLeft,
            child: const SeatMapMark(width: 96),
          ),
          SizedBox(height: 23),
          Text(
            context.l10n.msgYourTableIsWaiting,
            style: TextStyle(
              fontSize: 35,
              height: 1.12,
              fontWeight: FontWeight.w700,
              letterSpacing: -1,
            ),
          ),
          SizedBox(height: 13),
          Text(
            context.l10n.msgFavouritePlacesAndEveningPlansAllInOne,
            style: TextStyle(
              color: SeatMapColors.muted,
              fontSize: 14,
              height: 1.6,
            ),
          ),
          SizedBox(height: 27),
          Form(
            key: form,
            child: AutofillGroup(
              child: Column(
                children: [
                  TextFormField(
                    controller: email,
                    enabled: !busy,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: [AutofillHints.username],
                    textInputAction: TextInputAction.next,
                    decoration: InputDecoration(
                      labelText: 'Email',
                      prefixIcon: Icon(Icons.alternate_email_rounded, size: 20),
                    ),
                    validator: (value) =>
                        value == null ||
                            !RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
                                .hasMatch(value.trim())
                        ? context.l10n.msgEnterAValidEmail
                        : null,
                  ),
                  SizedBox(height: 14),
                  TextFormField(
                    controller: password,
                    enabled: !busy,
                    obscureText: obscure,
                    autofillHints: [AutofillHints.password],
                    onFieldSubmitted: (_) => _login(),
                    decoration: InputDecoration(
                      labelText: context.l10n.msgPassword,
                      prefixIcon: Icon(Icons.lock_outline_rounded, size: 20),
                      suffixIcon: IconButton(
                        tooltip: context.l10n.msgShowOrHidePassword,
                        onPressed: () => setState(() => obscure = !obscure),
                        icon: Icon(
                          obscure
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                          size: 19,
                        ),
                      ),
                    ),
                    validator: (value) => value == null || value.isEmpty
                        ? context.l10n.msgEnterYourPassword
                        : null,
                  ),
                ],
              ),
            ),
          ),
          if (error != null) ...[
            SizedBox(height: 15),
            DemoNotice(error!, error: true),
          ],
          SizedBox(height: 23),
          PrimaryButton(
            label: context.l10n.msgSignIn,
            loading: busy,
            onPressed: _login,
          ),
          SizedBox(height: 24),
          if (!widget.controller.demoMode) ...[
            TextButton(
              onPressed: busy
                  ? null
                  : () => Navigator.push<bool>(
                      context,
                      MaterialPageRoute(
                        builder: (_) => EmailCodeScreen(
                          controller: widget.controller,
                          email: email.text.trim(),
                          reset: true,
                        ),
                      ),
                    ),
              child: Text(context.l10n.forgotPassword),
            ),
            TextButton(
              onPressed: busy
                  ? null
                  : () async {
                      final created = await Navigator.push<bool>(
                        context,
                        MaterialPageRoute(
                          builder: (_) =>
                              RegisterScreen(controller: widget.controller),
                        ),
                      );
                      if (created == true && context.mounted) {
                        Navigator.pop(context, true);
                      }
                    },
              child: Text(context.l10n.msgNoAccountSignUp),
            ),
            SizedBox(height: 12),
            Text(
              context.l10n.msgEnterTheEmailAndPasswordForYourSeatMap,
              style: TextStyle(color: SeatMapColors.muted, fontSize: 12),
              textAlign: TextAlign.center,
            ),
          ],
          if (widget.controller.demoMode)
            _Panel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _Badge(context.l10n.msgTESTACCOUNT),
                  SizedBox(height: 14),
                  Text(
                    context.l10n.msgMeetSeatMap,
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                  ),
                  SizedBox(height: 8),
                  Text(
                    context.l10n.msgDemoSignInWorksOnlyOnThisDevice,
                    style: TextStyle(
                      color: SeatMapColors.muted,
                      fontSize: 12,
                      height: 1.5,
                    ),
                  ),
                  SizedBox(height: 15),
                  SelectableText(
                    context.l10n.msgEmailDemoSeatmapAppPasswordSeatMap,
                    style: TextStyle(
                      color: SeatMapColors.lavender,
                      fontSize: 12,
                      height: 1.8,
                    ),
                  ),
                  SizedBox(height: 8),
                  TextButton(
                    onPressed: busy ? null : () => _login(demo: true),
                    style: TextButton.styleFrom(padding: EdgeInsets.zero),
                    child: Text(
                      context.l10n.msgSignInToTheTestAccount,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          SizedBox(height: 20),
          Text(
            context.l10n.msgYouCanBrowseRestaurantsAndTablesWithoutSigning,
            textAlign: TextAlign.center,
            style: TextStyle(color: SeatMapColors.muted, fontSize: 11),
          ),
        ],
      ),
    ),
  );
}

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, required this.controller, this.onFavorites});
  final AppController controller;
  final VoidCallback? onFavorites;
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  Future<void> _chooseLanguage() async {
    await showSeatMapSheet<void>(
      context,
      title: context.l10n.appLanguage,
      child: Column(
        children: [
          Text(
            context.l10n.languageSelectionHint,
            style: const TextStyle(color: SeatMapColors.muted, height: 1.5),
          ),
          const SizedBox(height: 16),
          for (final item in <String?, String>{
            null: context.l10n.automaticLanguage,
            'bg': 'Български',
            'en': 'English',
            'ru': 'Русский',
          }.entries)
            ListTile(
              title: Text(item.value),
              trailing: widget.controller.languageOverride == item.key
                  ? const Icon(
                      Icons.check_rounded,
                      color: SeatMapColors.lavender,
                    )
                  : null,
              onTap: () async {
                Navigator.pop(context);
                await widget.controller.setAppLanguage(item.key);
              },
            ),
        ],
      ),
    );
  }

  Future<void> _editProfile() => Navigator.push<void>(
    context,
    MaterialPageRoute(
      builder: (_) => EditGuestProfileScreen(controller: widget.controller),
    ),
  );

  Future<void> _logout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.l10n.msgSignOutOfYourAccount),
        content: Text(context.l10n.msgYourLocalBookingsWillRemainOnThisDevice),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(context.l10n.msgStay),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(context.l10n.msgSignOut),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      try {
        await widget.controller.logout();
      } catch (error) {
        if (mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(accountError(error))));
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: widget.controller,
    builder: (context, _) {
      final signedIn = widget.controller.isLoggedIn,
          profile = widget.controller.profile;
      return ListView(
        padding: EdgeInsets.only(bottom: 30),
        children: [
          PageHeading(
            context.l10n.msgProfile,
            subtitle: context.l10n.msgFavouritePlacesSpecialMomentsAllHere,
          ),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Panel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 62,
                            height: 62,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: SeatMapColors.lavenderSoft,
                              borderRadius: BorderRadius.circular(22),
                            ),
                            child: signedIn
                                ? Text(
                                    profile.displayName.isEmpty
                                        ? 'S'
                                        : profile.displayName.characters.first
                                              .toUpperCase(),
                                    style: TextStyle(
                                      fontSize: 26,
                                      fontWeight: FontWeight.w600,
                                      color: SeatMapColors.lavender,
                                    ),
                                  )
                                : Icon(
                                    Icons.person_outline_rounded,
                                    color: SeatMapColors.lavender,
                                    size: 30,
                                  ),
                          ),
                          SizedBox(width: 15),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  signedIn
                                      ? profile.displayName
                                      : context.l10n.msgSeatMapGuest,
                                  style: TextStyle(
                                    fontSize: 19,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                SizedBox(height: 5),
                                Text(
                                  signedIn
                                      ? profile.email
                                      : context
                                            .l10n
                                            .msgYourNextEveningStartsHere,
                                  style: TextStyle(
                                    color: SeatMapColors.muted,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      SizedBox(height: 20),
                      if (signedIn) ...[
                        _Badge(
                          widget.controller.demoMode
                              ? context.l10n.msgTESTPROFILE
                              : context.l10n.msgSEATMAPACCOUNT,
                        ),
                        SizedBox(height: 12),
                        Text(
                          widget.controller.demoMode
                              ? context.l10n.msgDataIsSavedOnThisDevice
                              : context
                                    .l10n
                                    .msgYourProfileIsSavedOnTheServerYour,
                          style: TextStyle(
                            color: SeatMapColors.muted,
                            fontSize: 12,
                            height: 1.5,
                          ),
                        ),
                      ] else
                        PrimaryButton(
                          label: context.l10n.msgSignInToSeatMap,
                          onPressed: () => Navigator.push(
                            context,
                            MaterialPageRoute<void>(
                              builder: (_) =>
                                  LoginScreen(controller: widget.controller),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                SizedBox(height: 26),
                Text(
                  context.l10n.msgYourSeatMap,
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                ),
                SizedBox(height: 13),
                _Panel(
                  padding: 0,
                  child: Column(
                    children: [
                      _ProfileRow(
                        icon: Icons.language_rounded,
                        title: context.l10n.appLanguage,
                        subtitle: switch (widget.controller.appLanguageCode) {
                          'bg' => 'Български',
                          'ru' => 'Русский',
                          _ => 'English',
                        },
                        onTap: _chooseLanguage,
                      ),
                      const Divider(height: 1, indent: 17, endIndent: 17),
                      _ProfileRow(
                        icon: Icons.favorite_border_rounded,
                        title: context.l10n.msgFavouritePlaces111,
                        subtitle: context.l10n.msgPSaved(
                          (widget.controller.favorites.length).toString(),
                        ),
                        onTap: widget.onFavorites,
                      ),
                      Divider(height: 1, indent: 17, endIndent: 17),
                      _ProfileRow(
                        icon: Icons.person_outline_rounded,
                        title: context.l10n.msgMyDetails,
                        subtitle: context
                            .l10n
                            .msgPersonalDetailsContactsAndPreferences,
                        onTap: signedIn
                            ? _editProfile
                            : () => Navigator.push(
                                context,
                                MaterialPageRoute<void>(
                                  builder: (_) => LoginScreen(
                                    controller: widget.controller,
                                  ),
                                ),
                              ),
                      ),
                      Divider(height: 1, indent: 17, endIndent: 17),
                      if (signedIn && !widget.controller.demoMode) ...[
                        _ProfileRow(
                          icon: Icons.lock_outline_rounded,
                          title: context.l10n.msgSecurity,
                          subtitle: context.l10n.msgPasswordAndAccountDeletion,
                          onTap: () => Navigator.push<void>(
                            context,
                            MaterialPageRoute(
                              builder: (_) => GuestSecurityScreen(
                                controller: widget.controller,
                              ),
                            ),
                          ),
                        ),
                        Divider(height: 1, indent: 17, endIndent: 17),
                      ],
                      _ProfileRow(
                        icon: Icons.notifications_none_rounded,
                        title: context.l10n.msgReminders,
                        subtitle: context.l10n.msgDemoNoNotificationsSent,
                        trailing: Switch.adaptive(
                          value: widget.controller.demoNotifications,
                          activeTrackColor: SeatMapColors.lavender,
                          onChanged: (value) =>
                              widget.controller.setDemoNotifications(value),
                        ),
                      ),
                    ],
                  ),
                ),
                SizedBox(height: 26),
                Text(
                  context.l10n.msgHereToHelp,
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                ),
                SizedBox(height: 13),
                _Panel(
                  padding: 0,
                  child: Column(
                    children: [
                      _ProfileRow(
                        icon: Icons.help_outline_rounded,
                        title: context.l10n.msgHelp,
                        onTap: () => _info(
                          context,
                          context.l10n.msgHowItWorks,
                          context.l10n.msgFindARestaurantChooseADateAndTime,
                        ),
                      ),
                      Divider(height: 1, indent: 17, endIndent: 17),
                      _ProfileRow(
                        icon: Icons.info_outline_rounded,
                        title: context.l10n.msgAboutSeatMap,
                        onTap: () => _info(
                          context,
                          context.l10n.msgAGreatEveningStartsWithAPlace,
                          context.l10n
                              .msgSeatMapHelpsYouFindARestaurantAndChoose(
                                (widget.controller.demoMode
                                        ? context
                                              .l10n
                                              .msgDemoCatalogueAndBookings
                                        : context
                                              .l10n
                                              .msgConnectedToTheRestaurantAPI)
                                    .toString(),
                              ),
                        ),
                      ),
                    ],
                  ),
                ),
                if (signedIn)
                  Padding(
                    padding: EdgeInsets.only(top: 16),
                    child: TextButton.icon(
                      onPressed: _logout,
                      icon: Icon(
                        Icons.logout_rounded,
                        size: 18,
                        color: SeatMapColors.muted,
                      ),
                      label: Text(
                        context.l10n.msgSignOutOfAccount,
                        style: TextStyle(
                          color: SeatMapColors.muted,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ),
                SizedBox(height: 25),
                Center(
                  child: Text(
                    context.l10n.msgSeatMapMoreThanATable,
                    style: TextStyle(color: SeatMapColors.muted, fontSize: 11),
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    },
  );
}

class _ProfileRow extends StatelessWidget {
  const _ProfileRow({
    required this.icon,
    required this.title,
    this.subtitle,
    this.onTap,
    this.trailing,
  });
  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback? onTap;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) => ListTile(
    contentPadding: EdgeInsets.symmetric(horizontal: 17, vertical: 7),
    leading: Icon(icon, color: SeatMapColors.lavender, size: 22),
    title: Text(title, style: TextStyle(fontSize: 14)),
    subtitle: subtitle == null
        ? null
        : Padding(
            padding: EdgeInsets.only(top: 4),
            child: Text(
              subtitle!,
              style: TextStyle(fontSize: 11, color: SeatMapColors.muted),
            ),
          ),
    trailing:
        trailing ??
        Icon(Icons.chevron_right_rounded, size: 21, color: SeatMapColors.muted),
    onTap: onTap,
  );
}

class BookingsScreen extends StatefulWidget {
  const BookingsScreen({
    super.key,
    required this.controller,
    this.onOpenRestaurant,
  });
  final AppController controller;
  final ValueChanged<String>? onOpenRestaurant;
  @override
  State<BookingsScreen> createState() => _BookingsScreenState();
}

class _BookingsScreenState extends State<BookingsScreen> {
  bool history = false;
  final Set<String> cancelling = {};
  Timer? _clock;
  @override
  void initState() {
    super.initState();
    _clock = Timer.periodic(Duration(seconds: 30), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _clock?.cancel();
    super.dispose();
  }

  Future<void> _contact(Booking booking) => showRestaurantContact(
    context,
    restaurantName: booking.restaurantName,
    phone: widget.controller.restaurantPhoneFor(booking),
    reason: booking.managementToken.isEmpty && !booking.demo
        ? context.l10n.bookingAccessUnavailable
        : context.l10n.cancellationContactRequired,
  );

  String _deadline(Booking booking) {
    final local = tz.TZDateTime.from(
      widget.controller.repository.cancellationDeadline(booking),
      tz.getLocation(booking.timeZone),
    );
    return DateFormat(
      'd MMM, HH:mm',
      widget.controller.appLanguageCode,
    ).format(local);
  }

  Future<void> _cancel(Booking booking) async {
    if (cancelling.contains(booking.id)) return;
    if (!widget.controller.repository.canCancelBooking(booking)) {
      await _contact(booking);
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.l10n.msgCancelThisBooking),
        content: Text(
          context.l10n.cancelBookingConfirmation(
            booking.restaurantName,
            _date(booking.date),
            booking.time,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(context.l10n.msgKeepBooking),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(context.l10n.msgCancelBooking),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    if (!mounted) return;
    setState(() => cancelling.add(booking.id));
    try {
      await widget.controller.cancelBooking(booking.id);
      if (mounted) _snack(context, context.l10n.bookingCancelled);
    } catch (error) {
      if (mounted) {
        if (error is SeatMapException && error.code == 'CONTACT_RESTAURANT') {
          await _contact(booking);
        } else {
          _snack(context, _error(error));
        }
      }
    } finally {
      if (mounted) setState(() => cancelling.remove(booking.id));
    }
  }

  bool _past(Booking booking) {
    return ['cancelled', 'completed'].contains(booking.status) ||
        widget.controller.repository
            .bookingStartsAt(booking)
            .isBefore(DateTime.now().toUtc());
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: widget.controller,
    builder: (context, _) {
      final bookings = widget.controller.bookings
          .where((booking) => _past(booking) == history)
          .toList();
      return ListView(
        padding: EdgeInsets.only(bottom: 30),
        children: [
          PageHeading(
            context.l10n.msgMyBookings,
            subtitle: context.l10n.msgAllYourPlansForAGreatEvening,
            trailing: IconButton(
              tooltip: context.l10n.refreshBookings,
              onPressed: widget.controller.refreshingBookings
                  ? null
                  : () async {
                      await widget.controller.refreshBookings();
                      await widget.controller.refreshWaitlist();
                    },
              icon: widget.controller.refreshingBookings
                  ? SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Icon(Icons.refresh_rounded),
            ),
          ),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: 24),
            child: Column(
              children: [
                Container(
                  padding: EdgeInsets.all(5),
                  decoration: BoxDecoration(
                    color: SeatMapColors.surface,
                    borderRadius: BorderRadius.circular(17),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: ChoicePill(
                          context.l10n.msgUpcoming,
                          selected: !history,
                          onTap: () => setState(() => history = false),
                          padding: 0,
                          height: 39,
                        ),
                      ),
                      SizedBox(width: 5),
                      Expanded(
                        child: ChoicePill(
                          context.l10n.msgHistory,
                          selected: history,
                          onTap: () => setState(() => history = true),
                          padding: 0,
                          height: 39,
                        ),
                      ),
                    ],
                  ),
                ),
                SizedBox(height: 22),
                WaitlistCards(controller: widget.controller, history: history),
                if (bookings.isEmpty &&
                    !widget.controller.waitlistEntries.any(
                      (e) =>
                          history ==
                          [
                            'booked',
                            'cancelled',
                            'expired',
                          ].contains(e['status']),
                    ))
                  Padding(
                    padding: EdgeInsets.symmetric(vertical: 45),
                    child: Column(
                      children: [
                        Container(
                          width: 83,
                          height: 83,
                          decoration: BoxDecoration(
                            color: SeatMapColors.surface,
                            borderRadius: BorderRadius.circular(29),
                          ),
                          child: Icon(
                            Icons.calendar_month_outlined,
                            color: SeatMapColors.lavender,
                            size: 35,
                          ),
                        ),
                        SizedBox(height: 24),
                        Text(
                          history
                              ? context.l10n.msgNoBookingHistoryYet
                              : context.l10n.msgYourEveningIsStillOpen,
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                          ),
                          textAlign: TextAlign.center,
                        ),
                        SizedBox(height: 11),
                        Text(
                          history
                              ? context
                                    .l10n
                                    .msgPastAndCancelledBookingsWillAppearHere
                              : context
                                    .l10n
                                    .msgChooseARestaurantAndYourFavouriteTableWe,
                          style: TextStyle(
                            fontSize: 13,
                            color: SeatMapColors.muted,
                            height: 1.7,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                ...bookings.map(
                  (booking) => Padding(
                    padding: EdgeInsets.only(bottom: 16),
                    child: _Panel(
                      padding: 16,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(13),
                                child: Image.asset(
                                  booking.restaurantImage,
                                  width: 70,
                                  height: 75,
                                  fit: BoxFit.cover,
                                ),
                              ),
                              SizedBox(width: 13),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      booking.restaurantName,
                                      style: TextStyle(
                                        fontSize: 19,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    SizedBox(height: 6),
                                    Text(
                                      '${_date(booking.date)} · ${booking.time}',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: SeatMapColors.muted,
                                      ),
                                    ),
                                    SizedBox(height: 5),
                                    Text(
                                      context.l10n.msgPGuestsTableP(
                                        (booking.guests).toString(),
                                        (booking.tableLabel).toString(),
                                      ),
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: SeatMapColors.muted,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              if (booking.demo) _Badge(context.l10n.msgDEMO),
                            ],
                          ),
                          SizedBox(height: 17),
                          Row(
                            children: [
                              Icon(
                                Icons.circle,
                                size: 6,
                                color: booking.status == 'confirmed'
                                    ? Color(0xFF95DBB7)
                                    : SeatMapColors.peach,
                              ),
                              SizedBox(width: 7),
                              Flexible(
                                child: Text(
                                  booking.status == 'cancelled'
                                      ? context.l10n.msgCancelled
                                      : booking.status == 'pending'
                                      ? context
                                            .l10n
                                            .msgConfirmYourBookingByEmail
                                      : booking.status == 'completed'
                                      ? context.l10n.bookingCompleted
                                      : context.l10n.msgConfirmed,
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: booking.status == 'confirmed'
                                        ? Color(0xFF95DBB7)
                                        : SeatMapColors.peach,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          if (!history) ...[
                            SizedBox(height: 12),
                            Text(
                              context.l10n.cancellationRuleHours(
                                (booking.cancellationLeadMinutes / 60)
                                    .toStringAsFixed(0),
                              ),
                              style: TextStyle(
                                fontSize: 11,
                                color: SeatMapColors.muted,
                                height: 1.5,
                              ),
                            ),
                            if (widget.controller.repository.canCancelBooking(
                              booking,
                            )) ...[
                              SizedBox(height: 5),
                              Text(
                                context.l10n.cancellationDeadlineLabel(
                                  _deadline(booking),
                                ),
                                style: TextStyle(
                                  fontSize: 11,
                                  color: SeatMapColors.lavender,
                                ),
                              ),
                            ],
                            if (widget.controller
                                .restaurantPhoneFor(booking)
                                .isNotEmpty)
                              TextButton.icon(
                                onPressed: () => _contact(booking),
                                icon: Icon(Icons.phone_outlined, size: 15),
                                label: Text(
                                  widget.controller.restaurantPhoneFor(booking),
                                ),
                              ),
                            Divider(height: 20),
                            Row(
                              children: [
                                Expanded(
                                  child: TextButton(
                                    onPressed: widget.onOpenRestaurant == null
                                        ? null
                                        : () => widget.onOpenRestaurant!(
                                            booking.restaurantId,
                                          ),
                                    child: Text(
                                      context.l10n.msgAboutTheRestaurant,
                                      style: TextStyle(fontSize: 12),
                                    ),
                                  ),
                                ),
                                Container(
                                  width: 1,
                                  height: 19,
                                  color: SeatMapColors.line,
                                ),
                                Expanded(
                                  child: TextButton(
                                    onPressed: cancelling.contains(booking.id)
                                        ? null
                                        : () => _cancel(booking),
                                    child: Text(
                                      cancelling.contains(booking.id)
                                          ? context.l10n.cancellingBooking
                                          : widget.controller.repository
                                                .canCancelBooking(booking)
                                          ? context.l10n.msgCancel
                                          : context.l10n.msgContact,
                                      style: TextStyle(
                                        fontSize: 12,
                                        color:
                                            widget.controller.repository
                                                .canCancelBooking(booking)
                                            ? SeatMapColors.lavender
                                            : SeatMapColors.muted,
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
                SizedBox(height: 15),
                if (widget.controller.bookingsError != null)
                  DemoNotice(widget.controller.bookingsError!),
                DemoNotice(
                  context.l10n.msgBookingsAreStoredOnThisDeviceTestBookings,
                ),
              ],
            ),
          ),
        ],
      );
    },
  );
}

class BookingFormScreen extends StatefulWidget {
  const BookingFormScreen({
    super.key,
    required this.restaurant,
    required this.tables,
    required this.controller,
    this.onViewBookings,
  });
  final Restaurant restaurant;
  final List<SeatTable> tables;
  final AppController controller;
  final VoidCallback? onViewBookings;
  @override
  State<BookingFormScreen> createState() => _BookingFormScreenState();
}

class _BookingFormScreenState extends State<BookingFormScreen> {
  final form = GlobalKey<FormState>();
  late final TextEditingController name, phone, email;
  final notes = TextEditingController();
  bool consent = false, busy = false, uncertain = false;
  String? error;
  @override
  void initState() {
    super.initState();
    final profile = widget.controller.isLoggedIn
        ? widget.controller.profile
        : null;
    name = TextEditingController(text: profile?.displayName ?? '');
    phone = TextEditingController(text: profile?.phone ?? '');
    email = TextEditingController(text: profile?.email ?? '');
  }

  @override
  void dispose() {
    name.dispose();
    phone.dispose();
    email.dispose();
    notes.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (busy) return;
    FocusScope.of(context).unfocus();
    if (!form.currentState!.validate()) return;
    if (!consent) {
      setState(
        () => error = context.l10n.msgPleaseConsentToSharingYourDetailsWithThe,
      );
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final booking = await widget.controller.submitBooking(
        restaurant: widget.restaurant,
        tableIds: widget.tables.map((table) => table.id).toList(),
        guestName: name.text.trim(),
        phone: phone.text.trim(),
        email: email.text.trim(),
        notes: notes.text.trim(),
      );
      if (!mounted) return;
      HapticFeedback.mediumImpact();
      Navigator.pushReplacement(
        context,
        MaterialPageRoute<void>(
          builder: (_) => BookingSuccessScreen(
            booking: booking,
            controller: widget.controller,
            restaurant: widget.restaurant,
            onViewBookings: widget.onViewBookings,
          ),
        ),
      );
    } catch (exception) {
      if (mounted) {
        setState(() {
          error = _error(exception);
          uncertain = exception is SeatMapException && exception.uncertain;
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !busy,
    child: Scaffold(
      body: Padding(
        padding: EdgeInsets.only(top: topInset(context)),
        child: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: EdgeInsets.fromLTRB(24, 12, 24, 30),
          children: [
            _Back(),
            SizedBox(height: 24),
            Text(
              context.l10n.msgAlmostThere,
              style: TextStyle(
                fontSize: 31,
                fontWeight: FontWeight.w700,
                letterSpacing: -.8,
              ),
            ),
            SizedBox(height: 7),
            Text(
              context.l10n.msgLeaveYourContactDetailsYourTableAwaits,
              style: TextStyle(color: SeatMapColors.muted, fontSize: 14),
            ),
            SizedBox(height: 23),
            _Panel(
              padding: 16,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(13),
                        child: Image.asset(
                          widget.restaurant.imageAsset,
                          width: 63,
                          height: 65,
                          fit: BoxFit.cover,
                        ),
                      ),
                      SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              widget.restaurant.name,
                              style: TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            SizedBox(height: 6),
                            Text(
                              widget.restaurant.cuisine,
                              style: TextStyle(
                                color: SeatMapColors.muted,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  Divider(height: 31),
                  _SummaryLine(
                    icon: Icons.calendar_today_outlined,
                    text:
                        '${_date(widget.controller.selectedDate)} · ${widget.controller.selectedTime}',
                  ),
                  SizedBox(height: 13),
                  _SummaryLine(
                    icon: Icons.people_outline_rounded,
                    text: context.l10n.msgPGuests(
                      (widget.controller.guestCount).toString(),
                    ),
                  ),
                  SizedBox(height: 13),
                  _SummaryLine(
                    icon: Icons.chair_alt_outlined,
                    text: context.l10n.msgTableP(
                      (widget.tables.map((table) => table.label).join(' + '))
                          .toString(),
                    ),
                  ),
                ],
              ),
            ),
            if (widget.controller.demoMode) ...[
              SizedBox(height: 15),
              DemoNotice(context.l10n.msgDemoModeThisBookingStaysOnYourDevice),
            ],
            SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: Text(
                    context.l10n.msgYourContactDetails,
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                  ),
                ),
                if (widget.controller.demoMode)
                  TextButton(
                    onPressed: busy
                        ? null
                        : () {
                            name.text = context.l10n.msgAlexanderIvanov;
                            phone.text = '+359 888 123 456';
                            email.text = _demoEmail;
                          },
                    child: Text(
                      context.l10n.msgFillWithTestDetails,
                      style: TextStyle(fontSize: 11),
                    ),
                  ),
              ],
            ),
            SizedBox(height: 14),
            Form(
              key: form,
              child: AutofillGroup(
                child: Column(
                  children: [
                    TextFormField(
                      controller: name,
                      enabled: !busy,
                      autofillHints: [AutofillHints.name],
                      textCapitalization: TextCapitalization.words,
                      textInputAction: TextInputAction.next,
                      decoration: InputDecoration(
                        labelText: context.l10n.msgYourName,
                        prefixIcon: Icon(
                          Icons.person_outline_rounded,
                          size: 20,
                        ),
                      ),
                      validator: (value) => (value?.trim().length ?? 0) < 2
                          ? context.l10n.msgEnterYourName
                          : null,
                    ),
                    SizedBox(height: 14),
                    TextFormField(
                      controller: phone,
                      enabled: !busy,
                      autofillHints: [AutofillHints.telephoneNumber],
                      keyboardType: TextInputType.phone,
                      textInputAction: TextInputAction.next,
                      decoration: InputDecoration(
                        labelText: context.l10n.msgPhoneNumber,
                        prefixIcon: Icon(Icons.phone_outlined, size: 20),
                      ),
                      validator: (value) {
                        final length = (value ?? '')
                            .replaceAll(RegExp(r'\D'), '')
                            .length;
                        return length < 7 || length > 15
                            ? context.l10n.msgEnterAValidPhoneNumber
                            : null;
                      },
                    ),
                    SizedBox(height: 14),
                    TextFormField(
                      controller: email,
                      enabled: !busy,
                      autofillHints: [AutofillHints.email],
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      decoration: InputDecoration(
                        labelText: 'Email',
                        prefixIcon: Icon(
                          Icons.alternate_email_rounded,
                          size: 20,
                        ),
                      ),
                      validator: (value) =>
                          value == null ||
                              !RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
                                  .hasMatch(value.trim())
                          ? context.l10n.msgEnterAValidEmail
                          : null,
                    ),
                    SizedBox(height: 14),
                    TextFormField(
                      controller: notes,
                      enabled: !busy,
                      maxLines: 3,
                      maxLength: 500,
                      decoration: InputDecoration(
                        labelText: context.l10n.msgRequestsOptional,
                        hintText: context.l10n.msgSpecialOccasionHighChair,
                        alignLabelWithHint: true,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            SizedBox(height: 7),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              value: consent,
              onChanged: busy
                  ? null
                  : (value) => setState(() => consent = value ?? false),
              title: Text(
                context.l10n.msgIAgreeToShareMyContactDetailsWith,
                style: TextStyle(
                  color: SeatMapColors.muted,
                  fontSize: 11,
                  height: 1.5,
                ),
              ),
            ),
            if (error != null) ...[
              SizedBox(height: 14),
              DemoNotice(error!, error: true),
            ],
          ],
        ),
      ),
      bottomNavigationBar: _BottomAction(
        child: PrimaryButton(
          label: uncertain
              ? context.l10n.msgContactRestaurant
              : widget.controller.demoMode
              ? context.l10n.msgCreateDemoBooking
              : context.l10n.msgBook,
          loading: busy,
          onPressed: uncertain
              ? () => _info(
                  context,
                  context.l10n.msgCheckYourBookingStatus,
                  context.l10n.msgContactPPDoNotSubmitAnotherRequest(
                    (widget.restaurant.name).toString(),
                    (widget.restaurant.phone.isEmpty
                            ? ''
                            : ': ${widget.restaurant.phone}')
                        .toString(),
                  ),
                )
              : _submit,
        ),
      ),
    ),
  );
}

class _SummaryLine extends StatelessWidget {
  const _SummaryLine({required this.icon, required this.text});
  final IconData icon;
  final String text;
  @override
  Widget build(BuildContext context) => Row(
    children: [
      Icon(icon, size: 18, color: SeatMapColors.lavender),
      SizedBox(width: 12),
      Expanded(child: Text(text, style: TextStyle(fontSize: 13))),
    ],
  );
}

class BookingSuccessScreen extends StatefulWidget {
  const BookingSuccessScreen({
    super.key,
    required this.booking,
    required this.controller,
    required this.restaurant,
    this.onViewBookings,
  });
  final Booking booking;
  final AppController controller;
  final Restaurant restaurant;
  final VoidCallback? onViewBookings;
  @override
  State<BookingSuccessScreen> createState() => _BookingSuccessScreenState();
}

class _BookingSuccessScreenState extends State<BookingSuccessScreen> {
  Booking get booking => widget.booking;
  VoidCallback? get onViewBookings => widget.onViewBookings;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _offer());
  }

  Future<void> _offer() async {
    try {
      final settings = await widget.controller.repository.preorderSettings(
        widget.restaurant,
      );
      if (!mounted ||
          !settings.enabled ||
          ModalRoute.of(context)?.isCurrent != true ||
          (!booking.demo && booking.managementToken.isEmpty)) {
        return;
      }
      final accept = await showDialog<bool>(
        context: context,
        builder: (dialog) => AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(28),
          ),
          title: Column(
            children: [
              Icon(
                Icons.restaurant_rounded,
                size: 38,
                color: SeatMapColors.lavender,
              ),
              SizedBox(height: 18),
              Text(
                context.l10n.preorderOfferTitle,
                textAlign: TextAlign.center,
              ),
            ],
          ),
          content: Text(
            context.l10n.preorderOfferBody,
            textAlign: TextAlign.center,
            style: TextStyle(height: 1.6),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialog, false),
              child: Text(context.l10n.preorderLater),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialog, true),
              child: Text(context.l10n.preorderChooseMenu),
            ),
          ],
        ),
      );
      if (mounted && accept == true) {
        await Navigator.push<void>(
          context,
          MaterialPageRoute(
            builder: (_) => MenuScreen(
              controller: widget.controller,
              restaurant: widget.restaurant,
              booking: booking,
            ),
          ),
        );
      }
    } catch (_) {
      /* The saved reservation remains the primary successful result. */
    }
  }

  @override
  Widget build(BuildContext context) {
    final pending = booking.status == 'pending';
    return Scaffold(
      body: Padding(
        padding: EdgeInsets.only(top: topInset(context)),
        child: ListView(
          padding: EdgeInsets.fromLTRB(24, 37, 24, 30),
          children: [
            Center(
              child: Container(
                width: 100,
                height: 100,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: SeatMapColors.lavender.withValues(alpha: .1),
                  border: Border.all(
                    color: SeatMapColors.lavender.withValues(alpha: .3),
                  ),
                ),
                child: Center(
                  child: Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: SeatMapColors.lavender,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      pending
                          ? Icons.mark_email_read_outlined
                          : Icons.check_rounded,
                      color: SeatMapColors.background,
                      size: 36,
                    ),
                  ),
                ),
              ),
            ),
            SizedBox(height: 29),
            Text(
              pending
                  ? context.l10n.msgOneStepLeft
                  : booking.demo
                  ? context.l10n.msgYourDemoTableIsBooked
                  : context.l10n.msgYourTableIsBooked,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 30,
                height: 1.18,
                fontWeight: FontWeight.w700,
                letterSpacing: -.7,
              ),
            ),
            SizedBox(height: 13),
            Text(
              pending
                  ? context.l10n.msgConfirmUsingTheLinkInYourEmailYour
                  : booking.demo
                  ? context.l10n.msgAllTheDetailsAreSavedOnThisDevice
                  : context.l10n.msgPIsExpectingYouYourVisitDetailsAre(
                      (booking.restaurantName).toString(),
                    ),
              textAlign: TextAlign.center,
              style: TextStyle(
                color: SeatMapColors.muted,
                fontSize: 13,
                height: 1.7,
              ),
            ),
            SizedBox(height: 28),
            _Panel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.asset(
                          booking.restaurantImage,
                          width: 58,
                          height: 58,
                          fit: BoxFit.cover,
                        ),
                      ),
                      SizedBox(width: 13),
                      Expanded(
                        child: Text(
                          booking.restaurantName,
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      if (booking.demo) _Badge(context.l10n.msgDEMO),
                    ],
                  ),
                  Divider(height: 39),
                  _SummaryLine(
                    icon: Icons.calendar_today_outlined,
                    text: '${_date(booking.date)} · ${booking.time}',
                  ),
                  SizedBox(height: 17),
                  _SummaryLine(
                    icon: Icons.people_outline_rounded,
                    text: context.l10n.msgPGuestsTableP(
                      (booking.guests).toString(),
                      (booking.tableLabel).toString(),
                    ),
                  ),
                  SizedBox(height: 17),
                  _SummaryLine(
                    icon: Icons.person_outline_rounded,
                    text: booking.guestName,
                  ),
                  SizedBox(height: 17),
                  _SummaryLine(icon: Icons.phone_outlined, text: booking.phone),
                  Divider(height: 37),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          context.l10n.msgBookingReference,
                          style: TextStyle(
                            color: SeatMapColors.muted,
                            fontSize: 11,
                          ),
                        ),
                      ),
                      Flexible(
                        child: Text(
                          booking.id.length > 12
                              ? booking.id
                                    .substring(booking.id.length - 8)
                                    .toUpperCase()
                              : booking.id,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: SeatMapColors.lavender,
                            fontSize: 12,
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: context.l10n.msgCopyReference,
                        onPressed: () async {
                          await Clipboard.setData(
                            ClipboardData(text: booking.id),
                          );
                          if (context.mounted) {
                            _snack(context, context.l10n.msgReferenceCopied);
                          }
                        },
                        icon: Icon(Icons.copy_outlined, size: 16),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            SizedBox(height: 20),
            DemoNotice(
              booking.demo
                  ? context.l10n.msgThisIsADemoBookingNoRequestWas
                  : pending
                  ? context
                        .l10n
                        .msgConfirmationOpensOnTheRestaurantWebsiteStatusUpdates
                  : context.l10n.msgIfYourPlansChangePleaseContactTheRestaurant,
            ),
            SizedBox(height: 15),
            TextButton(
              onPressed: () =>
                  Navigator.popUntil(context, (route) => route.isFirst),
              child: Text(
                context.l10n.msgKeepExploring,
                style: TextStyle(fontSize: 13),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: _BottomAction(
        child: PrimaryButton(
          label: context.l10n.msgViewMyBookings,
          icon: Icons.calendar_month_outlined,
          onPressed: () {
            Navigator.popUntil(context, (route) => route.isFirst);
            onViewBookings?.call();
          },
        ),
      ),
    );
  }
}
