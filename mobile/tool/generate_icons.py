"""Resize the approved lavender/lime SM artwork for Flutter, iOS, Android and web.

Source: design/logo-concepts/refined/lavender-v2.png (approved by the user).
Only crops/resizes are applied; the generated artwork is kept unchanged.
Requires Pillow. Run from any working directory.
"""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = Image.open(root / 'design/logo-concepts/refined/lavender-v2.png').convert('RGB')
# Optical framing keeps the connected letters and the lime tabletop comfortably
# inside the system's rounded-square and circular launcher masks.
icon = source.crop((70, 90, 1170, 1190)).resize((1024, 1024), Image.Resampling.LANCZOS)
brand = root / 'assets/brand'
brand.mkdir(parents=True, exist_ok=True)
icon.save(brand / 'app-icon.png')
mark = source.crop((195, 365, 1040, 930))
mark.resize((676, 452), Image.Resampling.LANCZOS).save(brand / 'seatmap-mark.png')

for density, size in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    folder_android = root / f'android/app/src/main/res/mipmap-{density}'
    icon.resize((size, size), Image.Resampling.LANCZOS).save(folder_android / 'ic_launcher.png')
    scale = size / 48
    mark.resize((round(180 * scale), round(120 * scale)), Image.Resampling.LANCZOS).save(folder_android / 'launch_image.png')
folder = root / 'ios/Runner/Assets.xcassets/AppIcon.appiconset'
for row in json.loads((folder / 'Contents.json').read_text())['images']:
    if 'filename' not in row:
        continue
    size = round(float(row['size'].split('x')[0]) * float(row['scale'].rstrip('x')))
    icon.resize((size, size), Image.Resampling.LANCZOS).save(folder / row['filename'])

launch = root / 'ios/Runner/Assets.xcassets/LaunchImage.imageset'
for scale in [1, 2, 3]:
    name = 'LaunchImage.png' if scale == 1 else f'LaunchImage@{scale}x.png'
    mark.resize((180 * scale, 120 * scale), Image.Resampling.LANCZOS).save(launch / name)
for size in [192, 512]:
    for name in [f'Icon-{size}.png', f'Icon-maskable-{size}.png']:
        icon.resize((size, size), Image.Resampling.LANCZOS).save(root / 'web/icons' / name)
icon.resize((48, 48), Image.Resampling.LANCZOS).save(root / 'web/favicon.png')
print('Generated approved SM brand assets and all launcher icon sizes.')
