import { useId } from 'react';
import CofeinArchitecture from './CofeinArchitecture.jsx';
import { cofeinViewLabel } from '../../domain/floorPlans/cofeinGeometry.js';

/** One presentation layer for public booking, staff operations and the editor. */
export default function CofeinFloorPlanDecor({ geometry, language = 'bg' }) {
  const uid = useId().replace(/:/g, '');
  return <>
    {geometry.hasPreset && <div style={{ position: 'absolute', inset: '0 auto auto 0', width: 900, height: 1600, pointerEvents: 'none' }}>
      <CofeinArchitecture language={language} zones={geometry.zones} />
    </div>}
    <svg className="cofein-map-architecture" viewBox={`0 0 ${geometry.world.width} ${geometry.world.height}`} aria-hidden="true" focusable="false">
      <defs>
        <pattern id={`${uid}-annex-tiles`} width="44" height="44" patternUnits="userSpaceOnUse">
          <rect width="44" height="44" fill="#eee4d3" />
          <path d="M44 0H0V44" fill="none" stroke="#bba98b" strokeOpacity=".25" />
        </pattern>
      </defs>
      {geometry.zones.filter(zone => !zone.preset).map(zone => <g key={zone.id} data-map-zone={zone.id}>
        <rect x={zone.x} y={zone.y} width={zone.width} height={zone.height} rx="18" fill={`url(#${uid}-annex-tiles)`} stroke="#584f42" strokeWidth="9" />
        <path d={`M${zone.x + 18} ${zone.y + 78}H${zone.x + zone.width - 18}`} stroke="#bcaa8d" strokeWidth="2" />
        <foreignObject x={zone.x + 30} y={zone.y + 15} width={zone.width - 60} height="55">
          <div xmlns="http://www.w3.org/1999/xhtml" style={{ color: '#66513b', fontSize: 22, fontWeight: 700, textAlign: 'center', lineHeight: '26px', overflow: 'hidden', overflowWrap: 'anywhere', maxHeight: 52 }}>
            {cofeinViewLabel(geometry.views[zone.viewId], language)}
          </div>
        </foreignObject>
      </g>)}
    </svg>
  </>;
}
