import '../../l10n/language.dart';

import 'package:material_ui/material_ui.dart';

import '../../data/guest_account_repository.dart';
import '../../domain/models.dart';
import '../../state/app_controller.dart';
import '../components.dart';
import '../theme.dart';

String accountError(Object error) =>
    error.toString().replaceFirst(RegExp(r'^Exception:\s*'), '');

Future<bool> _validateAccountForm(GlobalKey<FormState> key) async {
  final invalid = key.currentState!.validateGranularly();
  if (invalid.isEmpty) return true;
  await Scrollable.ensureVisible(
    invalid.first.context,
    duration: Duration(milliseconds: 250),
    alignment: 0.15,
  );
  return false;
}

class _AccountFrame extends StatelessWidget {
  const _AccountFrame({
    required this.title,
    required this.subtitle,
    required this.children,
  });
  final String title, subtitle;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(title),
      backgroundColor: SeatMapColors.background,
    ),
    body: ListView(
      padding: EdgeInsets.fromLTRB(24, 12, 24, 40),
      children: [
        Text(
          subtitle,
          style: TextStyle(color: SeatMapColors.muted, height: 1.5),
        ),
        SizedBox(height: 24),
        ...children,
      ],
    ),
  );
}

class _Failure extends StatelessWidget {
  const _Failure(this.message);
  final String? message;
  @override
  Widget build(BuildContext context) => message == null
      ? SizedBox.shrink()
      : Padding(
          padding: EdgeInsets.symmetric(vertical: 14),
          child: Semantics(
            liveRegion: true,
            child: Text(
              message!,
              style: TextStyle(color: Color(0xFFFFB8B8), height: 1.5),
            ),
          ),
        );
}

Widget _section(String title) => Padding(
  padding: EdgeInsets.only(top: 12, bottom: 16),
  child: Text(
    title,
    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
  ),
);

class _ProfileInputs {
  _ProfileInputs(GuestProfile value)
    : first = TextEditingController(
        text: value.firstName.isEmpty
            ? value.name.split(' ').first
            : value.firstName,
      ),
      last = TextEditingController(text: value.lastName),
      email = TextEditingController(text: value.email),
      phone = TextEditingController(text: value.phone),
      city = TextEditingController(text: value.city),
      country = TextEditingController(text: value.country),
      birth = value.dateOfBirth,
      language = value.preferredLanguage,
      marketing = value.marketingConsent;
  final TextEditingController first, last, email, phone, city, country;
  DateTime? birth;
  String language;
  bool marketing;
  Map<String, String> serverFields = {};
  void dispose() {
    for (final item in [first, last, email, phone, city, country]) {
      item.dispose();
    }
  }

  GuestProfile value() => GuestProfile(
    firstName: first.text.trim(),
    lastName: last.text.trim(),
    email: email.text.trim(),
    phone: phone.text.trim().replaceAll(RegExp(r'[\s()\-]'), ''),
    city: city.text.trim(),
    country: country.text.trim(),
    dateOfBirth: birth,
    preferredLanguage: language,
    marketingConsent: marketing,
  );

  List<Widget> fields(
    BuildContext context,
    VoidCallback changed, {
    bool busy = false,
    bool optionalCollapsed = false,
  }) {
    Widget input(
      TextEditingController controller,
      String label,
      String key, {
      TextInputType? type,
      List<String>? autofill,
      int max = 100,
      String? Function(String?)? validate,
      String? hint,
    }) => Padding(
      padding: EdgeInsets.only(bottom: 14),
      child: TextFormField(
        controller: controller,
        enabled: !busy,
        keyboardType: type,
        autofillHints: autofill,
        textInputAction: TextInputAction.next,
        maxLength: max,
        textCapitalization: type == null
            ? TextCapitalization.words
            : TextCapitalization.none,
        onChanged: (_) {
          serverFields.remove(key);
          changed();
        },
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          counterText: '',
          errorText: serverFields[key],
        ),
        validator: validate,
      ),
    );
    final personal = <Widget>[
      _section(context.l10n.msgPersonalDetails),
      input(
        first,
        context.l10n.msgFirstName,
        'firstname',
        max: 60,
        autofill: [AutofillHints.givenName],
        validate: (v) =>
            (v?.trim().isEmpty ?? true) ? context.l10n.msgEnterYourName : null,
      ),
      input(
        last,
        context.l10n.msgLastName,
        'lastname',
        max: 60,
        autofill: [AutofillHints.familyName],
        validate: (v) => (v?.trim().isEmpty ?? true)
            ? context.l10n.msgEnterYourLastName
            : null,
      ),
      input(
        email,
        'Email *',
        'email',
        max: 254,
        type: TextInputType.emailAddress,
        autofill: [AutofillHints.email],
        validate: (v) =>
            RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v?.trim() ?? '')
            ? null
            : context.l10n.msgEnterAValidEmail,
      ),
      input(
        phone,
        context.l10n.msgPhoneNumber192,
        'phone',
        max: 30,
        type: TextInputType.phone,
        autofill: [AutofillHints.telephoneNumber],
        hint: '+359 888 123 456',
        validate: (v) =>
            RegExp(r'^\+[1-9]\d{6,14}$')
                .hasMatch((v ?? '').replaceAll(RegExp(r'[\s()\-]'), ''))
            ? null
            : context.l10n.msgIncludeTheCountryCodeForExample,
      ),
    ];
    final additional = <Widget>[
      _section(context.l10n.msgAboutYouOptional),
      input(
        city,
        context.l10n.msgCity,
        'city',
        max: 100,
        autofill: [AutofillHints.addressCity],
      ),
      input(
        country,
        context.l10n.msgCountry,
        'country',
        max: 80,
        autofill: [AutofillHints.countryName],
      ),
      Row(
        children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: busy
                  ? null
                  : () async {
                      final today = DateTime.now();
                      final selected = await showDatePicker(
                        context: context,
                        initialDate:
                            birth ??
                            DateTime(today.year - 25, today.month, today.day),
                        firstDate: DateTime(
                          today.year - 120,
                          today.month,
                          today.day,
                        ),
                        lastDate: today,
                        helpText: context.l10n.msgDateOfBirth,
                        cancelText: context.l10n.msgCancel198,
                        confirmText: context.l10n.msgSelect,
                      );
                      if (selected != null && context.mounted) {
                        birth = selected;
                        changed();
                      }
                    },
              icon: Icon(Icons.cake_outlined),
              label: Text(
                birth == null
                    ? context.l10n.msgDateOfBirth
                    : '${birth!.day.toString().padLeft(2, '0')}.${birth!.month.toString().padLeft(2, '0')}.${birth!.year}',
              ),
            ),
          ),
          if (birth != null)
            IconButton(
              tooltip: context.l10n.msgRemoveDateOfBirth,
              onPressed: busy
                  ? null
                  : () {
                      birth = null;
                      changed();
                    },
              icon: Icon(Icons.close),
            ),
        ],
      ),
      SizedBox(height: 16),
      DropdownButtonFormField<String>(
        initialValue: language,
        decoration: InputDecoration(
          labelText: context.l10n.msgCommunicationLanguage,
        ),
        items: [
          DropdownMenuItem(value: 'ru', child: Text(context.l10n.msg)),
          DropdownMenuItem(value: 'bg', child: Text(context.l10n.msg202)),
          DropdownMenuItem(value: 'en', child: Text('English')),
        ],
        onChanged: busy
            ? null
            : (v) {
                language = v ?? 'ru';
                changed();
              },
      ),
      SizedBox(height: 12),
      Text(
        context.l10n.msgYourCommunicationLanguageIsSavedInYourProfile,
        style: TextStyle(color: SeatMapColors.muted, fontSize: 12, height: 1.5),
      ),
      SizedBox(height: 12),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        value: marketing,
        onChanged: busy
            ? null
            : (v) {
                marketing = v;
                changed();
              },
        title: Text(
          context.l10n.msgOffersAndNews,
          style: TextStyle(fontSize: 14),
        ),
        subtitle: Text(
          context.l10n.msgOptionalYouCanTurnThisOffAtAny,
          style: TextStyle(color: SeatMapColors.muted, fontSize: 12),
        ),
      ),
    ];
    return [
      ...personal,
      if (optionalCollapsed)
        ExpansionTile(
          tilePadding: EdgeInsets.zero,
          title: Text(
            context.l10n.msgCompleteYourProfile,
            style: TextStyle(fontSize: 15),
          ),
          subtitle: Text(
            context.l10n.msgCityBirthdayAndPreferencesOptional,
            style: TextStyle(color: SeatMapColors.muted, fontSize: 12),
          ),
          children: additional,
        )
      else
        ...additional,
    ];
  }
}

class _PasswordField extends StatelessWidget {
  const _PasswordField({
    required this.controller,
    required this.label,
    this.newPassword = false,
    this.confirmation,
    this.enabled = true,
  });
  final TextEditingController controller;
  final String label;
  final bool newPassword, enabled;
  final TextEditingController? confirmation;
  @override
  Widget build(BuildContext context) => _VisiblePassword(
    controller: controller,
    label: label,
    newPassword: newPassword,
    confirmation: confirmation,
    enabled: enabled,
  );
}

class _VisiblePassword extends StatefulWidget {
  const _VisiblePassword({
    required this.controller,
    required this.label,
    required this.newPassword,
    required this.enabled,
    this.confirmation,
  });
  final TextEditingController controller;
  final String label;
  final bool newPassword, enabled;
  final TextEditingController? confirmation;
  @override
  State<_VisiblePassword> createState() => _VisiblePasswordState();
}

class _VisiblePasswordState extends State<_VisiblePassword> {
  bool obscure = true;
  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(bottom: 14),
    child: TextFormField(
      controller: widget.controller,
      enabled: widget.enabled,
      obscureText: obscure,
      enableSuggestions: false,
      autocorrect: false,
      autofillHints: [
        widget.newPassword ? AutofillHints.newPassword : AutofillHints.password,
      ],
      maxLength: 128,
      textInputAction: TextInputAction.next,
      decoration: InputDecoration(
        labelText: widget.label,
        counterText: '',
        suffixIcon: IconButton(
          tooltip: obscure
              ? context.l10n.msgShowPassword
              : context.l10n.msgHidePassword,
          onPressed: () => setState(() => obscure = !obscure),
          icon: Icon(
            obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined,
          ),
        ),
      ),
      validator: (value) {
        if (value == null || value.isEmpty) {
          return context.l10n.msgEnterYourPassword;
        }
        if (widget.confirmation != null && value != widget.confirmation!.text) {
          return context.l10n.msgPasswordsDoNotMatch;
        }
        if (widget.newPassword && value.length < 12) {
          return context.l10n.msgUseAtLeastCharacters;
        }
        return null;
      },
    ),
  );
}

void showGuestPrivacy(BuildContext context) => showDialog<void>(
  context: context,
  builder: (context) => AlertDialog(
    title: Text(context.l10n.msgDataProcessing),
    content: SingleChildScrollView(
      child: Text(context.l10n.msgYourNameEmailAndPhoneAreUsedFor),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: Text(context.l10n.msgGotIt),
      ),
    ],
  ),
);

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key, required this.controller});
  final AppController controller;
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final form = GlobalKey<FormState>();
  late final inputs = _ProfileInputs(
    GuestProfile(preferredLanguage: widget.controller.appLanguageCode),
  );
  final password = TextEditingController(),
      confirmation = TextEditingController();
  bool busy = false, consent = false, consentError = false;
  String? error;
  @override
  void dispose() {
    inputs.dispose();
    password.dispose();
    confirmation.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (busy) return;
    setState(() {
      consentError = !consent;
      inputs.serverFields.clear();
      error = null;
    });
    if (!await _validateAccountForm(form) || !consent) return;
    if (!mounted || busy) return;
    FocusScope.of(context).unfocus();
    setState(() => busy = true);
    try {
      await widget.controller.register(
        inputs.value(),
        password.text,
        confirmation.text,
        privacyConsent: consent,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          error = accountError(e);
          if (e is GuestAccountException) {
            inputs.serverFields = Map.of(e.fields);
          }
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => _AccountFrame(
    title: context.l10n.msgCreateAccount,
    subtitle: context.l10n.msgYourDetailsMakeBookingEasierFieldsMarkedWith,
    children: [
      Form(
        key: form,
        child: AutofillGroup(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ...inputs.fields(
                context,
                () => setState(() {}),
                busy: busy,
                optionalCollapsed: true,
              ),
              _section(context.l10n.msgSecurity),
              _PasswordField(
                controller: password,
                label: context.l10n.msgPassword216,
                newPassword: true,
                enabled: !busy,
              ),
              Padding(
                padding: EdgeInsets.only(bottom: 14),
                child: Text(
                  context.l10n.msgAtLeastCharactersUseALongUniquePassphrase,
                  style: TextStyle(color: SeatMapColors.muted, fontSize: 12),
                ),
              ),
              _PasswordField(
                controller: confirmation,
                label: context.l10n.msgConfirmPassword,
                confirmation: password,
                enabled: !busy,
              ),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                value: consent,
                onChanged: busy
                    ? null
                    : (v) => setState(() {
                        consent = v ?? false;
                        consentError = false;
                      }),
                title: Text(
                  context.l10n.msgIConsentToProcessingMyAccountData,
                  style: TextStyle(fontSize: 13),
                ),
              ),
              if (consentError)
                Text(
                  context.l10n.msgPleaseConsentToProcessingYourData,
                  style: TextStyle(color: Color(0xFFFFB8B8)),
                ),
              TextButton(
                onPressed: () => showGuestPrivacy(context),
                child: Text(context.l10n.msgHowMyDataIsUsed),
              ),
              _Failure(error),
              SizedBox(height: 12),
              PrimaryButton(
                label: context.l10n.msgCreateAccount,
                loading: busy,
                onPressed: submit,
              ),
            ],
          ),
        ),
      ),
    ],
  );
}

class EditGuestProfileScreen extends StatefulWidget {
  const EditGuestProfileScreen({super.key, required this.controller});
  final AppController controller;
  @override
  State<EditGuestProfileScreen> createState() => _EditGuestProfileScreenState();
}

class _EditGuestProfileScreenState extends State<EditGuestProfileScreen> {
  final form = GlobalKey<FormState>();
  late final inputs = _ProfileInputs(widget.controller.profile);
  final password = TextEditingController();
  bool busy = false;
  String? error;
  bool get changingEmail =>
      inputs.email.text.trim().toLowerCase() !=
      widget.controller.profile.email.trim().toLowerCase();
  @override
  void dispose() {
    inputs.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (busy) return;
    setState(() {
      inputs.serverFields.clear();
      error = null;
    });
    if (!await _validateAccountForm(form)) return;
    if (!mounted || busy) return;
    FocusScope.of(context).unfocus();
    setState(() => busy = true);
    try {
      await widget.controller.updateProfile(
        inputs.value(),
        currentPassword: changingEmail ? password.text : null,
      );
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(context.l10n.msgProfileSaved)));
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          error = accountError(e);
          if (e is GuestAccountException) {
            inputs.serverFields = Map.of(e.fields);
          }
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => _AccountFrame(
    title: context.l10n.msgMyDetails,
    subtitle: widget.controller.demoMode
        ? context.l10n.msgDemoProfileOnThisDevice
        : context.l10n.msgYourProfileIsSavedOnTheServerYour224,
    children: [
      Form(
        key: form,
        child: AutofillGroup(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ...inputs.fields(context, () => setState(() {}), busy: busy),
              if (changingEmail && !widget.controller.demoMode) ...[
                _section(context.l10n.msgConfirmEmailChange),
                Padding(
                  padding: EdgeInsets.only(bottom: 14),
                  child: Text(
                    context.l10n.msgAfterSavingUseYourNewEmailToSign,
                    style: TextStyle(color: SeatMapColors.muted),
                  ),
                ),
                _PasswordField(
                  controller: password,
                  label: context.l10n.msgCurrentPassword,
                  enabled: !busy,
                ),
              ],
              _Failure(error),
              SizedBox(height: 20),
              PrimaryButton(
                label: context.l10n.msgSaveChanges,
                loading: busy,
                onPressed: save,
              ),
            ],
          ),
        ),
      ),
    ],
  );
}

class GuestSecurityScreen extends StatefulWidget {
  const GuestSecurityScreen({super.key, required this.controller});
  final AppController controller;
  @override
  State<GuestSecurityScreen> createState() => _GuestSecurityScreenState();
}

class _GuestSecurityScreenState extends State<GuestSecurityScreen> {
  final form = GlobalKey<FormState>(), deletionForm = GlobalKey<FormState>();
  final current = TextEditingController(),
      password = TextEditingController(),
      confirmation = TextEditingController(),
      deletionPassword = TextEditingController();
  String? error;
  bool busy = false;
  @override
  void dispose() {
    for (final c in [current, password, confirmation, deletionPassword]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> change() async {
    if (busy || !await _validateAccountForm(form)) return;
    if (!mounted || busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.controller.changePassword(
        current.text,
        password.text,
        confirmation.text,
      );
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(context.l10n.msgPasswordChangedSignInAgainOnAllYour),
          ),
        );
      }
    } catch (e) {
      if (mounted) setState(() => error = accountError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> delete() async {
    if (busy || !await _validateAccountForm(deletionForm)) return;
    if (!mounted || busy) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.l10n.msgDeleteYourAccountPermanently),
        content: Text(
          context.l10n.msgYourProfileAndSessionsWillBeDeletedRestaurant,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(context.l10n.msgKeepAccount),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(context.l10n.msgDeletePermanently),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.controller.deleteAccount(deletionPassword.text);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) setState(() => error = accountError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => _AccountFrame(
    title: context.l10n.msgSecurity,
    subtitle: context.l10n.msgPasswordsAreNotStoredInTheAppChanging,
    children: [
      Form(
        key: form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _section(context.l10n.msgChangePassword),
            _PasswordField(
              controller: current,
              label: context.l10n.msgCurrentPassword,
              enabled: !busy,
            ),
            _PasswordField(
              controller: password,
              label: context.l10n.msgNewPassword,
              newPassword: true,
              enabled: !busy,
            ),
            _PasswordField(
              controller: confirmation,
              label: context.l10n.msgConfirmNewPassword,
              confirmation: password,
              enabled: !busy,
            ),
            PrimaryButton(
              label: context.l10n.msgChangePassword,
              loading: busy,
              onPressed: change,
            ),
          ],
        ),
      ),
      _Failure(error),
      SizedBox(height: 30),
      Divider(),
      _section(context.l10n.msgDeleteAccount),
      Text(
        context.l10n.msgThisDeletesYourGlobalSeatMapProfileContactEach,
        style: TextStyle(color: SeatMapColors.muted, height: 1.5),
      ),
      SizedBox(height: 16),
      Form(
        key: deletionForm,
        child: _PasswordField(
          controller: deletionPassword,
          label: context.l10n.msgPasswordToDeleteAccount,
          enabled: !busy,
        ),
      ),
      OutlinedButton(
        onPressed: busy ? null : delete,
        child: Text(
          context.l10n.msgDeleteMyAccount,
          style: TextStyle(color: Color(0xFFFFB8B8)),
        ),
      ),
    ],
  );
}
