import 'dart:convert';
import 'dart:typed_data';

import 'package:material_ui/material_ui.dart';

import '../../domain/menu.dart';
import '../theme.dart';

class DishPhoto extends StatefulWidget {
  const DishPhoto({super.key, required this.dish});
  final MenuDish dish;
  @override
  State<DishPhoto> createState() => _DishPhotoState();
}

class _DishPhotoState extends State<DishPhoto> {
  Uint8List? bytes;
  @override
  void initState() {
    super.initState();
    _decode();
  }

  @override
  void didUpdateWidget(covariant DishPhoto oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.dish.image != widget.dish.image) _decode();
  }

  void _decode() {
    bytes = null;
    if (widget.dish.image.startsWith('data:image/')) {
      try {
        bytes = base64Decode(widget.dish.image.split(',').last);
      } catch (_) {
        /* use the category artwork */
      }
    }
  }

  Widget _fallback() => Container(
    decoration: BoxDecoration(
      gradient: LinearGradient(
        colors: widget.dish.drink
            ? [Color(0xFF282B43), Color(0xFF181A2A)]
            : [Color(0xFF3B2C3F), Color(0xFF252134)],
      ),
    ),
    child: Center(
      child: Container(
        width: 78,
        height: 78,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(
            color: SeatMapColors.lavender.withValues(alpha: .22),
            width: 2,
          ),
        ),
        child: Icon(
          widget.dish.drink
              ? Icons.local_bar_outlined
              : Icons.restaurant_menu_rounded,
          size: 34,
          color: SeatMapColors.peach.withValues(alpha: .8),
        ),
      ),
    ),
  );
  @override
  Widget build(BuildContext context) => bytes != null
      ? Image.memory(
          bytes!,
          fit: BoxFit.cover,
          gaplessPlayback: true,
          errorBuilder: (_, _, _) => _fallback(),
        )
      : widget.dish.image.startsWith('https://')
      ? Image.network(
          widget.dish.image,
          fit: BoxFit.cover,
          errorBuilder: (_, _, _) => _fallback(),
        )
      : _fallback();
}
