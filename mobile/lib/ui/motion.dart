import 'package:material_ui/material_ui.dart';

bool reduceSeatMapMotion(BuildContext context) =>
    MediaQuery.disableAnimationsOf(context) ||
    WidgetsBinding
        .instance
        .platformDispatcher
        .accessibilityFeatures
        .reduceMotion;

class PressFeedback extends StatefulWidget {
  const PressFeedback({super.key, required this.child, this.enabled = true});
  final Widget child;
  final bool enabled;
  @override
  State<PressFeedback> createState() => _PressFeedbackState();
}

class _PressFeedbackState extends State<PressFeedback> {
  bool pressed = false;
  @override
  Widget build(BuildContext context) => Listener(
    onPointerDown: widget.enabled
        ? (_) => setState(() => pressed = true)
        : null,
    onPointerUp: (_) => setState(() => pressed = false),
    onPointerCancel: (_) => setState(() => pressed = false),
    child: AnimatedScale(
      scale: pressed && widget.enabled && !reduceSeatMapMotion(context)
          ? .975
          : 1,
      duration: Duration(milliseconds: reduceSeatMapMotion(context) ? 0 : 130),
      curve: Curves.easeOutCubic,
      child: widget.child,
    ),
  );
}

class SeatMapPageTransitions extends PageTransitionsBuilder {
  const SeatMapPageTransitions();
  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    if (reduceSeatMapMotion(context)) return child;
    return FadeTransition(
      opacity: animation.drive(CurveTween(curve: Curves.easeOut)),
      child: SlideTransition(
        position: animation.drive(
          Tween(
            begin: const Offset(0, .035),
            end: Offset.zero,
          ).chain(CurveTween(curve: Curves.easeOutCubic)),
        ),
        child: child,
      ),
    );
  }
}
