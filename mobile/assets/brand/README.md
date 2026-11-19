# SeatMap brand assets

The approved logo is the first refined concept: connected lavender SM letters with a lime tabletop on midnight.

- Source: `design/logo-concepts/refined/lavender-v2.png`.
- `app-icon.png`: opaque 1024 px master for native and web launcher icons.
- `seatmap-mark.png`: tightly framed artwork used in the discovery header and sign-in screen.
- iOS launch image uses the same monogram.
- Reproduce crops and all icon sizes: `python3 tool/generate_icons.py` (Pillow).

Original artwork was created with the built-in image generation tool; its full prompt is saved in `design/logo-concepts/refined/prompts.json`. Asset preparation only crops and resizes that artwork.
