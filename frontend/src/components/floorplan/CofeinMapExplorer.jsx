import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import CofeinArchitecture from './CofeinArchitecture.jsx';
import CofeinTableVisual from './CofeinTableVisual.jsx';
import { COFEIN_MAP_VIEWS, COFEIN_MAP_WORLD, projectCofeinTable, unprojectCofeinPoint } from '../../domain/floorPlans/cofeinGeometry.js';
import { clampCamera, fitBounds, pinchCamera, preserveWorldCenter, zoomCameraAt } from '../../domain/adminMap/mapCamera.js';
import './cofein-explorer.css';

const MIN_SCALE = 0.12;
const MAX_SCALE = 3;
const FRAGMENTS = ['all', 'exterior-upper', 'exterior-lower', 'interior-main', 'interior-angled'];
const COPY = {
  bg: { views: ['Цялата карта', 'Външна · горна', 'Външна · долна', 'Вътрешна · основна', 'Вътрешна · ъглова'], sections: 'Разгледайте част от заведението', zoom: 'Мащаб на картата', increase: 'Увеличи картата', decrease: 'Намали картата', fit: 'Покажи целия избран изглед', map: 'Интерактивна карта на Cofein', table: 'Маса', seats: 'места', unknown: 'Изберете дата и час за проверка', instructions: 'Изберете част за по-близък изглед. Плъзнете картата или увеличете с два пръста. С клавиатура: стрелки, + / − и 0.', editInstructions: 'Плъзнете маса, за да промените позицията ѝ. При фокус върху маса използвайте стрелките. Плъзнете свободна част на картата за преглед.' },
  en: { views: ['Whole map', 'Exterior · upper', 'Exterior · lower', 'Interior · main', 'Interior · angled'], sections: 'Explore a part of the restaurant', zoom: 'Map zoom', increase: 'Zoom in', decrease: 'Zoom out', fit: 'Fit selected view', map: 'Interactive Cofein floor plan', table: 'Table', seats: 'seats', unknown: 'Choose a date and time to check availability', instructions: 'Choose an area for a closer view. Drag the map or pinch to zoom. Keyboard: arrows, + / − and 0.', editInstructions: 'Drag a table to change its position, or focus it and use the arrow keys. Drag an empty part of the map to explore.' },
  ru: { views: ['Вся карта', 'Внешняя · верхняя', 'Внешняя · нижняя', 'Внутренняя · основная', 'Внутренняя · угловая'], sections: 'Выберите часть ресторана', zoom: 'Масштаб карты', increase: 'Увеличить карту', decrease: 'Уменьшить карту', fit: 'Показать выбранную часть целиком', map: 'Интерактивная карта Cofein', table: 'Стол', seats: 'мест', unknown: 'Выберите дату и время для проверки', instructions: 'Выберите часть для подробного просмотра. Перемещайте карту или увеличивайте двумя пальцами. Клавиатура: стрелки, + / − и 0.', editInstructions: 'Перетащите стол, чтобы изменить его положение, или выделите его и используйте стрелки. Перемещайте карту за свободный участок.' },
};
const centered = (points) => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
const distance = (points) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);

/** Architecture is presentation; availability and selectable IDs always come from the caller. */
export default function CofeinMapExplorer({ tables, states = {}, selectedIds = [], onTableSelect, onTableMove, viewId = 'all', onViewChange, language = 'bg' }) {
  const viewportRef = useRef(null);
  const worldRef = useRef(null);
  const cameraRef = useRef({ x: 0, y: 0, scale: 1 });
  const sizeRef = useRef({ width: 1, height: 1 });
  const hasMeasuredViewport = useRef(false);
  const boundsRef = useRef(COFEIN_MAP_VIEWS.all);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const frameRef = useRef(0);
  const pendingCamera = useRef(null);
  const editingTableRef = useRef(null);
  const pendingEdit = useRef(null);
  const suppressClickUntil = useRef(0);
  const [scaleLabel, setScaleLabel] = useState(100);
  const [isDragging, setIsDragging] = useState(false);
  const instructionsId = useId();
  const selectedSet = new Set(selectedIds);
  const text = COPY[language] || COPY.bg;

  const applyCamera = useCallback((value, announce = false) => {
    const next = clampCamera(value, sizeRef.current, COFEIN_MAP_WORLD, 32);
    cameraRef.current = next;
    if (worldRef.current) worldRef.current.style.transform = `translate3d(${next.x}px, ${next.y}px, 0) scale(${next.scale})`;
    if (announce) setScaleLabel(Math.round(next.scale * 100));
  }, []);

  const fit = useCallback(() => {
    applyCamera(fitBounds(boundsRef.current, sizeRef.current, 24, MIN_SCALE, MAX_SCALE), true);
  }, [applyCamera]);

  useLayoutEffect(() => {
    boundsRef.current = COFEIN_MAP_VIEWS[viewId] || COFEIN_MAP_VIEWS.all;
    fit();
  }, [viewId, fit]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const resize = () => {
      const rect = viewport.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const previous = sizeRef.current;
      const next = { width: rect.width, height: rect.height };
      if (hasMeasuredViewport.current && Math.abs(previous.width - next.width) < 0.5 && Math.abs(previous.height - next.height) < 0.5) return;
      sizeRef.current = next;
      if (!hasMeasuredViewport.current) {
        hasMeasuredViewport.current = true;
        fit();
      } else {
        applyCamera(preserveWorldCenter(cameraRef.current, previous, next), true);
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fit, applyCamera]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const wheel = (event) => {
      // Ordinary scrolling continues to move the booking dialog, especially on trackpads.
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      applyCamera(zoomCameraAt(cameraRef.current, { x: event.clientX - rect.left, y: event.clientY - rect.top },
        cameraRef.current.scale * Math.exp(-event.deltaY * 0.008), MIN_SCALE, MAX_SCALE), true);
    };
    viewport.addEventListener('wheel', wheel, { passive: false });
    return () => {
      viewport.removeEventListener('wheel', wheel);
      cancelAnimationFrame(frameRef.current);
    };
  }, [applyCamera]);

  const point = (event) => {
    const rect = viewportRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  function startGesture() {
    const points = [...pointersRef.current.values()];
    gestureRef.current = { camera: { ...cameraRef.current }, points, moved: points.length > 1 };
  }

  function pointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // Block the click synthesized by a drag, but never the next deliberate tap.
    if (pointersRef.current.size === 0) suppressClickUntil.current = 0;
    pointersRef.current.set(event.pointerId, point(event));
    startGesture();
    const tableId = event.target.closest?.('[data-table-id]')?.dataset.tableId;
    const table = onTableMove && tables.find((item) => item.id === tableId);
    const placement = table && projectCofeinTable(table);
    editingTableRef.current = placement && pointersRef.current.size === 1 ? { table, placement } : null;
    if (pointersRef.current.size > 1) {
      suppressClickUntil.current = Date.now() + 600;
      setIsDragging(true);
    }
  }

  function pointerMove(event) {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, point(event));
    const gesture = gestureRef.current;
    const points = [...pointersRef.current.values()];
    if (!gesture || points.length !== gesture.points.length) return;
    const delta = { x: points[0].x - gesture.points[0].x, y: points[0].y - gesture.points[0].y };
    if (!gesture.moved && Math.hypot(delta.x, delta.y) < 6) return;
    gesture.moved = true;
    suppressClickUntil.current = Date.now() + 600;
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (editingTableRef.current && points.length === 1) {
      const { table, placement } = editingTableRef.current;
      const next = unprojectCofeinPoint(table.area, { x: placement.x + delta.x / gesture.camera.scale, y: placement.y + delta.y / gesture.camera.scale });
      if (next) pendingEdit.current = { table, point: next };
    } else {
      pendingCamera.current = points.length > 1
        ? pinchCamera(gesture.camera, centered(gesture.points), centered(points), distance(points) / Math.max(1, distance(gesture.points)), MIN_SCALE, MAX_SCALE)
        : { ...gesture.camera, x: gesture.camera.x + delta.x, y: gesture.camera.y + delta.y };
    }
    if (!frameRef.current) frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      if (pendingCamera.current) applyCamera(pendingCamera.current);
      if (pendingEdit.current) { onTableMove?.(pendingEdit.current.table, pendingEdit.current.point); pendingEdit.current = null; }
    });
  }

  function pointerEnd(event) {
    if (!pointersRef.current.has(event.pointerId)) return;
    if (gestureRef.current?.moved) suppressClickUntil.current = Date.now() + 600;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    if (pendingCamera.current) applyCamera(pendingCamera.current, true);
    if (pendingEdit.current) onTableMove?.(pendingEdit.current.table, pendingEdit.current.point);
    pendingCamera.current = null;
    pendingEdit.current = null;
    editingTableRef.current = null;
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (pointersRef.current.size) startGesture();
    else { gestureRef.current = null; setIsDragging(false); }
  }

  function zoom(multiplier) {
    applyCamera(zoomCameraAt(cameraRef.current, { x: sizeRef.current.width / 2, y: sizeRef.current.height / 2 }, cameraRef.current.scale * multiplier, MIN_SCALE, MAX_SCALE), true);
  }

  function ensureTableVisible(table) {
    const placement = projectCofeinTable(table);
    if (!placement) return;
    const viewport = sizeRef.current;
    const camera = cameraRef.current;
    const padding = 28;
    const left = camera.x + (placement.x - placement.width / 2) * camera.scale;
    const top = camera.y + (placement.y - placement.height / 2) * camera.scale;
    const right = left + placement.width * camera.scale;
    const bottom = top + placement.height * camera.scale;
    if (left >= padding && top >= padding && right <= viewport.width - padding && bottom <= viewport.height - padding) return;
    const scale = Math.max(MIN_SCALE, Math.min(camera.scale, (viewport.width - padding * 2) / placement.width, (viewport.height - padding * 2) / placement.height));
    applyCamera({ x: viewport.width / 2 - placement.x * scale, y: viewport.height / 2 - placement.y * scale, scale }, true);
  }

  function keyDown(event) {
    if (event.target !== event.currentTarget) return;
    const directions = { ArrowLeft: [48, 0], ArrowRight: [-48, 0], ArrowUp: [0, 48], ArrowDown: [0, -48] };
    if (directions[event.key]) {
      event.preventDefault();
      const [x, y] = directions[event.key];
      applyCamera({ ...cameraRef.current, x: cameraRef.current.x + x, y: cameraRef.current.y + y }, true);
    } else if (['+', '=', '-', '0', 'Home'].includes(event.key)) {
      event.preventDefault();
      if (event.key === '0' || event.key === 'Home') fit();
      else zoom(event.key === '-' ? 1 / 1.3 : 1.3);
    }
  }

  return <div className="cofein-map-explorer">
    <div className="cofein-map-views" role="group" aria-label={text.sections}>
      {FRAGMENTS.map((key, index) => <button type="button" key={key} aria-pressed={viewId === key} onClick={() => onViewChange?.(key)}>{text.views[index]}</button>)}
    </div>
    <div className="cofein-map-surface">
      <div className="cofein-map-tools" role="group" aria-label={text.zoom}>
        <button type="button" onClick={() => zoom(1.3)} aria-label={text.increase}>+</button>
        <button type="button" onClick={() => zoom(1 / 1.3)} aria-label={text.decrease}>−</button>
        <button type="button" onClick={fit} aria-label={text.fit}><svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M7 3H3v4m10-4h4v4M3 13v4h4m10-4v4h-4" stroke="currentColor" strokeWidth="1.6" /></svg></button>
      </div>
      <div ref={viewportRef} className={`cofein-map-viewport${isDragging ? ' is-dragging' : ''}`} role="region" tabIndex={0} aria-label={text.map} aria-describedby={instructionsId}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}
        onLostPointerCapture={(event) => {
          // Touch starts with implicit capture on a child. Transferring capture
          // to the viewport emits a bubbling loss from that child, not an end.
          if (event.target === event.currentTarget) pointerEnd(event);
        }}
        onClickCapture={(event) => { if (Date.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); } }} onKeyDown={keyDown}>
        <div ref={worldRef} className="cofein-map-world" style={{ width: COFEIN_MAP_WORLD.width, height: COFEIN_MAP_WORLD.height }}>
          <CofeinArchitecture language={language} />
          {tables.map((table) => {
            const placement = projectCofeinTable(table);
            if (!placement) return null;
            const state = states[table.id] || { status: 'unknown', selectable: false, label: text.unknown };
            const selected = selectedSet.has(table.id);
            return <button key={table.id} type="button" className="cofein-map-table-button" disabled={!state.selectable} aria-pressed={selected}
              aria-label={`${text.table} ${table.id}, ${table.seats} ${text.seats}${state.label ? `, ${state.label}` : ''}`} title={`${text.table} ${table.id} · ${table.seats} ${text.seats}${state.label ? ` · ${state.label}` : ''}`}
              data-table-id={table.id} data-status={state.status} data-map-status={state.status} style={{ left: placement.x, top: placement.y, width: placement.width, height: placement.height }}
              onClick={() => { if (state.selectable) onTableSelect?.(table); }}
              onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) ensureTableVisible(table); }}
              onKeyDown={(event) => {
                if (!onTableMove || !state.selectable || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
                event.preventDefault(); event.stopPropagation();
                const step = event.shiftKey ? 2 : 0.5;
                const next = { x: Math.max(5, Math.min(95, table.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0))), y: Math.max(5, Math.min(95, table.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0))) };
                onTableMove(table, next);
                ensureTableVisible({ ...table, ...next });
              }}>
              <CofeinTableVisual table={table} placement={placement} status={state.status} selected={selected} />
            </button>;
          })}
        </div>
      </div>
      <span className="cofein-map-scale" aria-hidden="true">{scaleLabel}%</span>
    </div>
    <p id={instructionsId} className="cofein-map-instructions">{onTableMove ? text.editInstructions : text.instructions}</p>
  </div>;
}
