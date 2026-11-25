/** Draft layout editor. Saving and cross-client reconciliation belong to the parent layout session. */
import { hasLayoutOverlap } from '../../../admin/presentation/layout.js';
import React from 'react';
import { tenantContext } from '../../../config/tenantRuntime';
import { getCofeinMapGeometry, getCofeinBookingViews } from '../../../domain/floorPlans/cofeinGeometry';
import { getZoneName } from '../../../domain/reservations/floorPlanNames';
import { rotatePercentPointCounterClockwise, rotatePercentPointClockwise, rotatePercentPointHalfTurn } from '../../../domain/adminMap/mapCamera';
import { Panel } from '../AdminPrimitives.jsx';
import CofeinAdminHallNavigation from '../CofeinAdminHallNavigation';
import CofeinMapExplorer from '../../floorplan/CofeinMapExplorer';
import { AdminMapDecor } from './AdminMapDecor.jsx';

export function TableLayoutEditor({
  zones,
  language,
  text,
  layout,
  selectedArea,
  mapViewMode,
  onMapViewModeChange,
  onAreaChange,
  onUpdate,
  onAdd,
  onRemove,
  onSave,
  saveDisabled = false,
}) {
  const mapRef = React.useRef(null);
  const [draggingId, setDraggingId] = React.useState(null);
  const [selectedTableId, setSelectedTableId] = React.useState("");
  const [spatialView, setSpatialView] = React.useState("");
  const cofeinSpatial = tenantContext.tenantId === "cofein";
  // Inactive halls and tables still belong to the editable draft. These copies
  // affect camera geometry only; saving always uses the original layout.
  const editorZones = React.useMemo(() => cofeinSpatial ? zones.map(zone => ({ ...zone, isActive: true })) : zones, [cofeinSpatial, zones]);
  const editorGeometry = React.useMemo(() => cofeinSpatial ? getCofeinMapGeometry(editorZones, layout) : null, [cofeinSpatial, editorZones, layout]);
  const editorViews = React.useMemo(() => cofeinSpatial ? getCofeinBookingViews(editorGeometry, selectedArea, layout.map(table => ({ ...table, isActive: true }))) : [], [cofeinSpatial, editorGeometry, selectedArea, layout]);
  const editorView = spatialView === "all" ? editorGeometry?.views.all : editorViews.find(view => view.id === spatialView) || editorViews[0] || editorGeometry?.views[`zone:${selectedArea}`];
  const areas = zones.map(zone => [zone.id, getZoneName(zone, zone.presentation?.startsWith("casa-") ? "bg" : language)]);
  const presentation = zones.find(zone => zone.id === selectedArea)?.presentation || "plain";
  const areaTables = layout.filter((item) => item.area === selectedArea);
  const activeAreaTables = areaTables.filter((item) => item.isActive);
  const selectedTable = areaTables.find((item) => item.id === selectedTableId) || areaTables[0];

  React.useEffect(() => {
    setSelectedTableId(current => layout.some(table => table.id === current && table.area === selectedArea) ? current : "");
  }, [selectedArea, layout]);

  const moveTable = (tableId, clientX, clientY) => {
    const box = mapRef.current?.getBoundingClientRect();
    if (!box) return;

    const displayPoint = {
      x: Math.min(94, Math.max(6, ((clientX - box.left) / box.width) * 100)),
      y: Math.min(94, Math.max(6, ((clientY - box.top) / box.height) * 100)),
    };
    const storedPoint = presentation === "casa-garden"
      ? rotatePercentPointCounterClockwise(displayPoint)
      : presentation === "casa-indoor"
      ? rotatePercentPointClockwise(displayPoint)
      : presentation === "casa-terrace"
      ? rotatePercentPointHalfTurn(displayPoint)
      : displayPoint;
    const current = layout.find((item) => item.id === tableId);
    if (!current) return;

    const next = {
      ...current,
      x: Number(storedPoint.x.toFixed(1)),
      y: Number(storedPoint.y.toFixed(1)),
    };
    if (hasLayoutOverlap(layout, next)) return;

    onUpdate(tableId, next);
  };

  return (
    <Panel
      title={text.title}
      subtitle={text.subtitle}
      right={
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onAdd} className="luxury-button rounded-full px-4 py-2 text-sm">
            {text.add}
          </button>
          <button type="button" onClick={onSave} disabled={saveDisabled} className="luxury-button rounded-full px-4 py-2 text-sm disabled:opacity-40">
            {text.save}
          </button>
        </div>
      }
    >
      <div className="mb-5 rounded-2xl border border-[#c9a56a]/18 bg-black/20 p-4">
        <div className="section-kicker text-[10px]">Изглед на оперативната карта</div>
        <p className="mt-1 text-sm text-white/55">
          Изберете как да се отваря картата за резервации и преместване на гости.
        </p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Изглед на картата">
          {[
            ["section", "По секции"],
            ["scroll", cofeinSpatial ? "Цялата карта" : "Скрол карта"],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                onMapViewModeChange(mode);
                if (cofeinSpatial) setSpatialView(mode === "scroll" ? "all" : "");
              }}
              aria-pressed={mapViewMode === mode}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                mapViewMode === mode ? "luxury-button" : "ghost-button"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
        <div className="min-w-0">
          {cofeinSpatial ? <CofeinAdminHallNavigation
            geometry={editorGeometry}
            tables={layout}
            zones={areas.map(([id, name]) => ({ id, name }))}
            activeZone={selectedArea}
            onZoneChange={area => { onAreaChange(area); setSpatialView(""); }}
            views={editorViews}
            activeViewId={editorView?.id}
            onViewChange={setSpatialView}
            language={language}
            allowOverview
          /> : <div className="mb-4 flex flex-wrap gap-2">
            {areas.map(([area, label]) => (
              <button
                key={area}
                type="button"
                onClick={() => {
                  onAreaChange(area);
                }}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  selectedArea === area ? "luxury-button" : "ghost-button"
                }`}
              >
                {label}
              </button>
            ))}
          </div>}

          {cofeinSpatial ? <CofeinMapExplorer
            zones={editorZones}
            geometryTables={layout}
            tables={layout}
            states={Object.fromEntries(layout.map(table => [table.id, { status: table.isActive ? "available" : "unavailable", selectable: true }]))}
            selectedIds={selectedTable ? [selectedTable.id] : []}
            viewId={editorView?.id}
            cameraView={editorView}
            hideNavigation
            language={language}
            onTableSelect={table => { onAreaChange(table.area); setSelectedTableId(table.id); }}
            onTableMove={(table, point) => {
              const current = layout.find(item => item.id === table.id);
              if (!current) return;
              if (selectedArea !== table.area) onAreaChange(table.area);
              setSelectedTableId(table.id);
              const next = { ...current, x: Number(point.x.toFixed(2)), y: Number(point.y.toFixed(2)) };
              if (!hasLayoutOverlap(layout, next)) onUpdate(table.id, next);
            }}
          /> : <div
            ref={mapRef}
            className={`relative min-h-[560px] overflow-hidden rounded-[26px] border border-white/10 ${
              presentation === "casa-garden"
                ? "bg-[radial-gradient(circle_at_top,_rgba(60,169,126,0.13),_transparent_34%),linear-gradient(180deg,rgba(34,40,28,0.96),rgba(16,18,13,0.96))] sm:aspect-[1.6/1] sm:min-h-0"
                : presentation === "casa-terrace"
                ? "bg-[radial-gradient(circle_at_top,_rgba(110,231,183,0.13),_transparent_34%),radial-gradient(circle_at_50%_100%,rgba(201,165,106,0.13),transparent_38%),linear-gradient(180deg,rgba(30,34,25,0.96),rgba(14,16,11,0.96))]"
                : "bg-[radial-gradient(circle_at_top,_rgba(201,165,106,0.16),_transparent_34%),radial-gradient(circle_at_18%_60%,rgba(125,211,252,0.08),transparent_25%),linear-gradient(180deg,rgba(39,27,21,0.96),rgba(16,12,10,0.96))] sm:aspect-[1.6/1] sm:min-h-0"
            }`}
            onPointerMove={(event) => {
              if (!draggingId) return;
              moveTable(draggingId, event.clientX, event.clientY);
            }}
            onPointerUp={() => setDraggingId(null)}
            onPointerCancel={() => setDraggingId(null)}
          >
            <div className="absolute inset-5 rounded-[22px] border border-[#c9a56a]/14 bg-[linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[length:42px_42px]" />
            <AdminMapDecor area={selectedArea} presentation={presentation} />

            {activeAreaTables.map((table) => {
              const displayPoint = presentation === "casa-garden"
                ? rotatePercentPointClockwise(table)
                : presentation === "casa-indoor"
                ? rotatePercentPointCounterClockwise(table)
                : presentation === "casa-terrace"
                ? rotatePercentPointHalfTurn(table)
                : table;

              return (
                <button
                key={table.id}
                type="button"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setSelectedTableId(table.id);
                  setDraggingId(table.id);
                }}
                className={`absolute z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-xl border text-xs font-semibold shadow-2xl transition hover:scale-105 md:h-14 md:w-14 md:rounded-2xl md:text-sm ${
                  selectedTable?.id === table.id
                    ? "border-[#f2d39a] bg-[linear-gradient(145deg,#f6d99e,#b88b4d)] text-black"
                    : "border-[#c9a56a]/40 bg-[linear-gradient(145deg,#5a4332,#2a1f18)] text-white"
                }`}
                style={{ left: `${displayPoint.x}%`, top: `${displayPoint.y}%` }}
              >
                {table.id}
              </button>
              );
            })}
          </div>}
        </div>

        <div className="min-w-0 space-y-3">
          <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">
            {text.overlap}
          </div>

          <div className="max-h-[230px] overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-2">
            {areaTables.map((table) => (
              <button
                key={table.id}
                type="button"
                onClick={() => {
                  setSelectedTableId(table.id);
                  if (cofeinSpatial) setSpatialView(editorViews.find(view => view.tableIds.includes(table.id))?.id || "");
                }}
                className={`mb-2 flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition last:mb-0 ${
                  selectedTable?.id === table.id
                    ? "border-[#f2d39a]/50 bg-[#c9a56a]/16 text-[#fff4df]"
                    : "border-white/10 bg-white/[0.03] text-white/70 hover:border-[#c9a56a]/35"
                }`}
              >
                <span className="font-semibold">{table.id}</span>
                <span className="text-xs text-white/45">{table.seats} seats · {Math.round(table.x)}, {Math.round(table.y)}</span>
              </button>
            ))}
          </div>

          {selectedTable ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-[#c9a56a]">Table</div>
                  <div className="mt-1 text-2xl font-semibold text-[#fff4df]">{selectedTable.id}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(selectedTable.id)}
                  className="rounded-full border border-red-300/20 px-3 py-1 text-xs text-red-200"
                >
                  {text.remove}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                  <label className="col-span-2 text-xs text-white/55">
                    {text.tableNumber}
                    <input name="layoutTable.id"
                      type="text"
                      value={selectedTable.id}
                      onChange={(event) => {
                        const nextId = event.target.value.trim();
                        onUpdate(selectedTable.id, { ...selectedTable, id: nextId });
                        if (nextId) setSelectedTableId(nextId);
                      }}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="text-xs text-white/55">
                    X
                    <input name="layoutTable.x"
                      type="number"
                      min="5"
                      max="95"
                      value={selectedTable.x}
                      onChange={(event) => onUpdate(selectedTable.id, { ...selectedTable, x: Number(event.target.value) })}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="text-xs text-white/55">
                    Y
                    <input name="layoutTable.y"
                      type="number"
                      min="5"
                      max="95"
                      value={selectedTable.y}
                      onChange={(event) => onUpdate(selectedTable.id, { ...selectedTable, y: Number(event.target.value) })}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="text-xs text-white/55">
                    {text.seats}
                    <input name="layoutTable.seats"
                      type="number"
                      min="1"
                      max="500"
                      value={selectedTable.seats}
                      onChange={(event) => onUpdate(selectedTable.id, { ...selectedTable, seats: Number(event.target.value) })}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="flex items-end gap-2 text-xs text-white/70">
                    <input name="layoutTable.isActive"
                      type="checkbox"
                      checked={selectedTable.isActive}
                      onChange={(event) => onUpdate(selectedTable.id, { ...selectedTable, isActive: event.target.checked })}
                    />
                    {text.active}
                  </label>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/55">
              Select a table from the list.
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

