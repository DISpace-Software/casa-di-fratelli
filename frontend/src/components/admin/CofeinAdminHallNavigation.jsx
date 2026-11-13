import CofeinMapPreview from '../floorplan/CofeinMapPreview';
import { cofeinViewLabel } from '../../domain/floorPlans/cofeinGeometry';
import './cofein-admin-halls.css';

const COPY = {
  bg: { hall: 'Зала', parts: 'Части на залата', tables: 'маси', overview: 'Общ план' },
  en: { hall: 'Hall', parts: 'Hall sections', tables: 'tables', overview: 'Whole plan' },
  ru: { hall: 'Зал', parts: 'Части зала', tables: 'столов', overview: 'Общий план' },
};

/** Hall is a business choice; the second row changes only the camera. */
export default function CofeinAdminHallNavigation({ geometry, tables, zones, activeZone, onZoneChange, views, activeViewId, onViewChange, language = 'bg', controls, allowOverview = false, selectionSummary }) {
  const text = COPY[language] || COPY.bg;
  return <div className="cofein-admin-halls">
    <div className="cofein-admin-halls-header">
      <div className="cofein-admin-hall-choice">
        <span className="cofein-admin-hall-label">{text.hall}</span>
        {zones.length > 4 ? <select aria-label={text.hall} value={activeZone} onChange={event => onZoneChange(event.target.value)}>
          {zones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
        </select> : <div className="cofein-admin-hall-buttons" role="group" aria-label={text.hall}>
          {zones.map(zone => <button key={zone.id} type="button" aria-pressed={activeZone === zone.id} onClick={() => onZoneChange(zone.id)}>{zone.name}</button>)}
        </div>}
      </div>
      {controls ? <div className="cofein-admin-camera-controls">{controls}</div> : null}
    </div>
    <div className="cofein-admin-hall-parts" role="group" aria-label={text.parts}>
      {views.map(view => <button key={view.id} type="button" aria-pressed={activeViewId === view.id} onClick={() => onViewChange(view.id)} data-admin-map-part={view.id}>
        <span className="cofein-admin-part-preview"><CofeinMapPreview geometry={geometry} view={view} tables={tables} language={language} /></span>
        <span><strong>{cofeinViewLabel(view, language)}</strong><small>{view.tableIds?.length || 0} {text.tables}</small></span>
      </button>)}
      {allowOverview ? <button type="button" className="cofein-admin-plan-overview" aria-pressed={activeViewId === 'all'} onClick={() => onViewChange('all')}>{text.overview}</button> : null}
    </div>
    {selectionSummary ? <p className="cofein-admin-hall-selection" role="status">{selectionSummary}</p> : null}
  </div>;
}
