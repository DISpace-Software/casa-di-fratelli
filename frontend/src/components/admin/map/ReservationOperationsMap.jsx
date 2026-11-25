/**
 * Operational map presentation and table-selection workflow.
 * Geometry and availability helpers produce UI affordances; server writes remain authoritative.
 * Selection is deliberately owned here so map camera changes do not reset dashboard filters.
 */
import { useFloorPlan } from '../../../context/FloorPlanContext';
import { useTenantBranding } from '../../../context/TenantBrandingContext';
import { tenantContext } from '../../../config/tenantRuntime';
import React from 'react';
import { getCofeinMapGeometry, getCofeinBookingViews, projectCofeinTable } from '../../../domain/floorPlans/cofeinGeometry';
import { buildMapGeometry } from '../../../domain/adminMap/mapConfig';
import { useSeasonalZones } from '../../../context/SeasonalZonesContext';
import { formatLocalDate, buildReservationsByTableForDate, getReservationMinutesFromNow } from '../../../domain/adminMap/liveReservations';
import { getZoneName } from '../../../domain/reservations/floorPlanNames';
import { getActiveLayoutTables, getMoveCandidateOptions, getAreaTablesCapacity, canUseAdminTableSelection as canUseAdminTableSelectionRule } from '../../../domain/reservations/adminPlanRules';
import { getRestaurantOccupancy } from '../../../domain/adminMap/occupancy';
import { buildLiveReservationsByTable, localizeReservationSaveError, getNextAdminReservationTime, getReservationTimingLabel, formatReservationLeadTime } from '../../../admin/presentation/reservations.js';
import { localPercentToWorld, rotatePercentPointHalfTurn, rotatePercentPointClockwise, rotatePercentPointCounterClockwise } from '../../../domain/adminMap/mapCamera';
import { hasUnseenGuestItems, getDiningItemStatusLabel } from '../../../admin/presentation/diningOrders.js';
import { getMenuCategoryGroups, normalizeCategory, getMenuItemName, getMenuItemKind } from '../../../admin/presentation/menu.js';
import { getValue } from '../../../admin/api/wireValue.js';
import { getUnavailableTableIdsForSlot } from '../../../domain/reservations/availability';
import { findPublicTableHold } from '../../../domain/reservations/publicTableHolds';
import { adminLocalText } from '../../../i18n/adminText.js';
import { sectionForAdminSelection } from '../../../domain/adminMap/mapViewMode';
import MapOverlay from '../MapOverlay';
import { getAvailableReservationTimesForDate } from '../../../domain/reservations/dateTimeRules';
import { adminReservationTimes } from '../../../domain/reservations/tableConfig';
import { Panel } from '../AdminPrimitives.jsx';
import UnifiedMapViewport from '../UnifiedMapViewport';
import CofeinFloorPlanDecor from '../../floorplan/CofeinFloorPlanDecor';
import { LegacyAdminMapDecor, AdminMapDecor } from './AdminMapDecor.jsx';
import CofeinTableVisual from '../../floorplan/CofeinTableVisual';
import { formatEuroAmount } from '../../../admin/presentation/formatters.js';
import { restaurantAssetUrl } from '../../../domain/adminMap/restaurantAssets';
import { isCasaTenant } from '../../../admin/tenant.js';

export function ReservationOperationsMap({
  text,
  language = "bg",
  layout,
  reservations,
  diningOrders,
  menuItems,
  selectedArea,
  onAreaChange,
  selectedDate,
  onDateChange,
  onArrived,
  onAddConsumptionItem,
  onUpdateConsumptionItem,
  onMove,
  onNoShow,
  onCancel,
  onOpenReservation,
  onOpenOrder,
  onSeatWalkIn,
  onCreateReservation,
  onEditReservation,
  onClaimReservation,
  onRelease,
  publicTableHolds = [],
  onBlockPublicTables,
  onRemovePublicTableHold,
  requireTableClaim = false,
  diningEnabled = true,
  ordersOnly = false,
  onExitMap,
  mapViewMode = "scroll",
  onMapViewModeChange,
}) {
  const { plan } = useFloorPlan();
  const { branding } = useTenantBranding();
  // Architecture changes presentation only. Identity, capacity and booking rules
  // continue to come from the restaurant's current floor-plan document.
  const cofeinSpatial = tenantContext.tenantId === "cofein";
  const cofeinWholeMap = cofeinSpatial && mapViewMode === "scroll";
  const legacySection = mapViewMode === "section" && !cofeinSpatial;
  const geometry = React.useMemo(() => cofeinSpatial
    ? getCofeinMapGeometry(plan.zones, plan.tables)
    : buildMapGeometry(plan.zones.filter(zone => zone.isActive)), [plan, cofeinSpatial]);
  const mapZones = geometry.zones;
  const { closedAreas, loaded: zonesLoaded } = useSeasonalZones();
  const [selectedReservationId, setSelectedReservationId] = React.useState(null);
  const [selectedTableId, setSelectedTableId] = React.useState(null);
  const [cofeinViewId, setCofeinViewId] = React.useState("");
  const [mapFocusRequestId, setMapFocusRequestId] = React.useState(0);
  const [moveReservationId, setMoveReservationId] = React.useState(null);
  const [moveDraft, setMoveDraft] = React.useState({ area: "", tableIds: [], guestCount: 0 });
  const [moveBusy, setMoveBusy] = React.useState(false);
  const [moveError, setMoveError] = React.useState("");
  const [showConsumption, setShowConsumption] = React.useState(false);
  const [consumptionSearch, setConsumptionSearch] = React.useState("");
  const [consumptionCategory, setConsumptionCategory] = React.useState("all");
  const [walkInDraft, setWalkInDraft] = React.useState(null);
  const [tableReservationDraft, setTableReservationDraft] = React.useState(null);
  const [reservationFormBusy, setReservationFormBusy] = React.useState(false);
  const [reservationFormError, setReservationFormError] = React.useState("");
  const reservationFormRef = React.useRef(null);
  const isReservationFormOpen = Boolean(tableReservationDraft);
  const consumptionPanelRef = React.useRef(null);
  const [now, setNow] = React.useState(() => new Date());
  const todayDate = formatLocalDate(now);
  const mapDate = selectedDate || todayDate;
  const isMapToday = mapDate === todayDate;
  const areas = React.useMemo(() => plan.zones.filter(zone => zone.isActive && !closedAreas.includes(zone.id)).map(zone => [zone.id, zone.presentation?.startsWith("casa-") ? text[zone.id] : getZoneName(zone, language)]), [plan, closedAreas, language, text]);
  React.useEffect(() => {
    if (!areas.some(([id]) => id === selectedArea)) {
      onAreaChange(areas[0]?.[0] || "");
      setSelectedReservationId(null);
      setSelectedTableId(null);
      setTableReservationDraft(null);
      setWalkInDraft(null);
    }
  }, [closedAreas, selectedArea, onAreaChange, areas]);
  const getAreaTableCount = (area) =>
    getActiveLayoutTables(layout, area).length;
  const getActiveTablesForArea = React.useCallback(
    (area) => (closedAreas.includes(area) ? [] : getActiveLayoutTables(layout, area))
      .map((table) => legacySection && table.area !== "openTerrace" ? table : orientTableForMap(table, plan.zones.find(zone => zone.id === table.area)?.presentation)),
    [layout, legacySection, closedAreas, plan]
  );
  const areaTables = React.useMemo(
    () => plan.zones.filter(zone => zone.isActive).map(zone => zone.id)
      .flatMap((area) => getActiveTablesForArea(area))
      .sort((first, second) => first.id.localeCompare(second.id, undefined, { numeric: true })),
    [getActiveTablesForArea, plan]
  );
  const cofeinViews = React.useMemo(() => cofeinSpatial ? getCofeinBookingViews(geometry, selectedArea, areaTables) : [], [cofeinSpatial, geometry, selectedArea, areaTables]);
  const cofeinView = cofeinWholeMap ? geometry.views.all
    : cofeinViews.find(view => view.id === cofeinViewId) || cofeinViews[0] || geometry.views?.[`zone:${selectedArea}`];
  const cofeinViewTableIds = React.useMemo(() => new Set(cofeinWholeMap ? areaTables.map(table => table.id) : cofeinView?.tableIds || []), [cofeinWholeMap, areaTables, cofeinView]);
  const cofeinDecorGeometry = React.useMemo(() => {
    if (!cofeinSpatial) return geometry;
    const visibleZones = geometry.zones.filter(zone => !closedAreas.includes(zone.id) && (cofeinWholeMap || zone.id === selectedArea));
    return { ...geometry, zones: visibleZones, hasPreset: visibleZones.some(zone => zone.preset) };
  }, [cofeinSpatial, cofeinWholeMap, geometry, selectedArea, closedAreas]);
  const occupancy = React.useMemo(
    () => getRestaurantOccupancy(layout, reservations, now, {
      closedAreas,
      activeZoneIds: plan.zones.filter(zone => zone.isActive).map(zone => zone.id),
    }),
    [layout, now, reservations, closedAreas, plan.zones]
  );
  const liveByTable = React.useMemo(
    () => isMapToday
      ? buildLiveReservationsByTable(reservations, now)
      : buildReservationsByTableForDate(reservations, mapDate),
    [isMapToday, mapDate, now, reservations]
  );
  const getReservationTables = React.useCallback(
    (reservation) => areaTables.filter((table) =>
      table.area === reservation.area && reservation.tableIds.includes(table.id)
    ),
    [areaTables]
  );
  const getReservationBounds = React.useCallback(
    (reservation, visibleTableIds = null) => {
      const tables = getReservationTables(reservation).filter(table => !visibleTableIds || visibleTableIds.has(table.id));
      if (tables.length === 0) return null;

      const xValues = tables.map((table) => cofeinSpatial ? projectCofeinTable(table, geometry).x / geometry.world.width * 100 : table.x);
      const yValues = tables.map((table) => cofeinSpatial ? projectCofeinTable(table, geometry).y / geometry.world.height * 100 : table.y);
      const minX = Math.min(...xValues);
      const maxX = Math.max(...xValues);
      const minY = Math.min(...yValues);
      const maxY = Math.max(...yValues);
      const width = Math.max(maxX - minX, tables.length > 1 ? (cofeinSpatial ? 100 / geometry.world.width * 100 : 10) : 0);
      const height = Math.max(maxY - minY, tables.length > 1 ? (cofeinSpatial ? 128 / geometry.world.height * 100 : 8) : 0);

      return {
        area: tables[0].area,
        tables,
        minX,
        maxX,
        minY,
        maxY,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
        left: ((minX + maxX) / 2) - width / 2,
        top: ((minY + maxY) / 2) - height / 2,
        width,
        height,
        labelTop: cofeinSpatial ? Math.max(12 / geometry.world.height * 100, minY - 44 / geometry.world.height * 100) : Math.max(4, minY - 7),
      };
    },
    [getReservationTables, cofeinSpatial, geometry]
  );
  const liveReservations = React.useMemo(() => {
    const unique = new Map();
    areaTables.forEach((table) => {
      const reservation = liveByTable.get(table.id);
      if (reservation) unique.set(reservation.id, reservation);
    });

    return Array.from(unique.values()).sort((first, second) => {
      const firstMinutes = isMapToday ? getReservationMinutesFromNow(first, now) ?? 9999 : 9999;
      const secondMinutes = isMapToday ? getReservationMinutesFromNow(second, now) ?? 9999 : 9999;

      if (firstMinutes !== secondMinutes) return firstMinutes - secondMinutes;
      return String(first.reservedTime).localeCompare(String(second.reservedTime));
    });
  }, [areaTables, isMapToday, liveByTable, now]);
  const selectedReservation =
    liveReservations.find((reservation) => reservation.id === selectedReservationId) ||
    reservations.find((reservation) => reservation.id === selectedReservationId);
  const selectedMapFocusTarget = React.useMemo(() => {
    if (cofeinSpatial && moveReservationId) return null;
    if (selectedTableId) {
      const table = areaTables.find((item) => item.id === selectedTableId && item.area === selectedArea && (!cofeinSpatial || cofeinViewTableIds.has(item.id)));
      if (table) {
        const zone = mapZones.find((item) => item.id === table.area) || mapZones[0];
        const point = cofeinSpatial ? projectCofeinTable(table, geometry) : localPercentToWorld(zone, table);
        return { ...point, key: `table-${table.area}-${table.id}-${mapFocusRequestId}` };
      }
    }

    if (selectedReservation) {
      const bounds = getReservationBounds(selectedReservation, cofeinSpatial ? cofeinViewTableIds : null);
      if (bounds) {
        const zone = mapZones.find((item) => item.id === bounds.area) || mapZones[0];
        return {
          x: cofeinSpatial ? bounds.centerX / 100 * geometry.world.width : zone.x + (bounds.centerX / 100) * zone.width,
          y: cofeinSpatial ? bounds.centerY / 100 * geometry.world.height : zone.y + (bounds.centerY / 100) * zone.height,
          key: `reservation-${selectedReservation.id}`,
        };
      }
    }

    return null;
  }, [areaTables, getReservationBounds, mapFocusRequestId, selectedArea, selectedReservation, selectedTableId, mapZones, cofeinSpatial, geometry, cofeinViewTableIds, moveReservationId]);
  const activeOrdersByReservationId = React.useMemo(() => {
    const grouped = new Map();

    diningOrders
      .filter((order) => order.status !== "Cancelled" && Number.isFinite(Number(order.reservationId)))
      .forEach((order) => {
        const reservationId = Number(order.reservationId);
        grouped.set(reservationId, [...(grouped.get(reservationId) || []), order]);
      });

    return grouped;
  }, [diningOrders]);
  const selectedConsumptionOrders = React.useMemo(
    () => selectedReservation
      ? activeOrdersByReservationId.get(Number(selectedReservation.id)) || []
      : [],
    [activeOrdersByReservationId, selectedReservation]
  );
  const selectedConsumptionItems = selectedConsumptionOrders.flatMap((order) =>
    order.items.map((item) => ({ ...item, orderId: order.id }))
  );
  const selectedConsumptionTotal = selectedConsumptionItems.reduce(
    (total, item) => total + Number(item.unitPrice || 0) * Number(item.quantity || 0),
    0
  );
  const selectedReservationNeedsClaim =
    Boolean(selectedReservation?.isArrived) &&
    diningEnabled &&
    requireTableClaim &&
    !selectedConsumptionOrders.some((order) => Boolean(order.assignedWaiterId));
  const newOrderReservationIds = React.useMemo(
    () => new Set(
      diningOrders
        .filter((order) => hasUnseenGuestItems(order))
        .map((order) => Number(order.reservationId))
        .filter(Number.isFinite)
    ),
    [diningOrders]
  );
  const nextReservations = liveReservations.filter((reservation) => !reservation.isArrived);
  const todayReservationsForSelectedTable = React.useMemo(() => {
    if (ordersOnly) return [];
    if (!selectedTableId) return [];

    return reservations
      .filter((reservation) => {
        if (reservation.area !== selectedArea) return false;
        if (reservation.reservedDate !== mapDate) return false;
        if (!reservation.tableIds.includes(selectedTableId)) return false;
        if (reservation.isNoShow || ["Cancelled", "Released"].includes(reservation.status)) return false;
        if (isMapToday && reservation.isArrived) return false;

        if (!isMapToday) return true;
        const minutes = getReservationMinutesFromNow(reservation, now);
        return minutes !== null && minutes >= 0;
      })
      .sort((first, second) => String(first.reservedTime).localeCompare(String(second.reservedTime)));
  }, [isMapToday, mapDate, now, ordersOnly, reservations, selectedArea, selectedTableId]);
  const nextSoonReservationForSelectedTable = React.useMemo(() => {
    if (ordersOnly || !selectedTableId || !isMapToday) return null;

    return reservations
      .map((reservation) => ({
        reservation,
        minutes: getReservationMinutesFromNow(reservation, now),
      }))
      .filter(({ reservation, minutes }) => {
        if (reservation.area !== selectedArea) return false;
        if (reservation.reservedDate !== todayDate) return false;
        if (!reservation.tableIds.includes(selectedTableId)) return false;
        if (reservation.isNoShow || reservation.isArrived || ["Cancelled", "Released"].includes(reservation.status)) return false;
        return minutes !== null && minutes > 0 && minutes < 180;
      })
      .sort((first, second) => first.minutes - second.minutes)[0] || null;
  }, [isMapToday, now, ordersOnly, reservations, selectedArea, selectedTableId, todayDate]);
  const selectedTableHasArrivedReservation = React.useMemo(() => {
    if (ordersOnly || !selectedTableId || !isMapToday) return false;

    return reservations.some((reservation) => {
      if (reservation.area !== selectedArea) return false;
      if (reservation.reservedDate !== todayDate) return false;
      if (!reservation.tableIds.includes(selectedTableId)) return false;
      if (reservation.isNoShow || ["Cancelled", "Released"].includes(reservation.status)) return false;
      return Boolean(reservation.isArrived);
    });
  }, [isMapToday, ordersOnly, reservations, selectedArea, selectedTableId, todayDate]);
  const canSeatWalkInForSelectedTable =
    isMapToday &&
    Boolean(onSeatWalkIn) &&
    !selectedTableHasArrivedReservation &&
    !(nextSoonReservationForSelectedTable && nextSoonReservationForSelectedTable.minutes <= 60);
  const activeOrdersByTable = React.useMemo(() => {
    const byTable = new Map();

    diningOrders
      .filter((order) => !["Done", "Cancelled"].includes(order.status))
      .forEach((order) => {
        String(order.tableLabel || "")
          .split(",")
          .map((tableId) => tableId.replace(/table/gi, "").trim())
          .filter(Boolean)
          .forEach((tableId) => {
            if (!byTable.has(tableId)) byTable.set(tableId, []);
            byTable.get(tableId).push(order);
          });
      });

    return byTable;
  }, [diningOrders]);
  const activeMapOrders = React.useMemo(
    () => Array.from(activeOrdersByTable.values()).flat(),
    [activeOrdersByTable]
  );
  const consumptionMenuGroups = React.useMemo(
    () => getMenuCategoryGroups(menuItems, language),
    [language, menuItems]
  );
  const filteredConsumptionMenuItems = React.useMemo(() => {
    const search = consumptionSearch.trim().toLowerCase();

    return menuItems
      .filter((item) => (getValue(item, "isActive") ?? true) === true)
      .filter((item) => consumptionCategory === "all" || normalizeCategory(getValue(item, "category")) === consumptionCategory)
      .filter((item) => {
        if (!search) return true;
        const haystack = `${getMenuItemName(item, "bg")} ${getMenuItemName(item, "en")} ${getValue(item, "descriptionBg") || ""}`.toLowerCase();
        return haystack.includes(search);
      })
      .slice(0, search ? 18 : 30);
  }, [consumptionCategory, consumptionSearch, menuItems]);
  const moveUnavailableTableIds = React.useMemo(
    () => selectedReservation
      ? getUnavailableTableIdsForSlot(
          reservations,
          selectedReservation.reservedDate,
          selectedReservation.reservedTime,
          selectedReservation.id
        )
      : new Set(),
    [reservations, selectedReservation]
  );
  const moveAreaTables = React.useMemo(
    () => getActiveTablesForArea(moveDraft.area),
    [getActiveTablesForArea, moveDraft.area]
  );
  const moveCandidateOptions = React.useMemo(
    () => getMoveCandidateOptions(
      moveDraft.area,
      Number(moveDraft.guestCount || selectedReservation?.guestCount || 0),
      moveUnavailableTableIds,
      moveAreaTables, plan.combinations, plan.staffCombinationMode
    ),
    [moveDraft.area, moveDraft.guestCount, moveUnavailableTableIds, moveAreaTables, selectedReservation?.guestCount, plan.combinations, plan.staffCombinationMode]
  );
  const moveSuggestedTableIds = React.useMemo(
    () => new Set(moveCandidateOptions.flatMap((option) => option.tableIds)),
    [moveCandidateOptions]
  );
  const moveBestTableIds = React.useMemo(
    () => new Set(moveCandidateOptions[0]?.tableIds || []),
    [moveCandidateOptions]
  );
  const moveSelectedCapacity = React.useMemo(
    () => getAreaTablesCapacity(moveDraft.area, moveDraft.tableIds, moveAreaTables),
    [moveAreaTables, moveDraft.area, moveDraft.tableIds]
  );
  const moveSelectionBounds = React.useMemo(
    () => moveReservationId && moveDraft.tableIds.length > 0
      ? getReservationBounds({ area: moveDraft.area, tableIds: moveDraft.tableIds })
      : null,
    [getReservationBounds, moveDraft.area, moveDraft.tableIds, moveReservationId]
  );
  const canSaveMove = !moveBusy && canUseAdminTableSelectionRule(moveDraft.area, moveDraft.tableIds, {
    areaTables: moveAreaTables,
    combinations: plan.combinations,
    staffCombinationMode: plan.staffCombinationMode,
    allowCapacityOverride: true,
    allowPartial: false,
  }) && !moveDraft.tableIds.some(id => moveUnavailableTableIds.has(id));
  const selectedPublicTableHold = selectedReservation
    ? findPublicTableHold(publicTableHolds, selectedReservation.reservedDate, selectedReservation.tableIds)
    : null;

  function toggleReservationSelection(reservationId) {
    if (cofeinSpatial) {
      const reservation = reservations.find(item => item.id === reservationId);
      if (reservation) {
        onAreaChange(reservation.area);
        const views = getCofeinBookingViews(geometry, reservation.area, areaTables);
        const currentView = views.find(view => view.id === cofeinView?.id && view.tableIds.some(id => reservation.tableIds.includes(id)));
        setCofeinViewId((currentView || views.find(view => view.tableIds.some(id => reservation.tableIds.includes(id))))?.id || "");
      }
    }
    setSelectedReservationId((current) => (current === reservationId ? null : reservationId));
    setSelectedTableId(null);
    setTableReservationDraft(null);
  }

  function openMovePanel(reservation) {
    setMoveError("");
    setSelectedReservationId(reservation.id);
    onAreaChange(reservation.area);
    if (cofeinSpatial) {
      const views = getCofeinBookingViews(geometry, reservation.area, areaTables);
      const currentView = views.find(view => view.id === cofeinView?.id && view.tableIds.some(id => reservation.tableIds.includes(id)));
      setCofeinViewId((currentView || views.find(view => view.tableIds.some(id => reservation.tableIds.includes(id))))?.id || "");
    }
    setMoveReservationId(reservation.id);
    setMoveDraft({
      area: reservation.area,
      tableIds: [],
      guestCount: Number(reservation.guestCount || 1),
    });
    setSelectedTableId(null);
    setTableReservationDraft(null);
  }

  function updateMoveGuestCount(value) {
    if (moveBusy) return;
    const nextGuestCount = Math.max(1, Math.min(40, Number(value || 1)));

    setMoveDraft((prev) => {
      return {
        ...prev,
        guestCount: nextGuestCount,
      };
    });
  }

  function toggleMoveTable(tableId) {
    if (!selectedReservation || moveBusy || moveUnavailableTableIds.has(tableId)) return;

    const exists = moveDraft.tableIds.includes(tableId);
    const nextTableIds = exists
      ? moveDraft.tableIds.filter((id) => id !== tableId)
      : [...moveDraft.tableIds, tableId];

    if (!exists && !canUseAdminTableSelectionRule(moveDraft.area, nextTableIds, {
      areaTables: moveAreaTables,
      combinations: plan.combinations,
      staffCombinationMode: plan.staffCombinationMode,
      allowCapacityOverride: true,
    })) return;
    setMoveError("");
    setMoveDraft((prev) => ({ ...prev, tableIds: nextTableIds }));
  }

  async function saveMove() {
    if (!selectedReservation || !canSaveMove) return;
    setMoveBusy(true);
    setMoveError("");
    try {
      const saved = await onMove(
        selectedReservation,
        moveDraft.area,
        moveDraft.tableIds,
        Number(moveDraft.guestCount || selectedReservation.guestCount || 0)
      );
      if (saved !== true) {
        setMoveError(localizeReservationSaveError(saved?.message, language));
        return;
      }
      setMoveReservationId(null);
      setSelectedReservationId(null);
      setSelectedTableId(null);
    } catch {
      setMoveError(adminLocalText(language, "Няма връзка със сървъра. Опитайте отново.", "Could not reach the server. Try again.", "Нет связи с сервером. Повторите попытку."));
    } finally {
      setMoveBusy(false);
    }
  }

  function cancelMove() {
    if (moveBusy) return;
    setMoveError("");
    setMoveReservationId(null);
    setMoveDraft({ area: selectedArea, tableIds: [], guestCount: 0 });
    setSelectedReservationId(null);
    setSelectedTableId(null);
  }

  function handleMapZoneChange(area) {
    if (moveBusy) return;
    if (cofeinSpatial && area !== selectedArea) {
      setCofeinViewId("");
      setSelectedTableId(null);
      if (!moveReservationId) setSelectedReservationId(null);
    }
    setMoveError("");
    onAreaChange(area);
    if (!moveReservationId) return;
    setMoveDraft((current) =>
      current.area === area ? current : { ...current, area, tableIds: [] }
    );
  }

  function handleMapViewModeChange(mode) {
    if (mode === "section" && cofeinSpatial) {
      const selectedIds = selectedTableId ? [selectedTableId]
        : tableReservationDraft ? tableReservationDraft.tableIds || [tableReservationDraft.tableId]
        : walkInDraft ? [walkInDraft.tableId]
        : moveReservationId ? moveDraft.tableIds : selectedReservation?.tableIds || [];
      setCofeinViewId(sectionForAdminSelection(cofeinViews, cofeinViewId, selectedIds)?.id || "");
    }
    onMapViewModeChange?.(mode);
  }

  function openConsumptionPanel() {
    if (!selectedReservation) return;

    setConsumptionSearch("");
    setConsumptionCategory("all");
    setShowConsumption(true);
  }

  async function claimSelectedReservation(reservation) {
    const claimed = await onClaimReservation?.(reservation.id);
    if (claimed === false) return;

    setSelectedReservationId(reservation.id);
  }

  function openWalkInModal(table) {
    setSelectedReservationId(null);
    setTableReservationDraft(null);
    setWalkInDraft({
      area: table.area,
      tableId: table.id,
      seats: table.seats,
      guestCount: Math.min(Number(table.seats || 2), 4),
    });
  }

  function openTableReservationForm(table) {
    setReservationFormError("");
    const nextTime = getNextAdminReservationTime(new Date());
    setSelectedReservationId(null);
    setSelectedTableId(null);
    setShowConsumption(false);
    setMoveReservationId(null);
    setWalkInDraft(null);
    setTableReservationDraft({
      guestName: "",
      phone: "",
      email: "",
      reservedDate: mapDate < todayDate ? todayDate : mapDate,
      reservedTime: nextTime,
      guestCount: Math.min(Number(table.seats || 2), 4),
      area: table.area,
      tableId: table.id,
      internalNote: "",
    });
  }

  function openEditReservationForm(reservation) {
    onAreaChange(reservation.area);
    setSelectedReservationId(null);
    setSelectedTableId(null);
    setShowConsumption(false);
    setMoveReservationId(null);
    setWalkInDraft(null);
    setReservationFormError("");
    setTableReservationDraft({
      id: reservation.id,
      guestName: reservation.guestName || "",
      phone: reservation.phone || "",
      email: reservation.email || "",
      reservedDate: reservation.reservedDate,
      reservedTime: reservation.reservedTime,
      guestCount: reservation.guestCount,
      area: reservation.area,
      tableId: reservation.tableIds[0],
      tableIds: [...reservation.tableIds],
      notes: reservation.notes || "",
      internalNote: reservation.internalNote || "",
    });
  }

  function closeWalkInModal() {
    setWalkInDraft(null);
  }

  async function submitWalkInModal(event) {
    event.preventDefault();
    if (!walkInDraft) return;

    const seated = await onSeatWalkIn?.(walkInDraft);
    if (seated === false) return;

    closeWalkInModal();
    setSelectedTableId(null);
  }

  async function submitTableReservation(event) {
    event.preventDefault();
    if (!tableReservationDraft || reservationFormBusy) return;
    setReservationFormBusy(true);
    setReservationFormError("");
    try {
      const payload = {
        guestName: tableReservationDraft.guestName,
        phone: tableReservationDraft.phone,
        email: tableReservationDraft.email,
        reservedDate: tableReservationDraft.reservedDate,
        reservedTime: tableReservationDraft.reservedTime,
        guestCount: Number(tableReservationDraft.guestCount || 1),
        area: tableReservationDraft.area,
        tableIds: tableReservationDraft.tableIds || [tableReservationDraft.tableId],
        internalNote: tableReservationDraft.internalNote,
        notes: tableReservationDraft.notes || "",
      };
      const saved = tableReservationDraft.id
        ? await onEditReservation?.(tableReservationDraft.id, payload)
        : await onCreateReservation?.(payload);
      if (saved !== true) {
        setReservationFormError(localizeReservationSaveError(saved?.message, language));
        return;
      }
      setTableReservationDraft(null);
      setSelectedTableId(null);
    } catch {
      setReservationFormError(adminLocalText(language, "Няма връзка със сървъра. Опитайте отново.", "Could not reach the server. Try again.", "Нет связи с сервером. Повторите попытку."));
    } finally {
      setReservationFormBusy(false);
    }
  }

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (moveReservationId) return;
    setSelectedReservationId(null);
    setSelectedTableId(null);
    setShowConsumption(false);
    setWalkInDraft(null);
    setTableReservationDraft(null);
  }, [mapDate, moveReservationId]);

  function renderPublicTableHoldControl(table) {
    if (ordersOnly || !onBlockPublicTables) return null;
    const hold = findPublicTableHold(publicTableHolds, mapDate, [table.id]);
    const heldIds = hold?.tableIds || hold?.TableIds || [];
    return (
      <div className="mt-3 space-y-2">
        <p className="text-xs text-white/55">
          {mapDate}{hold ? ` · ${text.table} ${heldIds.join(", ")}` : ""}
        </p>
        <button
          type="button"
          disabled={hold ? !onRemovePublicTableHold : mapDate < todayDate}
          onClick={() => hold
            ? onRemovePublicTableHold?.(hold)
            : onBlockPublicTables({ reservedDate: mapDate, tableIds: [table.id] })}
          className="w-full rounded-xl border border-amber-300/30 bg-amber-400/15 px-3 py-2 text-xs font-semibold text-amber-100 disabled:opacity-40"
        >
          {hold
            ? adminLocalText(language, "Премахни блокирането", "Remove public block", "Снять блокировку")
            : adminLocalText(language, "Блокирай маса за деня", "Block table for the day", "Заблокировать стол на день")}
        </button>
      </div>
    );
  }

  function renderTableReservationControls(table) {
    if (!onCreateReservation) return null;

    const isOpen = tableReservationDraft?.tableId === table.id && tableReservationDraft?.area === table.area;

    if (!isOpen) {
      return (
        <button
          type="button"
          onClick={() => openTableReservationForm(table)}
          className="w-full rounded-xl border border-[#f2d39a]/30 bg-[#c9a56a]/15 px-3 py-2 text-xs font-semibold text-[#f2d39a] transition hover:border-[#f2d39a]/55 hover:bg-[#c9a56a]/22"
        >
          {language === "bg" ? "Създай резервация" : "Create reservation"}
        </button>
      );
    }

    return (
      <div className="rounded-2xl border border-[#f2d39a]/18 bg-[#c9a56a]/10 px-3 py-2 text-xs leading-5 text-[#f2d39a]">
        {language === "bg" ? "Формата е отворена върху картата." : "The form is open over the map."}
      </div>
    );
  }

  function renderFloatingTableReservationForm() {
    if (!tableReservationDraft || typeof document === "undefined") return null;

    return (
      <MapOverlay title={adminLocalText(language, "Резервация", "Reservation", "Резервация")} onClose={() => { if (!reservationFormBusy) setTableReservationDraft(null); }}>
      <div
        data-map-keep-open="true"
        className="w-full"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <form
          ref={reservationFormRef}
          onSubmit={submitTableReservation}
          aria-label={adminLocalText(language, "Резервация", "Reservation", "Резервация")}
          className="w-full max-w-[440px] rounded-[24px] border border-[#f2d39a]/22 bg-[#15110e]/96 p-4 text-left shadow-[0_28px_90px_rgba(0,0,0,0.72)] sm:p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="section-kicker text-[10px]">
                {tableReservationDraft.id
                  ? adminLocalText(language, "Редактирай резервация", "Edit reservation", "Редактировать резервацию")
                  : adminLocalText(language, "Нова резервация", "New reservation", "Новая резервация")}
              </div>
              <div className="mt-1 text-lg font-semibold text-[#fff4df]">
                {text.table} {(tableReservationDraft.tableIds || [tableReservationDraft.tableId]).join(", ")}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTableReservationDraft(null)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition hover:text-white"
              aria-label="Close reservation form"
            >
              ×
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <input name="mapReservation.guestName"
              aria-label={adminLocalText(language, "Име", "Name", "Имя")}
              value={tableReservationDraft.guestName}
              onChange={(event) => setTableReservationDraft((prev) => ({ ...prev, guestName: event.target.value }))}
              required
              placeholder={language === "bg" ? "Име" : "Name"}
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#f2d39a]/55"
            />
            <input name="mapReservation.phone"
              aria-label={adminLocalText(language, "Телефон", "Phone", "Телефон")}
              value={tableReservationDraft.phone}
              onChange={(event) => setTableReservationDraft((prev) => ({ ...prev, phone: event.target.value }))}
              required
              placeholder={language === "bg" ? "Телефон" : "Phone"}
              className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#f2d39a]/55"
            />
            <div className="grid grid-cols-2 gap-2">
              <input name="mapReservation.reservedDate"
                type="date"
                aria-label={adminLocalText(language, "Дата", "Date", "Дата")}
                value={tableReservationDraft.reservedDate}
                min={tableReservationDraft.id ? undefined : formatLocalDate(new Date())}
                onChange={(event) => setTableReservationDraft((prev) => ({ ...prev, reservedDate: event.target.value }))}
                required
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none focus:border-[#f2d39a]/55"
              />
              <select name="mapReservation.reservedTime"
                aria-label={adminLocalText(language, "Час", "Time", "Время")}
                value={tableReservationDraft.reservedTime}
                onChange={(event) => setTableReservationDraft((prev) => ({ ...prev, reservedTime: event.target.value }))}
                required
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none focus:border-[#f2d39a]/55"
              >
                {[...new Set([
                  ...(tableReservationDraft.id ? [tableReservationDraft.reservedTime] : []),
                  ...getAvailableReservationTimesForDate(adminReservationTimes, tableReservationDraft.reservedDate),
                ])].sort().map((time) => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-[0.75fr_1fr] gap-2">
              <input name="mapReservation.guestCount"
                type="number"
                min="1"
                aria-label={adminLocalText(language, "Гости", "Guests", "Гости")}
                value={tableReservationDraft.guestCount}
                onChange={(event) => setTableReservationDraft((prev) => ({ ...prev, guestCount: event.target.value }))}
                required
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-[#f2d39a]/55"
              />
              <input name="mapReservation.email"
                aria-label={adminLocalText(language, "Имейл", "Email", "Email")}
                value={tableReservationDraft.email}
                onChange={(event) => setTableReservationDraft((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="Email"
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#f2d39a]/55"
              />
            </div>
            {tableReservationDraft.id && (
              <>
                <label className="text-xs text-white/65">
                  {adminLocalText(language, "Бележка на клиента", "Guest note", "Примечание гостя")}
                  <textarea name="mapReservation.notes" value={tableReservationDraft.notes} onChange={(event) => setTableReservationDraft((prev) => ({ ...prev, notes: event.target.value }))} className="mt-1 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white" />
                </label>
                <label className="text-xs text-white/65">
                  {adminLocalText(language, "Вътрешна бележка", "Internal note", "Внутренняя заметка")}
                  <textarea name="mapReservation.internalNote" value={tableReservationDraft.internalNote} onChange={(event) => setTableReservationDraft((prev) => ({ ...prev, internalNote: event.target.value }))} className="mt-1 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white" />
                </label>
              </>
            )}
            {reservationFormError && <p role="alert" className="text-sm text-red-200">{reservationFormError}</p>}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button type="submit" disabled={reservationFormBusy} aria-busy={reservationFormBusy} className="luxury-button rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-50">
                {language === "bg" ? "Запази" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setTableReservationDraft(null)}
                className="ghost-button rounded-2xl px-4 py-3 text-sm font-semibold"
              >
                {language === "bg" ? "Откажи" : "Cancel"}
              </button>
            </div>
          </div>
        </form>
      </div>
      </MapOverlay>
    );
  }

  if (!zonesLoaded || areas.length === 0) return <Panel title={text.title}><p role="status" className="p-6 text-white/70">{!zonesLoaded ? adminLocalText(language, "Зареждане на зоните…", "Loading areas…", "Загрузка зон…") : adminLocalText(language, "Всички зони са затворени за сезона. Отворете зона от „Блокирай зала“.", "All areas are seasonally closed. Reopen an area under Block hall.", "Все зоны закрыты на сезон. Откройте зону в разделе блокировки зала.")}</p></Panel>;

  const MapViewport = legacySection ? SectionMapViewport : UnifiedMapViewport;

  return (
    <Panel title={text.title} subtitle={text.subtitle} bare={!ordersOnly}>
      {!ordersOnly && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-[#c9a56a]/18 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="section-kicker text-[10px]">
              {adminLocalText(language, "Дата на картата", "Map date", "Дата карты")}
            </div>
            <div className="mt-1 text-sm text-white/55">
              {isMapToday
                ? adminLocalText(language, "Оперативен изглед за днес.", "Live operational view for today.", "Операционная карта на сегодня.")
                : adminLocalText(language, "Планиране на заетостта за избрания ден.", "Occupancy planning for the selected day.", "Просмотр загрузки на выбранный день.")}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input name="mapDate"
              type="date"
              value={mapDate}
              onChange={(event) => onDateChange?.(event.target.value)}
              className="min-h-[44px] rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm font-semibold text-[#fff4df] outline-none focus:border-[#f2d39a]/60"
              aria-label={adminLocalText(language, "Дата на картата", "Map date", "Дата карты")}
            />
            <button
              type="button"
              onClick={() => onDateChange?.(todayDate)}
              className={`min-h-[44px] rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                isMapToday
                  ? "border-[#f2d39a]/55 bg-[#c9a56a]/22 text-[#fff4df]"
                  : "border-white/10 bg-white/[0.04] text-white/65 hover:border-[#c9a56a]/35 hover:text-white"
              }`}
            >
              {adminLocalText(language, "Днес", "Today", "Сегодня")}
            </button>
          </div>
        </div>
      )}
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.75fr)]">
        <div className="relative min-w-0">
        <MapViewport
          geometry={geometry}
          storageNamespace={cofeinSpatial ? `cofein-halls-v4:${mapViewMode}` : undefined}
          surfaceClassName={cofeinSpatial ? "cofein-admin-map-surface" : undefined}
          minimumScale={cofeinSpatial ? geometry.minScale : undefined}
          detailViews={cofeinSpatial ? cofeinViews : undefined}
          hallNavigation={cofeinSpatial}
          hallTables={cofeinSpatial ? areaTables : undefined}
          activeDetailView={cofeinSpatial ? cofeinView : undefined}
          onDetailViewChange={setCofeinViewId}
          selectionSummary={cofeinSpatial && moveReservationId && moveDraft.tableIds.length ? `${adminLocalText(language, "Избрани маси", "Selected tables", "Выбраны столы")}: ${moveDraft.tableIds.join(", ")}` : undefined}
          zones={areas.map(([id, name]) => ({ id, name: cofeinSpatial ? name : `${name} · ${getAreaTableCount(id)} ${text.tables}` }))}
          activeZone={selectedArea}
          onZoneChange={handleMapZoneChange}
          focusTarget={selectedMapFocusTarget}
          onBackgroundClick={() => {
            setSelectedReservationId(null);
            setSelectedTableId(null);
            setTableReservationDraft(null);
          }}
          overlay={renderFloatingTableReservationForm()}
          autoExpand={!ordersOnly}
          onExitExpanded={!ordersOnly ? onExitMap : undefined}
          expandedControls={!ordersOnly ? (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/25 p-2 backdrop-blur-xl">
              <input name="expandedMapDate"
                type="date"
                value={mapDate}
                onChange={(event) => onDateChange?.(event.target.value)}
                onClick={(event) => {
                  try {
                    event.currentTarget.showPicker?.();
                  } catch {
                    event.currentTarget.focus();
                  }
                }}
                className="min-h-[40px] min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-semibold text-[#fff4df] outline-none focus:border-[#f2d39a]/60 sm:max-w-[220px]"
                aria-label={adminLocalText(language, "Дата на картата", "Map date", "Дата карты")}
              />
              <button
                type="button"
                onClick={() => onDateChange?.(todayDate)}
                className={`min-h-[40px] rounded-xl border px-4 py-2 text-xs font-semibold transition ${
                  isMapToday
                    ? "border-[#f2d39a]/55 bg-[#c9a56a]/22 text-[#fff4df]"
                    : "border-white/10 bg-white/[0.04] text-white/65 hover:border-[#c9a56a]/35 hover:text-white"
                }`}
              >
                {adminLocalText(language, "Днес", "Today", "Сегодня")}
              </button>
              <span className="hidden text-xs text-white/45 sm:inline">
                {isMapToday
                  ? adminLocalText(language, "Оперативен изглед за днес", "Live view for today", "Оперативная карта на сегодня")
                  : adminLocalText(language, "Планиране за избраната дата", "Planning for selected date", "Планирование на выбранную дату")}
              </span>
            </div>
          ) : null}
          hud={(
            <div
              className="flex overflow-hidden rounded-2xl border border-[#f2d39a]/30 bg-[#100d09]/88 shadow-[0_16px_45px_rgba(0,0,0,0.45)] backdrop-blur-xl"
              aria-label={adminLocalText(language, "Текуща заетост", "Current occupancy", "Текущая занятость")}
            >
              <div className="min-w-[64px] px-2 py-1.5 text-center sm:min-w-[76px] sm:px-2.5 sm:py-2">
                <div className="text-[7px] font-bold uppercase tracking-[0.12em] text-white/55 sm:text-[8px]">
                  {adminLocalText(language, "Гости сега", "Guests now", "Гостей сейчас")}
                </div>
                <div className="text-base font-black tabular-nums text-[#fff4df] sm:text-lg">
                  {occupancy.currentVisitors}
                </div>
              </div>
              <div className="w-px bg-white/10" />
              <div className="min-w-[64px] px-2 py-1.5 text-center sm:min-w-[76px] sm:px-2.5 sm:py-2">
                <div className="text-[7px] font-bold uppercase tracking-[0.12em] text-white/55 sm:text-[8px]">
                  {adminLocalText(language, "Закъсняват", "Running late", "Опаздывают")}
                </div>
                <div className="text-base font-black tabular-nums text-amber-200 sm:text-lg">
                  {occupancy.delayedVisitors}
                </div>
              </div>
              <div className="w-px bg-white/10" />
              <div className="min-w-[64px] px-2 py-1.5 text-center sm:min-w-[76px] sm:px-2.5 sm:py-2">
                <div className="text-[7px] font-bold uppercase tracking-[0.12em] text-emerald-200/70 sm:text-[8px]">
                  {adminLocalText(language, "Свободни места", "Free seats", "Свободных мест")}
                </div>
                <div className="text-base font-black tabular-nums text-emerald-200 sm:text-lg">
                  {occupancy.freeSeats}
                </div>
                <div className="text-[7px] tabular-nums text-emerald-100/55 sm:text-[8px]">
                  {adminLocalText(language, "Капацитет", "Capacity", "Вместимость")}: {occupancy.totalSeats}
                </div>
              </div>
            </div>
          )}
          language={language}
          viewMode={mapViewMode}
          onViewModeChange={cofeinSpatial ? handleMapViewModeChange : undefined}
          text={text}
        >
          {cofeinSpatial && <CofeinFloorPlanDecor geometry={cofeinDecorGeometry} language={language} />}
          {!cofeinSpatial && mapZones.filter((zone) => !closedAreas.includes(zone.id) && (!legacySection || zone.id === selectedArea)).map((zone) => {
            const label = areas.find(([area]) => area === zone.id)?.[1] || zone.id;
            return (
              <section
                key={zone.id}
                className={legacySection ? "absolute inset-0 overflow-hidden" : `absolute overflow-hidden rounded-[34px] border ${
                  selectedArea === zone.id ? "border-[#f2d39a]/55 shadow-[0_0_55px_rgba(201,165,106,0.18)]" : "border-white/12"
                } ${
                  zone.presentation === "casa-garden"
                    ? "bg-[radial-gradient(circle_at_top,_rgba(60,169,126,0.13),_transparent_34%),linear-gradient(180deg,rgba(34,40,28,0.98),rgba(16,18,13,0.98))]"
                    : zone.presentation === "casa-terrace"
                    ? "bg-[radial-gradient(circle_at_top,_rgba(110,231,183,0.13),_transparent_34%),linear-gradient(180deg,rgba(30,34,25,0.98),rgba(14,16,11,0.98))]"
                    : "bg-[radial-gradient(circle_at_top,_rgba(201,165,106,0.16),_transparent_34%),linear-gradient(180deg,rgba(39,27,21,0.98),rgba(16,12,10,0.98))]"
                }`}
                style={legacySection ? undefined : { left: zone.x, top: zone.y, width: zone.width, height: zone.height }}
                aria-label={label}
              >
                <div className="admin-reservation-map-grid absolute inset-5 rounded-[22px] border border-[#c9a56a]/14 bg-[linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[length:42px_42px]" />
                {!legacySection && (
                  <div className="pointer-events-none absolute left-8 top-7 z-[6] rounded-full border border-[#f2d39a]/25 bg-black/55 px-5 py-2 text-sm font-bold uppercase tracking-[0.16em] text-[#fff4df] backdrop-blur">
                    {label}
                  </div>
                )}
                {legacySection
                  ? <LegacyAdminMapDecor area={zone.id} presentation={zone.presentation} />
                  : <AdminMapDecor area={zone.id} presentation={zone.presentation} />}
              </section>
            );
          })}

          {liveReservations.filter((reservation) => cofeinSpatial
            ? reservation.id === selectedReservationId || ((cofeinWholeMap || reservation.area === selectedArea) && reservation.tableIds.some(id => cofeinViewTableIds.has(id)))
            : !legacySection || reservation.area === selectedArea).map((reservation) => {
            const bounds = getReservationBounds(reservation, cofeinSpatial ? cofeinViewTableIds : null);
            if (!bounds) return null;

            const minutes = isMapToday ? getReservationMinutesFromNow(reservation, now) : null;
            const isLate = isMapToday && !reservation.isArrived && minutes !== null && minutes <= -10;
            const isSelected = reservation.id === selectedReservationId && moveReservationId !== reservation.id;
	            const hasNewOrderItems = newOrderReservationIds.has(Number(reservation.id));
	            const canNoShow = isMapToday && !reservation.isArrived && minutes !== null && minutes <= -10;
            const canMarkArrived = isMapToday && !reservation.isArrived;
            const reservationOrders = activeOrdersByReservationId.get(Number(reservation.id)) || [];
            const needsTableClaim =
              isMapToday &&
              diningEnabled &&
              requireTableClaim &&
              reservation.isArrived &&
              !reservationOrders.some((order) => Boolean(order.assignedWaiterId));
            const zone = mapZones.find((item) => item.id === bounds.area) || mapZones[0];

            return (
              <div
                key={`reservation-${reservation.id}`}
                className={`pointer-events-none absolute ${isSelected ? "z-[220]" : "z-20"}`}
                style={cofeinSpatial ? { left: 0, top: 0, width: geometry.world.width, height: geometry.world.height } : legacySection
                  ? { inset: 0 }
                  : { left: zone.x, top: zone.y, width: zone.width, height: zone.height }}
              >
                {bounds.tables.length > 1 && (
                  <div
                    className={`pointer-events-none absolute z-[8] rounded-[28px] border shadow-[0_0_38px_rgba(201,165,106,0.16)] ${
                      reservation.isArrived
                        ? "border-emerald-300/35 bg-emerald-400/10"
                        : isLate
                        ? "border-red-300/45 bg-red-500/10"
                        : "border-[#f2d39a]/35 bg-[#c9a56a]/10"
                    }`}
                    style={{
                      left: `${bounds.left}%`,
                      top: `${bounds.top}%`,
                      width: `${bounds.width}%`,
                      height: `${bounds.height}%`,
                    }}
                  >
                    <div className="absolute inset-0 rounded-[28px] bg-[radial-gradient(circle_at_center,rgba(242,211,154,0.16),transparent_64%)]" />
                  </div>
                )}

                <div
                    className={`pointer-events-auto absolute -translate-x-1/2 ${isSelected ? "z-[230]" : "z-40"}`}
                  style={{ left: `${bounds.centerX}%`, top: `${bounds.labelTop}%` }}
                >
                  <button
                    type="button"
                    onClick={() => toggleReservationSelection(reservation.id)}
                    className={`relative z-40 min-w-[96px] rounded-full border px-2.5 py-1 text-[9px] font-semibold shadow-2xl backdrop-blur transition hover:scale-[1.03] sm:min-w-[112px] sm:px-3 sm:py-1.5 sm:text-[10px] lg:min-w-[128px] lg:text-[11px] ${
	                      hasNewOrderItems
	                        ? "admin-reservation-guest-marker waiter-new-alert border-amber-300/55 bg-amber-400/22 text-amber-50"
	                      : reservation.isArrived
	                        ? "admin-reservation-guest-marker border-emerald-300/40 bg-emerald-400/20 text-emerald-100"
                        : isLate
                        ? "admin-reservation-guest-marker border-red-300/50 bg-red-500/25 text-red-100"
                        : "admin-reservation-guest-marker border-[#f2d39a]/45 bg-[#2f241b]/90 text-[#fff4df]"
                    }`}
                  >
                    <span className="block truncate">{reservation.guestName}</span>
                    <span className="block text-[7px] font-medium uppercase tracking-[0.12em] opacity-70 sm:text-[8px] lg:text-[9px]">
                      {isMapToday ? getReservationTimingLabel(reservation, text, now) : reservation.reservedTime}
                    </span>
                  </button>

                  {isSelected && !isReservationFormOpen && !walkInDraft && !showConsumption && (
                    <MapOverlay title={reservation.guestName} onClose={() => setSelectedReservationId(null)}>
                    <div className="p-4">
                      <div className="text-sm font-semibold text-[#fff4df]">{reservation.guestName}</div>
                      <div className="mt-1 text-xs text-white/50">
                        {reservation.reservedTime} · {reservation.guestCount} {text.guests} · {reservation.tableIds.join(", ")}
                      </div>
                      <div className={`mt-3 grid gap-2 ${canNoShow ? "grid-cols-2" : "grid-cols-1"}`}>
                        {canMarkArrived && (
                          <button
                            type="button"
                            onClick={() => onArrived(reservation)}
                            className="col-span-full rounded-xl border border-emerald-300/25 bg-emerald-400/15 px-3 py-2 text-center text-xs font-semibold text-emerald-100"
                          >
                            {text.arrived}
                          </button>
                        )}
                        {canNoShow && (
                          <button
                            type="button"
                            onClick={() => onNoShow(reservation)}
                            className="rounded-xl border border-red-300/25 bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-100"
                          >
                            {text.noShow}
                          </button>
                        )}
                        {!ordersOnly && onBlockPublicTables && !selectedPublicTableHold && (
                          <button type="button" onClick={() => onBlockPublicTables(reservation)} className="rounded-xl border border-amber-300/30 bg-amber-400/15 px-3 py-2 text-xs font-semibold text-amber-100">
                            {adminLocalText(language, "Блокирай маса за деня", "Block table for the day", "Заблокировать стол на день")}
                          </button>
                        )}
                        {!ordersOnly && selectedPublicTableHold && onRemovePublicTableHold && (
                          <button type="button" onClick={() => onRemovePublicTableHold(selectedPublicTableHold)} className="rounded-xl border border-amber-300/30 bg-amber-400/15 px-3 py-2 text-xs font-semibold text-amber-100">
                            {adminLocalText(language, "Премахни блокирането", "Remove public block", "Снять блокировку")}
                          </button>
                        )}
                        {!ordersOnly && onEditReservation && (
                          <button type="button" onClick={() => openEditReservationForm(reservation)} className="rounded-xl border border-[#f2d39a]/25 bg-[#c9a56a]/15 px-3 py-2 text-xs font-semibold text-[#f2d39a]">
                            {adminLocalText(language, "Редактирай", "Edit", "Редактировать")}
                          </button>
                        )}
                        {!ordersOnly && onMove && (
                          <button
                            type="button"
                            onClick={() => openMovePanel(reservation)}
                            className="rounded-xl border border-[#f2d39a]/25 bg-[#c9a56a]/15 px-3 py-2 text-xs font-semibold text-[#f2d39a]"
                          >
                            {text.move}
                          </button>
                        )}
                        {reservation.isArrived && needsTableClaim && (
                          <button
                            type="button"
                            onClick={() => claimSelectedReservation(reservation)}
                            className="rounded-xl border border-[#f2d39a]/35 bg-[#c9a56a]/20 px-3 py-2 text-xs font-semibold text-[#ffe3a6]"
                          >
                            {language === "bg" ? "Вземи маса" : "Take table"}
                          </button>
                        )}
                        {reservation.isArrived && !needsTableClaim && (
                          <>
	                          {diningEnabled && (
	                            <button
	                              type="button"
	                              onClick={openConsumptionPanel}
	                              className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
	                                hasNewOrderItems
	                                  ? "waiter-new-alert border-amber-300/30 bg-amber-400/15 text-amber-100"
	                                  : "border-emerald-300/25 bg-emerald-400/15 text-emerald-100"
	                              }`}
	                            >
                              {text.consumption}
                            </button>
	                          )}
                            <button
                              type="button"
                              onClick={() => onRelease(reservation)}
                              className="rounded-xl border border-sky-300/25 bg-sky-400/15 px-3 py-2 text-xs font-semibold text-sky-100"
                            >
                              {text.release}
                            </button>
                          </>
                        )}
                      </div>
                      {!reservation.isArrived && (
                        <a
                          href={`tel:${reservation.phone}`}
                          className="mt-2 block rounded-xl border border-[#f2d39a]/25 bg-[#c9a56a]/15 px-3 py-2 text-center text-xs font-semibold text-[#f2d39a]"
                        >
                          {text.call}
                        </a>
                      )}
                      {!ordersOnly && onCancel && !reservation.isArrived && (
                        <button
                          type="button"
                          onClick={() => onCancel(reservation)}
                          className="mt-2 w-full rounded-xl border border-red-300/25 bg-red-500/15 px-3 py-2 text-center text-xs font-semibold text-red-100 transition hover:border-red-200/40 hover:bg-red-500/20"
                        >
                          {adminLocalText(language, "Откажи", "Cancel", "Отменить")}
                        </button>
                      )}
                    </div>
                    </MapOverlay>
                  )}
                </div>
              </div>
            );
          })}

          {moveSelectionBounds && selectedReservation && (!legacySection || moveSelectionBounds.area === selectedArea) && (() => {
            const requiredGuests = Number(moveDraft.guestCount || selectedReservation.guestCount || 1);

            return (
              <MapOverlay modal={false} title={adminLocalText(language, "Премести резервация", "Move reservation", "Переместить бронь")} onClose={cancelMove}>
              <div className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#c9a56a]">
                      {adminLocalText(language, "Ново настаняване", "New seating", "Новое размещение")}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-[#fff4df]">
                      {adminLocalText(language, "Маси", "Tables", "Столы")} {moveDraft.tableIds.join(", ")}
                    </div>
                    <div className="mt-1 text-[11px] text-emerald-200/80">
                      {adminLocalText(language, "Капацитет", "Capacity", "Вместимость")}: {moveSelectedCapacity}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={cancelMove}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60"
                    aria-label={adminLocalText(language, "Откажи", "Cancel", "Отменить")}
                  >
                    ×
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-[36px_minmax(0,1fr)_36px] overflow-hidden rounded-xl border border-white/10 bg-black/30">
                  <button
                    type="button"
                    onClick={() => updateMoveGuestCount(requiredGuests - 1)}
                    className="border-r border-white/10 py-2 font-bold text-[#f2d39a]"
                    aria-label="Decrease guests"
                  >
                    −
                  </button>
                  <input name="reservationMove.guestCount"
                    type="number"
                    min="1"
                    max="40"
                    value={requiredGuests}
                    onChange={(event) => updateMoveGuestCount(event.target.value)}
                    className="min-w-0 bg-transparent px-2 py-2 text-center text-sm font-bold text-[#fff4df] outline-none"
                    aria-label={text.guests}
                  />
                  <button
                    type="button"
                    onClick={() => updateMoveGuestCount(requiredGuests + 1)}
                    className="border-l border-white/10 py-2 font-bold text-[#f2d39a]"
                    aria-label="Increase guests"
                  >
                    +
                  </button>
                </div>
                {moveError && <p role="alert" className="mt-3 text-xs text-red-200">{moveError}</p>}
                <button
                  type="button"
                  disabled={!canSaveMove}
                  aria-busy={moveBusy}
                  onClick={saveMove}
                  className="luxury-button mt-3 w-full rounded-xl px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {adminLocalText(language, "Запази", "Save", "Сохранить")}
                </button>
              </div>
              </MapOverlay>
            );
          })()}

          {areaTables.filter((table) => cofeinSpatial ? cofeinViewTableIds.has(table.id) : !legacySection || table.area === selectedArea).map((table) => {
            const reservation = liveByTable.get(table.id);
            const isAdminBlocked = Boolean(findPublicTableHold(publicTableHolds, mapDate, [table.id]));
            const tableOrders = activeOrdersByTable.get(table.id) || [];
            const hasTableOrders = tableOrders.length > 0;
            const minutes = reservation ? getReservationMinutesFromNow(reservation, now) : null;
            const isLate = reservation && !reservation.isArrived && minutes !== null && minutes <= -10;
            const isGroupTable = reservation?.tableIds?.length > 1;
            const isSelectedTable = selectedTableId === table.id;
            const isMoveMode = Boolean(moveReservationId && selectedReservation);
            const isMoveSelected = isMoveMode && moveDraft.area === table.area && moveDraft.tableIds.includes(table.id);
            const isMoveUnavailable = isMoveMode && !isMoveSelected && moveUnavailableTableIds.has(table.id);
            const isMoveSuggested = isMoveMode && moveDraft.area === table.area && moveSuggestedTableIds.has(table.id);
            const isMoveBest = isMoveMode && moveDraft.area === table.area && moveBestTableIds.has(table.id);
            const isMoveAllowed =
              isMoveMode &&
              !moveBusy &&
              !isMoveUnavailable &&
              (isMoveSelected || canUseAdminTableSelectionRule(table.area,
                moveDraft.area === table.area ? [...moveDraft.tableIds, table.id] : [table.id], {
                  areaTables: getActiveTablesForArea(table.area),
                  combinations: plan.combinations,
                  staffCombinationMode: plan.staffCombinationMode,
                  allowCapacityOverride: true,
                }));
            const zone = mapZones.find((item) => item.id === table.area) || mapZones[0];
            const placement = cofeinSpatial ? projectCofeinTable(table, geometry) : null;
            const worldPosition = placement || localPercentToWorld(zone, table);
            const spatialStatus = isMoveUnavailable ? "unavailable"
              : isAdminBlocked ? "blocked"
              : reservation?.isArrived ? "arrived"
              : isLate ? "late"
              : reservation ? "reserved"
              : hasTableOrders ? "arrived" : "available";

            return (
              <div
                key={`${table.area}-${table.id}`}
                className={`absolute -translate-x-1/2 -translate-y-1/2 ${isSelectedTable ? "z-[220]" : "z-10"}`}
                style={{
                  left: legacySection ? `${table.x}%` : worldPosition.x,
                  top: legacySection ? `${table.y}%` : worldPosition.y,
                }}
              >
                <button
                  type="button"
                  disabled={isMoveMode && !isMoveAllowed}
                  aria-label={cofeinSpatial ? `${text.table} ${table.id}, ${table.seats} ${adminLocalText(language, 'места', 'seats', 'мест')}` : undefined}
                  aria-pressed={cofeinSpatial ? Boolean(isSelectedTable || isMoveSelected) : undefined}
                  style={placement ? { width: placement.width, height: placement.height, position: "relative" } : undefined}
                  data-admin-blocked={isAdminBlocked ? "true" : "false"}
                  title={isAdminBlocked ? adminLocalText(language, "Блокирана от администратор", "Blocked by admin", "Заблокирован администратором") : undefined}
                  data-reserved={reservation ? "true" : "false"}
                  data-arrived={reservation?.isArrived ? "true" : "false"}
                  data-selected={isSelectedTable || isMoveSelected ? "true" : "false"}
                  data-orders={hasTableOrders ? "true" : "false"}
                  onClick={() => {
                    if (isMoveMode && !isMoveAllowed) return;
                    if (selectedArea !== table.area) onAreaChange(table.area);
                    if (isMoveMode && isMoveAllowed) {
                      if (moveDraft.area === table.area) {
                        toggleMoveTable(table.id);
                      } else {
                        setMoveError("");
                        setMoveDraft((current) => ({ ...current, area: table.area, tableIds: [table.id] }));
                      }
                      setSelectedTableId(null);
                      return;
                    }

                    setMapFocusRequestId((current) => current + 1);
                    setSelectedReservationId(null);
                    setTableReservationDraft(null);
                    setSelectedTableId((current) => (current === table.id ? null : table.id));
                  }}
                  className={cofeinSpatial ? "cofein-map-table-button" : `admin-map-table-node flex items-center justify-center rounded-2xl border font-semibold shadow-2xl transition hover:scale-[1.04] ${
                    isGroupTable
                      ? legacySection
                        ? "h-9 min-w-[50px] px-2 text-xs sm:h-10 sm:min-w-[58px] sm:px-3 md:h-12 md:min-w-[68px] lg:h-16 lg:min-w-[88px]"
                        : "h-9 min-w-[50px] px-2 text-xs sm:h-10 sm:min-w-[58px] sm:px-3 md:h-14 md:min-w-[80px] lg:h-16 lg:min-w-[88px]"
                      : legacySection
                        ? "h-8 w-8 text-xs sm:h-9 sm:w-9 md:h-11 md:w-11 lg:h-14 lg:w-14 lg:text-sm"
                        : "h-8 w-8 text-xs sm:h-9 sm:w-9 md:h-14 md:w-14 md:text-sm"
                  } ${
                    isMoveSelected
                      ? "border-[#f2d39a]/80 bg-[linear-gradient(145deg,#f2d39a,#b8843f)] text-black ring-4 ring-[#f2d39a]/25"
                      : isMoveBest
                      ? "move-table-suggestion border-[#f2d39a]/75 bg-[linear-gradient(145deg,#6f5236,#221812)] text-[#fff4df]"
                      : isMoveSuggested
                      ? "border-[#f2d39a]/55 bg-[linear-gradient(145deg,#4a3728,#201711)] text-[#f2d39a] ring-2 ring-[#c9a56a]/20"
                      : isMoveMode && !isMoveAllowed
                      ? "cursor-not-allowed border-white/5 bg-black/20 text-white/25"
                    : ordersOnly && hasTableOrders
                      ? "border-emerald-300/60 bg-[linear-gradient(145deg,#246347,#10261d)] text-emerald-50 ring-2 ring-emerald-300/20"
                    : reservation?.isArrived
                      ? "border-emerald-300/55 bg-[linear-gradient(145deg,#214f3b,#10261d)] text-emerald-50"
                      : isLate
                      ? "border-red-300/70 bg-[linear-gradient(145deg,#6b1f1f,#251010)] text-red-50"
                      : reservation
                      ? "border-[#f2d39a]/65 bg-[linear-gradient(145deg,#f2d39a,#9f743d)] text-black"
                      : isSelectedTable
                      ? "border-[#f2d39a]/70 bg-[linear-gradient(145deg,#6f5236,#221812)] text-[#fff4df] ring-2 ring-[#f2d39a]/25"
                      : "border-[#c9a56a]/35 bg-[linear-gradient(145deg,#5a4332,#2a1f18)] text-white/85"
                  } ${isSelectedTable ? "ring-2 ring-[#f2d39a]/35" : ""}`}
                >
                  {cofeinSpatial ? <CofeinTableVisual table={table} placement={placement} status={spatialStatus} selected={isSelectedTable || isMoveSelected} /> : table.id}
                </button>

                {isSelectedTable && !isReservationFormOpen && !walkInDraft && !showConsumption && (
                  <MapOverlay title={`${text.table} ${table.id}`} onClose={() => setSelectedTableId(null)}>
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="section-kicker text-[9px]">{text.tableTodayTitle}</div>
                        <div className="mt-1 text-base font-semibold text-[#fff4df]">
                          {text.table} {table.id}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedTableId(null)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/55 transition hover:text-white"
                        aria-label="Close table reservations"
                      >
                        ×
                      </button>
                    </div>

                    {renderPublicTableHoldControl(table)}
                    {ordersOnly ? (
                      tableOrders.length === 0 ? (
                        <p className="mt-3 text-sm leading-6 text-white/55">{text.ordersEmpty || text.tableTodayEmpty}</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {tableOrders.map((order) => (
                            <button
                              key={order.id}
                              type="button"
                              onClick={() => onOpenOrder?.(order.id)}
                              className="w-full rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-left transition hover:border-emerald-200/35"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="min-w-0 truncate text-sm font-semibold text-emerald-100">
                                  #{order.id} · {order.status}
                                </span>
                                <span className="shrink-0 text-xs text-emerald-100/65">
                                  {formatEuroAmount(order.totalPrice)}
                                </span>
                              </div>
                              <div className="mt-1 truncate text-xs text-white/45">
                                {order.guestName || "—"}
                              </div>
                            </button>
                          ))}
                        </div>
                      )
                    ) : todayReservationsForSelectedTable.length === 0 ? (
                      <div className="mt-3 space-y-3">
                        <p className="text-sm leading-6 text-white/55">{text.tableTodayEmpty}</p>
                        {nextSoonReservationForSelectedTable && (
                          <div className="rounded-xl border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
                            {language === "bg"
                              ? `Има резервация ${formatReservationLeadTime(nextSoonReservationForSelectedTable.minutes, language)}.`
                              : `Reservation ${formatReservationLeadTime(nextSoonReservationForSelectedTable.minutes, language)}.`}
                          </div>
                        )}
                        {renderTableReservationControls(table)}
                        {canSeatWalkInForSelectedTable && (
                          <button
                            type="button"
                            onClick={() => openWalkInModal(table)}
                            className="w-full rounded-xl border border-emerald-300/25 bg-emerald-400/15 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:border-emerald-200/40 hover:bg-emerald-400/20"
                          >
                            {language === "bg" ? "Настани без резервация" : "Seat walk-in"}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {todayReservationsForSelectedTable.map((reservation) => (
                          <button
                            key={reservation.id}
                            type="button"
                            onClick={() => toggleReservationSelection(reservation.id)}
                            className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${
                              selectedReservationId === reservation.id
                                ? "border-[#f2d39a]/55 bg-[#c9a56a]/18"
                                : "border-white/10 bg-white/[0.035] hover:border-[#c9a56a]/35"
                            }`}
                          >
                            <span className="min-w-0 truncate text-sm font-semibold text-[#fff4df]">
                              {reservation.guestName}
                            </span>
                            <span className="shrink-0 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] font-semibold text-[#f2d39a]">
                              {reservation.reservedTime}
                            </span>
                          </button>
                        ))}
                        {nextSoonReservationForSelectedTable && (
                          <div className="rounded-xl border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
                            {language === "bg"
                              ? `Има резервация ${formatReservationLeadTime(nextSoonReservationForSelectedTable.minutes, language)}.`
                              : `Reservation ${formatReservationLeadTime(nextSoonReservationForSelectedTable.minutes, language)}.`}
                          </div>
                        )}
                        {renderTableReservationControls(table)}
                        {canSeatWalkInForSelectedTable && (
                          <button
                            type="button"
                            onClick={() => openWalkInModal(table)}
                            className="w-full rounded-xl border border-emerald-300/25 bg-emerald-400/15 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:border-emerald-200/40 hover:bg-emerald-400/20"
                          >
                            {language === "bg" ? "Настани без резервация" : "Seat walk-in"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  </MapOverlay>
                )}
              </div>
            );
          })}

        </MapViewport>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="rounded-2xl border border-[#c9a56a]/18 bg-black/20 p-4">
            <div className="section-kicker">{ordersOnly ? text.ordersTitle || "Orders" : text.next}</div>
            {ordersOnly ? (
              activeMapOrders.length === 0 ? (
                <p className="mt-3 text-sm text-white/55">{text.ordersEmpty || text.empty}</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {activeMapOrders.slice(0, 12).map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => onOpenOrder?.(order.id)}
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-emerald-300/35 hover:bg-emerald-400/10"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-[#fff4df]">{order.tableLabel}</span>
                        <span className="text-xs text-emerald-100/70">{order.status}</span>
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        #{order.id} · {order.guestName || "—"} · {formatEuroAmount(order.totalPrice)}
                      </div>
                    </button>
                  ))}
                </div>
              )
            ) : nextReservations.length === 0 ? (
              <p className="mt-3 text-sm text-white/55">{text.empty}</p>
            ) : (
              <div className="mt-3 space-y-2">
                {nextReservations.map((reservation) => {
                  const minutes = getReservationMinutesFromNow(reservation, now);
                  const isLate = !reservation.isArrived && minutes !== null && minutes <= -10;

                  return (
                    <button
                      key={reservation.id}
                      type="button"
                      onClick={() => toggleReservationSelection(reservation.id)}
                      className={`w-full rounded-2xl border p-3 text-left transition ${
                        selectedReservationId === reservation.id
                          ? "border-[#f2d39a]/55 bg-[#c9a56a]/16"
                          : isLate
                          ? "border-red-300/25 bg-red-500/10"
                          : "border-white/10 bg-white/[0.03] hover:border-[#c9a56a]/35"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-[#fff4df]">{reservation.guestName}</span>
                        <span className="text-xs text-white/50">{reservation.reservedTime}</span>
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        {isMapToday ? getReservationTimingLabel(reservation, text, now) : reservation.reservedDate} · {reservation.guestCount} {text.guests} · {reservation.tableIds.join(", ")}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedReservation && (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-[0.22em] text-[#c9a56a]">{selectedReservation.reservedTime}</div>
              <div className="mt-2 text-xl font-semibold text-[#fff4df]">{selectedReservation.guestName}</div>
              <div className="mt-1 text-sm text-white/55">
                {selectedReservation.guestCount} {text.guests} · {selectedReservation.tableIds.join(", ")}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                {!ordersOnly && onMove && (
                  <button type="button" onClick={() => openMovePanel(selectedReservation)} className="rounded-xl border border-[#f2d39a]/25 bg-[#c9a56a]/15 px-4 py-3 text-sm font-semibold text-[#f2d39a]">
                    {text.move}
                  </button>
                )}
                {isMapToday && !selectedReservation.isArrived && (
                  <button type="button" onClick={() => onArrived(selectedReservation)} className="luxury-button rounded-xl px-4 py-3 text-center text-sm">
                    {text.arrived}
                  </button>
                )}
                {isMapToday && !selectedReservation.isArrived && (getReservationMinutesFromNow(selectedReservation, now) ?? 9999) <= -10 && (
                  <button type="button" onClick={() => onNoShow(selectedReservation)} className="rounded-xl border border-red-300/25 bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-100">
                    {text.noShow}
                  </button>
                )}
                {selectedReservation.isArrived ? (
                  <>
                    {selectedReservationNeedsClaim ? (
                      <button type="button" onClick={() => claimSelectedReservation(selectedReservation)} className="rounded-xl border border-[#f2d39a]/35 bg-[#c9a56a]/20 px-4 py-3 text-sm font-semibold text-[#ffe3a6]">
                        {language === "bg" ? "Вземи маса" : "Take table"}
                      </button>
                    ) : (
                      <>
                        {diningEnabled && (
                          <button type="button" onClick={openConsumptionPanel} className="rounded-xl border border-emerald-300/25 bg-emerald-400/15 px-4 py-3 text-sm font-semibold text-emerald-100">
                            {text.consumption}
                          </button>
                        )}
                        <button type="button" onClick={() => onRelease(selectedReservation)} className="rounded-xl border border-sky-300/25 bg-sky-400/15 px-4 py-3 text-sm font-semibold text-sky-100">
                          {text.release}
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <a href={`tel:${selectedReservation.phone}`} className="ghost-button rounded-xl px-4 py-3 text-center text-sm font-semibold">
                    {text.call}
                  </a>
                )}
                {!ordersOnly && onEditReservation && (
                  <button type="button" onClick={() => openEditReservationForm(selectedReservation)} className="ghost-button rounded-xl px-4 py-3 text-sm font-semibold">
                    {adminLocalText(language, "Редактирай", "Edit", "Редактировать")}
                  </button>
                )}
                {onOpenReservation && (
                  <button type="button" onClick={() => onOpenReservation(selectedReservation)} className="ghost-button rounded-xl px-4 py-3 text-sm font-semibold">
                    {text.openReservation}
                  </button>
                )}
                {!ordersOnly && onBlockPublicTables && !selectedPublicTableHold && (
                  <button
                    type="button"
                    onClick={() => onBlockPublicTables(selectedReservation)}
                    className="rounded-xl border border-amber-300/30 bg-amber-400/15 px-4 py-3 text-sm font-semibold text-amber-100"
                  >
                    {adminLocalText(language, "Блокирай маса за деня", "Block table for the day", "Заблокировать стол на день")}
                  </button>
                )}
                {!ordersOnly && selectedPublicTableHold && onRemovePublicTableHold && (
                  <button
                    type="button"
                    onClick={() => onRemovePublicTableHold(selectedPublicTableHold)}
                    className="rounded-xl border border-amber-300/30 bg-amber-400/15 px-4 py-3 text-sm font-semibold text-amber-100"
                  >
                    {adminLocalText(language, "Премахни блокирането", "Remove public block", "Снять блокировку")}
                  </button>
                )}
                {!ordersOnly && onCancel && !selectedReservation.isArrived && (
                  <button
                    type="button"
                    onClick={() => onCancel(selectedReservation)}
                    className="rounded-xl border border-red-300/25 bg-red-500/15 px-4 py-3 text-center text-sm font-semibold text-red-100 transition hover:border-red-200/40 hover:bg-red-500/20"
                  >
                    {adminLocalText(language, "Откажи", "Cancel", "Отменить")}
                  </button>
                )}
              </div>

              {diningEnabled && showConsumption && selectedReservation.isArrived && typeof document !== "undefined" && (
                <MapOverlay wide title={text.consumption} onClose={() => setShowConsumption(false)}>
                  <div
                    ref={consumptionPanelRef}
                    className="mx-auto flex w-full max-w-5xl min-w-0 flex-col overflow-hidden rounded-[22px] border border-emerald-300/20 bg-[#15110e] shadow-[0_32px_120px_rgba(0,0,0,0.72)] md:min-h-0 md:h-[min(680px,calc(100dvh-8rem))] md:rounded-[26px]"
                  >
                    <div className="shrink-0 border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-3 md:p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="section-kicker">{text.consumption}</div>
                          <div className="mt-1 truncate text-base font-semibold text-[#fff4df] sm:text-lg md:text-2xl">
                            {selectedReservation.guestName} · {formatEuroAmount(selectedConsumptionTotal)}
                          </div>
                          <div className="mt-1 text-xs text-white/45">
                            {selectedReservation.tableIds.join(", ")} · {selectedReservation.guestCount} {text.guests}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowConsumption(false)}
                          className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-white/75 transition hover:border-white/25 hover:text-white sm:px-4"
                        >
                          {text.close}
                        </button>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-hidden p-2.5 sm:p-3 md:p-4">
                      <div className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-2.5 sm:gap-3 lg:grid-cols-[minmax(280px,0.78fr)_minmax(0,1.22fr)] lg:grid-rows-1">
                        <div className="min-h-0 min-w-0 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-2.5 sm:p-3 md:p-4 lg:overflow-visible">
                          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f2d39a] sm:text-xs">
                            {language === "bg" ? "Текуща консумация" : "Current consumption"}
                          </div>
                          {selectedConsumptionItems.length === 0 ? (
                            <p className="text-sm leading-6 text-white/55">{text.noConsumption}</p>
                          ) : (
                            <div className="space-y-1.5 pr-1">
	                              {selectedConsumptionItems.map((item) => (
	                                <div
	                                  key={`${item.orderId}-${item.id}`}
	                                  className={`rounded-xl border p-2.5 ${
	                                    item.source === "GuestOnline" && !item.waiterSeenAtUtc
	                                      ? "waiter-new-dish border-amber-300/35 bg-amber-400/12"
	                                      : item.status === "Ready"
	                                      ? "waiter-ready-dish border-emerald-300/35 bg-emerald-400/12"
	                                      : "border-white/10 bg-black/22"
	                                  }`}
	                                >
	                                  <div className="flex items-center justify-between gap-3">
	                                    <div className="min-w-0">
	                                      <div className="truncate text-sm font-semibold text-[#fff4df]">{item.name}</div>
	                                      <div className="text-xs text-white/45">
	                                        {formatEuroAmount(item.unitPrice)} · {formatEuroAmount(item.unitPrice * item.quantity)}
	                                      </div>
	                                      <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
	                                        item.source === "GuestOnline" && !item.waiterSeenAtUtc
	                                          ? "border-amber-300/35 bg-amber-400/12 text-amber-100"
	                                          : item.status === "Ready"
	                                          ? "border-emerald-300/30 bg-emerald-400/15 text-emerald-100"
	                                          : "border-white/10 bg-black/25 text-white/50"
	                                      }`}>
	                                        {getDiningItemStatusLabel(item, language)}
	                                      </div>
	                                    </div>
                                    <div className="flex shrink-0 items-center overflow-hidden rounded-full border border-white/10">
                                      <button type="button" onClick={() => onUpdateConsumptionItem(item.id, item.quantity - 1)} className="px-2.5 py-1 text-[#f2d39a]">-</button>
                                      <span className="min-w-8 text-center text-sm text-white/80">{item.quantity}</span>
                                      <button type="button" onClick={() => onUpdateConsumptionItem(item.id, item.quantity + 1)} className="px-2.5 py-1 text-[#f2d39a]">+</button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-emerald-300/16 bg-emerald-400/8 p-2.5 sm:p-3 md:p-4">
                          <div className="mb-2 shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f2d39a] sm:text-xs">
                            {text.addConsumption}
                          </div>
                          <div className="-mx-1 mb-2 flex max-w-full shrink-0 snap-x gap-2 overflow-x-auto px-1 pb-1">
                            {[
                              { id: "all", label: text.allDishes || "All", count: menuItems.filter((item) => (getValue(item, "isActive") ?? true) === true).length },
                              ...consumptionMenuGroups.map((group) => ({ ...group, count: group.items.length })),
                            ].map((category) => (
                              <button
                                key={category.id}
                                type="button"
                                onClick={() => {
                                  setConsumptionCategory(category.id);
                                  setConsumptionSearch("");
                                }}
                                className={`min-w-[7.5rem] snap-start rounded-2xl border px-3 py-2 text-left transition active:scale-[0.98] ${
                                  consumptionCategory === category.id
                                    ? "border-[#f2d39a]/60 bg-[#c9a56a]/24 text-[#fff4df]"
                                    : "border-white/10 bg-black/22 text-white/68 hover:border-[#c9a56a]/35"
                                }`}
                              >
                                <span className="block truncate text-xs font-semibold sm:text-sm">{category.label}</span>
                                <span className="mt-0.5 block text-[10px] text-white/45 sm:text-[11px]">
                                  {category.count} {language === "bg" ? "позиции" : "items"}
                                </span>
                              </button>
                            ))}
                          </div>
                          <input name="consumptionSearch"
                            value={consumptionSearch}
                            onChange={(event) => setConsumptionSearch(event.target.value)}
                            placeholder={text.searchDish}
                            className="mb-2 w-full shrink-0 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#f2d39a]/50"
                          />
                          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
                            {filteredConsumptionMenuItems.length === 0 ? (
                              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-4 text-sm text-white/55">
                                {language === "bg" ? "Няма намерени ястия." : "No dishes found."}
                              </div>
                            ) : filteredConsumptionMenuItems.map((item) => {
                                const name = getMenuItemName(item, language);
                                const price = Number(getValue(item, "price") || 0);
                                const imageUrl = getValue(item, "imageUrl") || "";
                                const weight = getValue(item, "weight") || "";
                                return (
                                  <button
                                    key={getValue(item, "id") || name}
                                    type="button"
                                    onClick={() => onAddConsumptionItem(selectedReservation.id, {
                                      menuItemId: getValue(item, "id"),
                                      name,
                                      unitPrice: price,
                                      kind: getMenuItemKind(item),
                                      quantity: 1,
                                    })}
                                    className="flex w-full min-w-0 items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.035] p-2 text-left transition hover:border-[#c9a56a]/40 active:scale-[0.99]"
                                  >
                                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/25 sm:h-14 sm:w-14">
                                      {imageUrl ? (
                                        <img src={restaurantAssetUrl(imageUrl, branding.assetBaseUrl)} alt="" className="h-full w-full object-cover" />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center text-[9px] font-semibold uppercase tracking-[0.18em] text-[#f2d39a]/70">
                                          {isCasaTenant ? "Casa" : branding.name}
                                        </div>
                                      )}
                                    </div>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-semibold text-white/86">{name}</span>
                                      <span className="mt-0.5 block text-xs text-white/45">
                                        {weight ? `${weight} · ` : ""}{formatEuroAmount(price)}
                                      </span>
                                    </span>
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#f2d39a]/25 bg-[#c9a56a]/14 text-lg font-semibold text-[#f2d39a]">
                                      +
                                    </span>
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </MapOverlay>
              )}
            </div>
          )}
          {walkInDraft && typeof document !== "undefined" && (
            <MapOverlay title={adminLocalText(language, "Настаняване", "Walk-in", "Разместить гостей")} onClose={closeWalkInModal}>
              <form
                onSubmit={submitWalkInModal}
                className="w-full max-w-md overflow-hidden rounded-[28px] border border-emerald-300/20 bg-[#15110e] shadow-[0_32px_120px_rgba(0,0,0,0.72)]"
              >
                <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_38%),linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-5">
                  <div className="section-kicker">
                    {language === "bg" ? "Настаняване" : "Walk-in"}
                  </div>
                  <h3 className="mt-2 text-2xl font-semibold text-[#fff4df]">
                    {language === "bg" ? `Маса ${walkInDraft.tableId}` : `Table ${walkInDraft.tableId}`}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-white/55">
                    {language === "bg"
                      ? "Въведете броя гости. Резервацията ще бъде създадена без клиентски данни и ще е готова за консумация."
                      : "Enter guest count. The table will be seated without customer details and ready for consumption."}
                  </p>
                </div>

                <div className="p-5">
                  <label className="text-sm font-semibold text-white/70">
                    {language === "bg" ? "Брой гости" : "Guests"}
                    <div className="mt-3 flex items-center overflow-hidden rounded-2xl border border-white/10 bg-black/25">
                      <button
                        type="button"
                        onClick={() => setWalkInDraft((prev) => ({ ...prev, guestCount: Math.max(1, Number(prev.guestCount || 1) - 1) }))}
                        className="h-14 w-14 text-xl font-semibold text-[#f2d39a]"
                      >
                        -
                      </button>
                      <input name="walkIn.guestCount"
                        type="number"
                        min="1"
                        max="40"
                        value={walkInDraft.guestCount}
                        onChange={(event) =>
                          setWalkInDraft((prev) => ({
                            ...prev,
                            guestCount: Math.max(1, Math.min(40, Number(event.target.value || 1))),
                          }))
                        }
                        className="h-14 min-w-0 flex-1 bg-transparent text-center text-2xl font-semibold text-white outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setWalkInDraft((prev) => ({ ...prev, guestCount: Math.min(40, Number(prev.guestCount || 1) + 1) }))}
                        className="h-14 w-14 text-xl font-semibold text-[#f2d39a]"
                      >
                        +
                      </button>
                    </div>
                  </label>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={closeWalkInModal}
                      className="ghost-button rounded-2xl px-4 py-3 text-sm font-semibold"
                    >
                      {text.close}
                    </button>
                    <button className="luxury-button rounded-2xl px-4 py-3 text-sm font-semibold">
                      {language === "bg" ? "Настани" : "Seat"}
                    </button>
                  </div>
                </div>
              </form>
            </MapOverlay>
          )}
        </div>
      </div>
    </Panel>
  );
}

export function SectionMapViewport({
  children,
  geometry,
  zones,
  activeZone,
  onZoneChange,
  onBackgroundClick,
  overlay,
  hud,
  text,
}) {
  const presentation = geometry?.zones.find(zone => zone.id === activeZone)?.presentation;
  return (
    <>
      <div className="mb-5 grid gap-2 sm:grid-cols-3">
        {zones.map((zone) => (
          <button
            key={zone.id}
            type="button"
            onClick={() => onZoneChange?.(zone.id)}
            className={`rounded-2xl border px-4 py-3 text-left transition ${
              activeZone === zone.id
                ? "border-[#f2d39a]/70 bg-[#c9a56a]/20 text-[#fff4df]"
                : "border-white/10 bg-black/20 text-white/65 hover:border-[#c9a56a]/35 hover:text-white"
            }`}
          >
            <span className="block text-sm font-semibold">{zone.name.split(" · ")[0]}</span>
            <span className="mt-1 block text-xs text-white/45">
              {zone.name.split(" · ")[1] || text.tables}
            </span>
          </button>
        ))}
      </div>
      <div
        data-admin-swipe-lock="true"
        className={`admin-reservation-map-surface relative min-w-0 min-h-[600px] overflow-hidden rounded-[26px] border border-white/10 ${
          presentation === "casa-garden"
            ? "bg-[radial-gradient(circle_at_top,_rgba(60,169,126,0.13),_transparent_34%),linear-gradient(180deg,rgba(34,40,28,0.96),rgba(16,18,13,0.96))] md:min-h-[820px]"
            : presentation === "casa-terrace"
            ? "min-h-[720px] bg-[radial-gradient(circle_at_top,_rgba(110,231,183,0.13),_transparent_34%),radial-gradient(circle_at_50%_100%,rgba(201,165,106,0.13),transparent_38%),linear-gradient(180deg,rgba(30,34,25,0.96),rgba(14,16,11,0.96))] sm:min-h-[760px]"
            : "bg-[radial-gradient(circle_at_top,_rgba(201,165,106,0.16),_transparent_34%),radial-gradient(circle_at_18%_60%,rgba(125,211,252,0.08),transparent_25%),linear-gradient(180deg,rgba(39,27,21,0.96),rgba(16,12,10,0.96))] md:min-h-[850px]"
        }`}
        onClick={(event) => {
          if (event.target.closest("button, a, input, select, textarea, [role='button'], [data-map-keep-open='true']")) return;
          onBackgroundClick?.();
        }}
      >
        {children}
        {hud ? (
          <div className="pointer-events-none absolute right-3 top-3 z-[230] sm:right-4 sm:top-4">
            {hud}
          </div>
        ) : null}
      </div>
      {overlay}
    </>
  );
}

function orientTableForMap(table, presentation = "plain") {
  if (!presentation.startsWith("casa-")) return table;
  if (table.area === "openTerrace") return { ...table, ...rotatePercentPointHalfTurn(table) };
  if (table.area === "garden") return { ...table, ...rotatePercentPointClockwise(table) };
  if (table.area === "indoor") return { ...table, ...rotatePercentPointCounterClockwise(table) };
  return table;
}

