import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../l10n/language.dart';

String dialableRestaurantPhone(String phone) {
  final digits = phone.replaceAll(RegExp(r'[^0-9+]'), '');
  if (digits.startsWith('00')) return '+${digits.substring(2)}';
  if (RegExp(r'^0[0-9]{8,9}$').hasMatch(digits)) {
    return '+359${digits.substring(1)}';
  }
  return digits;
}

Future<void> callRestaurant(BuildContext context, String phone) async {
  final number = dialableRestaurantPhone(phone);
  bool opened = false;
  if (RegExp(r'^\+?[0-9]{7,15}$').hasMatch(number)) {
    try {
      opened = await launchUrl(
        Uri(scheme: 'tel', path: number),
        mode: LaunchMode.externalApplication,
      );
    } catch (_) {
      /* The contact dialog still allows copying the number. */
    }
  }
  if (!opened && context.mounted) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(context.l10n.couldNotOpenDialer)));
  }
}

Future<void> showRestaurantContact(
  BuildContext context, {
  required String restaurantName,
  required String phone,
  String? reason,
}) => showDialog<void>(
  context: context,
  builder: (context) => AlertDialog(
    title: Text(restaurantName),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (reason != null) ...[Text(reason), SizedBox(height: 16)],
        SelectableText(phone.isEmpty ? context.l10n.phoneUnavailable : phone),
      ],
    ),
    actions: [
      if (phone.isNotEmpty)
        TextButton(
          onPressed: () async {
            await Clipboard.setData(
              ClipboardData(text: dialableRestaurantPhone(phone)),
            );
            if (context.mounted) {
              ScaffoldMessenger.of(
                context,
              ).showSnackBar(SnackBar(content: Text(context.l10n.phoneCopied)));
            }
          },
          child: Text(context.l10n.copyPhone),
        ),
      if (phone.isNotEmpty)
        FilledButton.icon(
          onPressed: () => callRestaurant(context, phone),
          icon: Icon(Icons.phone_outlined),
          label: Text(context.l10n.callRestaurant),
        ),
    ],
  ),
);
