# SeatMap brand assets

The approved logo is the first refined concept: connected lavender SM letters with a lime tabletop on midnight.

- Source: `design/logo-concepts/refined/lavender-v2.png`.
- `app-icon.png`: opaque 1024 px master for native and web launcher icons.
- `seatmap-mark.png`: tightly framed artwork used in the discovery header and sign-in screen.
- Reproduce crops and all icon sizes: `python3 tool/generate_icons.py` (Pillow).

Original artwork was created with the built-in image generation tool; its full prompt is saved in `design/logo-concepts/refined/prompts.json`. Asset preparation only crops and resizes that artwork.

## Native launch animation

The 2,800 ms cold-launch sequence is drawn in Flutter with native paths in `lib/ui/brand/`. `seatmap_monogram.dart` follows the approved PNG's connected S/M silhouette and separate lime tabletop. `seatmap_initial_paths.dart` contains outlines from the bundled Inter font (weight 700, optical size 32), covered by `assets/fonts/OFL-Inter.txt`. The animation fades the remaining letters of “SeatMap”, morphs S/M into the monogram and moves the underline into its tabletop. It uses no video, downloaded animation, or additional artwork.

The sequence runs once per app launch and does not replay when returning from the background. Tapping continues immediately; reduced motion uses a 200 ms static mark. Account and restaurant data load concurrently behind the animation.

The launcher and header PNGs are unchanged. iOS and Android launch backgrounds use SeatMap midnight `#10101D`; the former static iOS `LaunchImage` is no longer referenced by the launch storyboard, avoiding a second logo before the animation.

Run these optional visual captures from `mobile/`:

```sh
flutter test test/launch_intro_test.dart --dart-define=CAPTURE_LAUNCH=true
flutter test test/launch_intro_test.dart --dart-define=CAPTURE_LAUNCH_MOTION=true
```

The first command writes five key frames to `.local/launch-*.png`. The second writes a 30 fps sequence from 0–3 seconds to `.local/launch-motion/frame-000.png` through `frame-090.png`, including the transition into the offline demo discovery screen. Both use bundled fonts and assets without contacting the API.
