# Unified administrative reservation map

The administrative reservation screen renders every restaurant area in one
virtual coordinate space. The public reservation map and the separate table
layout editor are not affected.

## Coordinates

`frontend/src/domain/adminMap/mapConfig.js` defines:

- `ADMIN_MAP_WORLD`: the virtual restaurant width and height;
- `ADMIN_MAP_ZONES`: each area's `x`, `y`, `width`, and `height` in that world;
- `ADMIN_MAP_CAMERA`: scale limits, zoom step, fit padding, pan overscan, and
  camera persistence.

Table coordinates remain the existing percentages relative to their area.
`localPercentToWorld(zone, table)` converts them for unified rendering:

```text
worldX = zone.x + table.x / 100 * zone.width
worldY = zone.y + table.y / 100 * zone.height
```

This keeps existing saved layouts compatible. Moving an area in the unified
map only requires changing its rectangle in `ADMIN_MAP_ZONES`.

## Camera and gestures

`UnifiedMapViewport.jsx` owns camera state independently of reservations and
layout data. One GPU-friendly `translate3d(...) scale(...)` transform is
applied to the world layer. Pointer movement is scheduled with
`requestAnimationFrame`, so tables do not receive React state updates on every
frame.

Supported navigation:

- pointer or one-finger drag to pan;
- two-finger pinch, mouse wheel, or Ctrl/Cmd + wheel to zoom around the gesture;
- two-dimensional trackpad scroll to pan;
- zoom in, zoom out, fit, reset, and focus-zone controls.

The first visit fits the entire restaurant. If camera persistence is enabled,
later visits restore the last position. Resize and device rotation preserve
the logical world point at the center of the viewport.

## Configuration

The current camera defaults are:

```js
minScale: 0.35
maxScale: 3
zoomStep: 0.15
```

Set `persistCamera` to `false` in `ADMIN_MAP_CAMERA` to always start with
`fitToMap`.
