"""Reproduce native/web icons from the simple SeatMap chair mark (requires Pillow)."""
import json
from pathlib import Path
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parents[1]
icon = Image.new('RGB', (1024, 1024), '#c0a8ff')
draw = ImageDraw.Draw(icon)
for points in [[(320,270),(320,730)],[(320,440),(645,440)],[(320,590),(740,590),(740,730)],[(550,440),(550,590)]]:
    draw.line(points, fill='#10101d', width=48, joint='curve')
    for x,y in [points[0],points[-1]]:
        draw.ellipse((x-24,y-24,x+24,y+24),fill='#10101d')
icon.save(root/'assets/brand/app-icon.png')
for density, size in {'mdpi':48,'hdpi':72,'xhdpi':96,'xxhdpi':144,'xxxhdpi':192}.items():
    icon.resize((size,size),Image.Resampling.LANCZOS).save(root/f'android/app/src/main/res/mipmap-{density}/ic_launcher.png')
folder=root/'ios/Runner/Assets.xcassets/AppIcon.appiconset'
for row in json.loads((folder/'Contents.json').read_text())['images']:
    if 'filename' not in row: continue
    size=round(float(row['size'].split('x')[0])*float(row['scale'].rstrip('x')))
    icon.resize((size,size),Image.Resampling.LANCZOS).save(folder/row['filename'])
for size in [192,512]:
    for name in [f'Icon-{size}.png',f'Icon-maskable-{size}.png']:
        icon.resize((size,size),Image.Resampling.LANCZOS).save(root/'web/icons'/name)
icon.resize((48,48),Image.Resampling.LANCZOS).save(root/'web/favicon.png')
