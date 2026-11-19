import 'package:flutter/foundation.dart';
import 'package:material_ui/material_ui.dart';

import 'theme.dart';

double topInset(BuildContext context) =>
    kIsWeb ? 44 : MediaQuery.paddingOf(context).top;
double bottomInset(BuildContext context) =>
    kIsWeb ? 24 : MediaQuery.paddingOf(context).bottom;

class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.icon = Icons.arrow_forward_rounded,
  });
  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;
  @override
  Widget build(BuildContext context) => SizedBox(
    height: 50,
    width: double.infinity,
    child: FilledButton(
      onPressed: loading ? null : onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: SeatMapColors.lavender,
        foregroundColor: SeatMapColors.background,
        disabledBackgroundColor: SeatMapColors.elevated,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        padding: const EdgeInsets.symmetric(horizontal: 18),
      ),
      child: loading
          ? const SizedBox(
              width: 21,
              height: 21,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : Row(
              children: [
                if (icon != null) const SizedBox(width: 22),
                Expanded(
                  child: Text(
                    label,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                if (icon != null) Icon(icon, size: 21),
              ],
            ),
    ),
  );
}

class ChoicePill extends StatelessWidget {
  const ChoicePill(
    this.label, {
    super.key,
    required this.onTap,
    this.selected = false,
    this.icon,
    this.height = 36,
    this.padding = 18,
  });
  final String label;
  final VoidCallback? onTap;
  final bool selected;
  final IconData? icon;
  final double height, padding;
  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    selected: selected,
    enabled: onTap != null,
    child: Material(
      color: selected ? SeatMapColors.lavenderSoft : SeatMapColors.elevated,
      shape: StadiumBorder(
        side: BorderSide(
          color: selected ? SeatMapColors.lavender : Colors.transparent,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        customBorder: const StadiumBorder(),
        child: Container(
          height: height,
          padding: EdgeInsets.symmetric(horizontal: padding),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 16, color: SeatMapColors.lavender),
                const SizedBox(width: 7),
              ],
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: selected
                        ? SeatMapColors.lavender
                        : SeatMapColors.text,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class CircleAction extends StatelessWidget {
  const CircleAction({
    super.key,
    required this.icon,
    required this.onTap,
    required this.tooltip,
    this.filled = false,
    this.size = 40,
  });
  final IconData icon;
  final VoidCallback onTap;
  final String tooltip;
  final bool filled;
  final double size;
  @override
  Widget build(BuildContext context) => Tooltip(
    message: tooltip,
    child: Semantics(
      button: true,
      label: tooltip,
      child: Material(
        color: filled
            ? SeatMapColors.lavenderSoft
            : SeatMapColors.background.withValues(alpha: .92),
        shape: CircleBorder(
          side: BorderSide(
            color: filled
                ? SeatMapColors.lavender
                : SeatMapColors.line.withValues(alpha: .65),
          ),
        ),
        child: InkWell(
          onTap: onTap,
          customBorder: const CircleBorder(),
          child: SizedBox(
            width: size,
            height: size,
            child: Icon(
              icon,
              size: 22,
              color: filled ? SeatMapColors.lavender : SeatMapColors.text,
            ),
          ),
        ),
      ),
    ),
  );
}

class RestaurantPhoto extends StatelessWidget {
  const RestaurantPhoto(
    this.asset, {
    super.key,
    this.height,
    this.width,
    this.alignment = Alignment.center,
  });
  final String asset;
  final double? height, width;
  final Alignment alignment;
  @override
  Widget build(BuildContext context) => Image.asset(
    asset,
    width: width,
    height: height,
    fit: BoxFit.cover,
    alignment: alignment,
    errorBuilder: (_, _, _) => Container(
      width: width,
      height: height,
      color: SeatMapColors.elevated,
      child: const Icon(
        Icons.restaurant_rounded,
        color: SeatMapColors.lavender,
        size: 35,
      ),
    ),
  );
}

class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    this.action,
  });
  final IconData icon;
  final String title, subtitle;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 42),
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          padding: const EdgeInsets.all(23),
          decoration: const BoxDecoration(
            color: SeatMapColors.lavenderSoft,
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: SeatMapColors.lavender, size: 36),
        ),
        const SizedBox(height: 23),
        Text(
          title,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 10),
        Text(
          subtitle,
          textAlign: TextAlign.center,
          style: const TextStyle(color: SeatMapColors.muted, height: 1.5),
        ),
        if (action != null) ...[const SizedBox(height: 25), action!],
      ],
    ),
  );
}

class PageHeading extends StatelessWidget {
  const PageHeading(this.title, {super.key, this.subtitle, this.trailing});
  final String title;
  final String? subtitle;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(24, 21, 24, 20),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                title,
                style: Theme.of(context).textTheme.headlineLarge,
              ),
            ),
            ?trailing,
          ],
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 7),
          Text(
            subtitle!,
            style: const TextStyle(color: SeatMapColors.muted, fontSize: 14),
          ),
        ],
      ],
    ),
  );
}

Future<T?> showSeatMapSheet<T>(
  BuildContext context, {
  required String title,
  required Widget child,
}) => showModalBottomSheet<T>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (context) => Padding(
    padding: EdgeInsets.fromLTRB(
      24,
      0,
      24,
      24 + MediaQuery.viewInsetsOf(context).bottom,
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 22),
        child,
        const SizedBox(height: 10),
      ],
    ),
  ),
);
