import CofeinMapPreview from '../floorplan/CofeinMapPreview';
import { cofeinViewLabel } from '../../domain/floorPlans/cofeinGeometry';
import './cofein-admin-halls.css';

const COPY = {
  bg: { hall: 'Зала', parts: 'Части на залата', tables: 'маси', overview: 'Общ план', mode: 'Изглед на картата', whole: 'Цялата карта', sections: 'По секции', allHalls: 'Всички отворени зали' },
  en: { hall: 'Hall', parts: 'Hall sections', tables: 'tables', overview: 'Whole plan', mode: 'Map view', whole: 'Whole map', sections: 'By section', allHalls: 'All open halls' },
  ru: { hall: 'Зал', parts: 'Части зала', tables: 'столов', overview: 'Общий план', mode: 'Вид карты', whole: 'Вся карта', sections: 'По секциям', allHalls: 'Все открытые залы' },
};

/** Hall is a business choice; the second row changes only the camera. */
export default function CofeinAdminHallNavigation({ geometry, tables, zones, activeZone, onZoneChange, views, activeViewId, onViewChange, language = 'bg', controls, allowOverview = false, selectionSummary, viewMode = 'section', onViewModeChange }) {
  const text = COPY[language] || COPY.bg;
  const sectioned = !onViewModeChange || viewMode === 'section';
  return <div className="cofein-admin-halls">
    {onViewModeChange ? <div className="cofein-admin-view-toolbar">
      <div className="cofein-admin-view-modes" role="group" aria-label={text.mode}>
        {[["scroll", text.whole], ["section", text.sections]].map(([mode, label]) => <button key={mode} type="button" data-admin-map-mode={mode} aria-pressed={viewMode === mode} onClick={() => onViewModeChange(mode)}>{label}</button>)}
      </div>
      {controls ? <div className="cofein-admin-camera-controls">{controls}</div> : null}
    </div> : null}
    {sectioned ? <div className="cofein-admin-halls-header">
      <div className="cofein-admin-hall-choice">
        <span className="cofein-admin-hall-label">{text.hall}</span>
        {zones.length > 4 ? <select aria-label={text.hall} value={activeZone} onChange={event => onZoneChange(event.target.value)}>
          {zones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
        </select> : <div className="cofein-admin-hall-buttons" role="group" aria-label={text.hall}>
          {zones.map(zone => <button key={zone.id} type="button" aria-pressed={activeZone === zone.id} onClick={() => onZoneChange(zone.id)}>{zone.name}</button>)}
        </div>}
      </div>
      {controls && !onViewModeChange ? <div className="cofein-admin-camera-controls">{controls}</div> : null}
    </div> : <p className="cofein-admin-map-overview-label">{text.allHalls} · {tables?.length || 0} {text.tables}</p>}
    {sectioned ? <div className="cofein-admin-hall-parts" role="group" aria-label={text.parts}>
      {views.map(view => <button key={view.id} type="button" aria-pressed={activeViewId === view.id} onClick={() => onViewChange(view.id)} data-admin-map-part={view.id}>
        <span className="cofein-admin-part-preview"><CofeinMapPreview geometry={geometry} view={view} tables={tables} language={language} /></span>
        <span><strong>{cofeinViewLabel(view, language)}</strong><small>{view.tableIds?.length || 0} {text.tables}</small></span>
      </button>)}
      {allowOverview ? <button type="button" className="cofein-admin-plan-overview" aria-pressed={activeViewId === 'all'} onClick={() => onViewChange('all')}>{text.overview}</button> : null}
    </div> : null}
    {selectionSummary ? <p className="cofein-admin-hall-selection" role="status">{selectionSummary}</p> : null}
  </div>;
}
