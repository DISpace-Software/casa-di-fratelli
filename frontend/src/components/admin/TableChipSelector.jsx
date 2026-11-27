import { useFloorPlan } from '../../context/FloorPlanContext';
import { getActiveLayoutTables, canUseAdminTableSelection as canUseAdminTableSelectionRule } from '../../domain/reservations/adminPlanRules';

export function TableChipSelector({
  area,
  selectedTableIds,
  onToggle,
  unavailableTableIds = new Set(),
  hideUnavailable = false,
  emptyMessage = "No free tables for this time.",
  requiredSeats = 0,
  tableIdsOverride,
  areaTables,
  suggestedTableIds = new Set(),
  bestTableIds = new Set(),
  staffSelection = false,
}) {
  const { plan } = useFloorPlan();
  areaTables = areaTables || getActiveLayoutTables(plan.tables, area);
  const tableIds = tableIdsOverride || areaTables.map((table) => table.id);
  const visibleTableIds = hideUnavailable
    ? tableIds.filter((tableId) => selectedTableIds.includes(tableId) || !unavailableTableIds.has(tableId))
    : tableIds;

  return (
    <div className="flex flex-wrap gap-2">
      {visibleTableIds.map((tableId) => {
        const selected = selectedTableIds.includes(tableId);
        const unavailable = !selected && unavailableTableIds.has(tableId);
        const suggested = suggestedTableIds.has(tableId);
        const best = bestTableIds.has(tableId);
        const allowed =
          !unavailable &&
          (selected ||
            canUseAdminTableSelectionRule(area, [...selectedTableIds, tableId], {
              combinations: plan.combinations,
              staffCombinationMode: staffSelection ? plan.staffCombinationMode : "configured",
              allowCapacityOverride: staffSelection,
              requiredSeats,
              allowPartial: true,
              ...(areaTables ? { areaTables } : {}),
            }));

        return (
          <button
            key={tableId}
            type="button"
            disabled={!allowed}
            onClick={() => onToggle(tableId)}
            title={unavailable ? "Reserved around this time" : tableId}
            className={`rounded-xl border px-3 py-2 text-xs transition ${
              selected
                ? "border-amber-300 bg-amber-400 text-black"
                : unavailable
                ? "cursor-not-allowed border-red-400/10 bg-red-500/5 text-red-200/35"
                : !allowed
                ? "cursor-not-allowed border-white/5 bg-black/10 text-white/25"
                : best
                ? "move-table-suggestion border-[#f2d39a]/70 bg-[#c9a56a]/22 text-[#fff4df]"
                : suggested
                ? "border-[#f2d39a]/45 bg-[#c9a56a]/14 text-[#f2d39a]"
                : "border-white/10 bg-black/20 text-white/65 hover:border-amber-300/50 hover:text-white"
            }`}
          >
            {tableId}
          </button>
        );
      })}
      {visibleTableIds.length === 0 && (
        <div className="rounded-2xl border border-red-400/15 bg-red-500/10 px-4 py-3 text-sm text-red-100/80">
          {emptyMessage}
        </div>
      )}
    </div>
  );
}

