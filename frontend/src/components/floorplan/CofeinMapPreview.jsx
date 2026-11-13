import { useId, useMemo } from 'react';
import CofeinFloorPlanDecor from './CofeinFloorPlanDecor.jsx';
import CofeinTableVisual from './CofeinTableVisual.jsx';
import { projectCofeinTable } from '../../domain/floorPlans/cofeinGeometry.js';

/** A static crop of the same plan as the interactive map. Its parent supplies
 * the button label and dimensions; this thumbnail has no separate controls. */
export default function CofeinMapPreview({ geometry, view, tables, language = 'bg' }) {
  const clipId = `cofein-preview-${useId().replace(/:/g, '')}`;
  const decor = useMemo(() => ({ ...geometry,
    zones: geometry.zones.filter(zone => zone.id === view?.zoneId),
    hasPreset: Boolean(geometry.zones.find(zone => zone.id === view?.zoneId)?.preset),
  }), [geometry, view?.zoneId]);
  if (!view) return null;
  const ids = new Set(view.tableIds || []);
  return <svg className="cofein-map-preview" viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
    preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"
    style={{ display: 'block', width: '100%', height: '100%', overflow: 'hidden', pointerEvents: 'none', background: '#eee5d6' }}>
    <defs><clipPath id={clipId}><rect x={view.x} y={view.y} width={view.width} height={view.height} /></clipPath></defs>
    {/* viewBox scales into the thumbnail but does not clip the letterbox margins. */}
    <g clipPath={`url(#${clipId})`}>
    <foreignObject x="0" y="0" width={geometry.world.width} height={geometry.world.height}>
      <div xmlns="http://www.w3.org/1999/xhtml" style={{ position: 'relative', width: geometry.world.width, height: geometry.world.height }}>
        <CofeinFloorPlanDecor geometry={decor} language={language} />
        {tables.filter(table => ids.has(table.id)).map(table => {
          const placement = projectCofeinTable(table, geometry);
          if (!placement) return null;
          return <div key={table.id} style={{ position: 'absolute', left: placement.x, top: placement.y, width: placement.width, height: placement.height, transform: 'translate(-50%, -50%)' }}>
            <CofeinTableVisual table={table} placement={placement} />
          </div>;
        })}
      </div>
    </foreignObject>
    </g>
  </svg>;
}
