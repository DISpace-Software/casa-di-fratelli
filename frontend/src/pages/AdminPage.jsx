import TodayGuestSummary from '../components/admin/TodayGuestSummary.jsx';
import { isCasaTenant } from '../admin/tenant.js';
import { adminText, adminLocalText } from '../i18n/adminText.js';
import { showBrowserNotification, getReadyAdminPushRegistration, urlBase64ToUint8Array } from '../admin/browser/notifications.js';
import { normalizeAdminRole, adminRoleOptions, getAdminUserId, getAdminRoleLabel, canActorManageAdminUser } from '../admin/presentation/roles.js';
import { fetchJsonOrEmpty, readErrorMessage } from '../admin/api/response.js';
import { normalizeReservation, normalizeDiningOrder, normalizeLayoutItem, normalizeCustomerHistoryReservation } from '../admin/api/reservationMappers.js';
import { hasLayoutOverlap } from '../admin/presentation/layout.js';
import { localizeReservationSaveError } from '../admin/presentation/reservations.js';
import { normalizeDepartment, normalizeCategory, getCategoryLabel, menuDepartmentOptions, categoryDisplayNames, getMenuItemKind, getDepartmentLabel } from '../admin/presentation/menu.js';
import { compressMenuImage, compressEventImage } from '../admin/browser/media.js';
import { getValue } from '../admin/api/wireValue.js';
import { toLocalDateTimeInputValue, formatEuroAmount, formatBirthday } from '../admin/presentation/formatters.js';
import { RoleProfileIcon, RefreshIcon, ThemeIcon, StatCard, AdminNavIcon, Panel, StatusBadge } from '../components/admin/AdminPrimitives.jsx';
import { hasUnseenGuestItems, hasReadyDiningItems, hasWaiterAttentionItems, hasNewDiningItems, getDiningItemStatusLabel } from '../admin/presentation/diningOrders.js';
import { ReservationOperationsMap } from '../components/admin/map/ReservationOperationsMap.jsx';
import { TableChipSelector } from '../components/admin/TableChipSelector.jsx';
import { TableLayoutEditor } from '../components/admin/map/TableLayoutEditor.jsx';
import { InventoryModule } from '../components/admin/InventoryModule.jsx';
import { MaintenanceModule } from '../components/admin/MaintenanceModule.jsx';
import { MarketingModule } from '../components/admin/MarketingModule.jsx';
import WaitlistPanel from '../components/admin/WaitlistPanel';
import SommelierSettings from '../components/admin/SommelierSettings';
import { restaurantAssetUrl } from '../domain/adminMap/restaurantAssets';
import { getZoneName } from '../domain/reservations/floorPlanNames';
import { FloorPlanContext, useFloorPlan } from '../context/FloorPlanContext';
import { getAdminSessionPlan } from '../domain/adminMap/adminSessionPlan';
import { tenantCategoryOptions } from '../domain/adminMap/tenantMenuCategories';
import { tenantContext, tenantStorageKey } from '../config/tenantRuntime';
import { useSeasonalZones } from '../context/SeasonalZonesContext';
import { createLayoutSession } from '../domain/adminMap/layoutSession';
import { nextTablePosition } from '../domain/adminMap/layoutDraft';
import FloorPlanZonesEditor from '../components/admin/FloorPlanZonesEditor';
import { buildTimeRange, isHallBlock } from '../domain/reservations/hallBlockRules';
import { getReservationMinutesFromNow, formatLocalDate } from '../domain/adminMap/liveReservations';
import PreorderSettings from '../components/admin/PreorderSettings';
import DeveloperManagement, { DeveloperDataTools, DeveloperServiceSettings } from '../components/admin/DeveloperManagement';
import TenantBrandingSettings from '../components/admin/TenantBrandingSettings';
import TenantBrandLogo from '../components/admin/TenantBrandLogo';
import { useTenantBranding } from '../context/TenantBrandingContext';
import React from 'react';
import { flushSync } from 'react-dom';
import { API_BASE_URL, apiFetch as fetch } from '../config/api';
import { adminReservationTimes } from '../domain/reservations/tableConfig';
import { getUnavailableSelectedTableIds, getUnavailableTableIdsForSlot } from '../domain/reservations/availability';
import { getAvailableReservationTimesForDate, isPastTimeForDate } from '../domain/reservations/dateTimeRules';
import '../components/floorplan/cofein-map.css';
import { shouldUseNativeMapFullscreen } from '../domain/adminMap/mapInteraction';
import { formatBirthdayEmailSentAt, daysUntilBirthday, getCustomerBirthDate, searchCustomers, sortCustomers } from '../domain/customers/customerDirectory';
import { getActiveLayoutTables } from '../domain/reservations/adminPlanRules';
import { resolveAdminMapViewMode } from '../domain/adminMap/mapViewMode';

const adminMapViewStorageKey = () => tenantStorageKey(tenantContext.tenantId === "cofein" ? "cofein-admin-map-view-mode-v1" : "casa-admin-map-view-mode");

const emptyMenuItem = {
  nameBg: "",
  nameEn: "",
  nameRu: "",
  descriptionBg: "",
  descriptionEn: "",
  descriptionRu: "",
  imageUrl: "",
  weight: "",
  price: "",
  department: "Kitchen",
  category: isCasaTenant ? "Main" : tenantCategoryOptions(tenantContext.tenantId, "Kitchen")[0] || "",
  isActive: true,
  notifySubscribers: false,
};

const emptyEventItem = {
  titleBg: "",
  titleEn: "",
  textBg: "",
  textEn: "",
  badge: "",
  imageUrls: [],
  isActive: true,
  activeUntilLocal: "",
};

// Retain the published Casa wording; other restaurants use their plan names.
function getAdminZoneLabel(zone, language, usage = "seasonal") {
  if (!isCasaTenant || !zone?.presentation?.startsWith("casa-")) return getZoneName(zone, language);
  if (usage === "selection") {
    const labels = {
      indoor: ["Зала / непушачи", "Hall / non-smoking"],
      garden: ["Покрита тераса / пушачи", "Covered terrace / smoking"],
      openTerrace: ["Открита тераса / пушачи", "Open terrace / smoking"],
    };
    return labels[zone.id]?.[language === "bg" ? 0 : 1] || getZoneName(zone, language);
  }
  if (zone.id === "indoor") return adminLocalText(language, "Зала / Непушачи", "Indoor / Non-smoking", usage === "block" ? "Зал / Для некурящих" : "Зал / Некурящие");
  return getZoneName(zone, language);
}

function getCustomerProfileKey(profile) {
  const email = String(profile.email ?? profile.Email ?? "").trim().toLowerCase();
  const phone = String(profile.phone ?? profile.Phone ?? "").trim().toLowerCase();
  const id = profile.id ?? profile.Id;

  return email || phone || `profile-${id}`;
}

function getReservationCustomerKey(reservation) {
  const email = String(reservation.email || "").trim().toLowerCase();
  const phone = String(reservation.phone || "").trim().toLowerCase();

  return email || phone;
}

const emptyAdminReservation = {
  guestName: "",
  phone: "",
  email: "",
  guestCount: 2,
  area: "",
  reservedDate: "",
  reservedTime: "",
  tableIds: "",
  notes: "",
  internalNote: "",
};

const emptyManualCustomer = {
  guestName: "",
  phone: "",
  email: "",
  birthDate: "",
  marketingConsent: false,
};

const emptyHallBlock = {
  area: "",
  reservedDate: "",
  startTime: "10:00",
  endTime: "22:00",
  note: "",
};

const defaultRestaurantClosure = {
  enabled: true,
  startDate: "2026-07-27",
  endDate: "2026-08-02",
  reopenDate: "2026-08-03",
  message: "Уважаеми клиенти и приятели,\nОт 27.07.2026г. до 02.08.2026г.\nРесторантът ще бъде в\nГОДИШЕН ОТПУСК.\nОчакваме ви отново на\n03.08.2026г.\nБлагодарим ви за разбирането!",
  isActive: true,
};

function isInteractiveSwipeTarget(target) {
  return Boolean(target?.closest?.(
    "input, textarea, select, button, a, [role='button'], [data-admin-swipe-lock='true']"
  ));
}

export default function AdminPage(props) {
  const [layoutSession] = React.useState(createLayoutSession);
  const layoutSync = React.useSyncExternalStore(layoutSession.subscribe, layoutSession.getSnapshot);
  const { savedPlan, savedTables, loaded } = layoutSync;
  const plan = React.useMemo(() => getAdminSessionPlan({ savedPlan, savedTables, loaded }, { isCasa: isCasaTenant }), [savedPlan, savedTables, loaded]);
  const context = React.useMemo(() => ({ plan }), [plan]);
  return <FloorPlanContext.Provider value={context}><AdminPageContent {...props} layoutSession={layoutSession} layoutSync={layoutSync} /></FloorPlanContext.Provider>;
}

function AdminPageContent({ adminToken, adminUser, onAdminLogout, onMenuChanged, onEventsChanged, theme, onToggleTheme, layoutSession, layoutSync }) {
  const adminFormId = React.useId();
  const { plan } = useFloorPlan();
  const { closedAreas, loaded: zonesLoaded, error: zonesError, updateZones, reloadZones } = useSeasonalZones();
  const [savingSeasonalArea, setSavingSeasonalArea] = React.useState("");

  const { branding } = useTenantBranding();
  const [activeTab, setActiveTab] = React.useState(() => {
    const requestedTab = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    return ["feedback", "dev"].includes(requestedTab) ? requestedTab : "home";
  });
  const [developerSection, setDeveloperSection] = React.useState("service");
  const [adminLanguage, setAdminLanguage] = React.useState("bg");
  const [reservations, setReservations] = React.useState([]);
  const [reservationsLoaded, setReservationsLoaded] = React.useState(false);
  const [reservationsStale, setReservationsStale] = React.useState(false);
  const [diningOrders, setDiningOrders] = React.useState([]);
  const [menuItems, setMenuItems] = React.useState([]);
  const [eventItems, setEventItems] = React.useState([]);
  const [blacklist, setBlacklist] = React.useState([]);
  const [publicTableHolds, setPublicTableHolds] = React.useState([]);
  const [customerProfiles, setCustomerProfiles] = React.useState([]);
  const [adminUsers, setAdminUsers] = React.useState([]);
  const [auditLogs, setAuditLogs] = React.useState([]);
  const [feedbackEntries, setFeedbackEntries] = React.useState([]);
  const [feedbackEmails, setFeedbackEmails] = React.useState([]);
  const [feedbackTestEmail, setFeedbackTestEmail] = React.useState("");
  const [feedbackTestBusy, setFeedbackTestBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [feedbackSearch, setFeedbackSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("All");
  const [expandedId, setExpandedId] = React.useState(null);
  const [expandedOrderId, setExpandedOrderId] = React.useState(null);
  const [expandedCustomerKey, setExpandedCustomerKey] = React.useState(null);
  const [menuMode, setMenuMode] = React.useState("list");
  const [eventMode, setEventMode] = React.useState("list");
  const [selectedMenuDepartment, setSelectedMenuDepartment] = React.useState("Kitchen");
  const [selectedMenuCategory, setSelectedMenuCategory] = React.useState("");
  const menuItemsRef = React.useRef(null);
  const seenKitchenOrderIdsRef = React.useRef(new Set());
  const seenKitchenItemIdsRef = React.useRef(new Set());
  const seenBarOrderIdsRef = React.useRef(new Set());
  const seenBarItemIdsRef = React.useRef(new Set());
  const seenReadyItemIdsRef = React.useRef(new Set());
  const seenWaiterGuestItemIdsRef = React.useRef(new Set());
  const [blacklistMode, setBlacklistMode] = React.useState("list");
  const [customersMode, setCustomersMode] = React.useState("customers");
  const [customerPeriod, setCustomerPeriod] = React.useState("all");
  const [customerSort, setCustomerSort] = React.useState("visits");
  const [customerQuery, setCustomerQuery] = React.useState("");
  const [birthdayEmailStates, setBirthdayEmailStates] = React.useState({});
  const birthdayEmailPendingRef = React.useRef(new Set());
  const [showManualCustomerForm, setShowManualCustomerForm] = React.useState(false);
  const [showCreateReservation, setShowCreateReservation] = React.useState(false);
  const [menuForm, setMenuForm] = React.useState(emptyMenuItem);
  const [editingMenuId, setEditingMenuId] = React.useState(null);
  const [eventForm, setEventForm] = React.useState(emptyEventItem);
  const [editingEventId, setEditingEventId] = React.useState(null);
  const [adminReservation, setAdminReservation] = React.useState(emptyAdminReservation);
  React.useEffect(() => {
    if (zonesLoaded && (!plan.zones.some(zone => zone.isActive && zone.id === adminReservation.area) || closedAreas.includes(adminReservation.area))) {
      setAdminReservation((current) => ({ ...current, area: plan.zones.find(zone => zone.isActive && !closedAreas.includes(zone.id))?.id || "", tableIds: "" }));
    }
  }, [closedAreas, zonesLoaded, adminReservation.area, plan.zones]);

  const [tableEdits, setTableEdits] = React.useState({});
  const tableLayout = activeTab === "layout" ? layoutSync.tables : layoutSync.savedTables;
  const setTableLayout = layoutSession.edit;
  const [layoutArea, setLayoutArea] = React.useState("");
  const [reservationMapArea, setReservationMapArea] = React.useState("");
  const layoutZones = layoutSync.plan?.zones || plan.zones;
  React.useEffect(() => {
    if (!layoutZones.some(zone => zone.id === layoutArea)) setLayoutArea(layoutZones[0]?.id || "");
  }, [layoutZones, layoutArea]);
  const [adminMapViewMode, setAdminMapViewMode] = React.useState(() => {
    let saved;
    try { saved = typeof window === "undefined" ? null : window.localStorage.getItem(adminMapViewStorageKey()); } catch { /* Storage is optional. */ }
    return resolveAdminMapViewMode(saved, tenantContext.tenantId);
  });
  const changeAdminMapViewMode = React.useCallback((mode) => {
    if (mode !== "section" && mode !== "scroll") return;
    setAdminMapViewMode(mode);
    try { window.localStorage.setItem(adminMapViewStorageKey(), mode); } catch { /* Keep the selected view for this session. */ }
  }, []);
  const [reservationMapDate, setReservationMapDate] = React.useState(() => formatLocalDate(new Date()));
  const [noteEdits, setNoteEdits] = React.useState({});
  const [orderMenuSearches, setOrderMenuSearches] = React.useState({});
  const [hallBlock, setHallBlock] = React.useState(emptyHallBlock);
  const [unblockingHallId, setUnblockingHallId] = React.useState(null);
  const [restaurantClosure, setRestaurantClosure] = React.useState(defaultRestaurantClosure);
  const [adminNotice, setAdminNotice] = React.useState("");
  const [adminError, setAdminError] = React.useState("");
  const [pushPermission, setPushPermission] = React.useState(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission;
  });
  const [pushEnabled, setPushEnabled] = React.useState(false);
  const [notificationsAllowed, setNotificationsAllowed] = React.useState(false);
  const showTenantNotification = React.useCallback((title, body) => {
    if (notificationsAllowed) showBrowserNotification(title, body, isCasaTenant ? "/casa-fratelli-icon-192.png" : branding.faviconUrl);
  }, [notificationsAllowed, branding.faviconUrl]);
  const [statsPeriod, setStatsPeriod] = React.useState("today");
  const [reportsPeriod, setReportsPeriod] = React.useState("all");
  const adminSwipeStartRef = React.useRef(null);
  const [blacklistForm, setBlacklistForm] = React.useState({
    guestName: "",
    phone: "",
    email: "",
    reason: "No-show",
    notes: "",
  });
  const [manualCustomerForm, setManualCustomerForm] = React.useState(emptyManualCustomer);
  const [adminUserForm, setAdminUserForm] = React.useState({
    name: "",
    email: "",
    password: "",
    role: "Administrator",
  });
  const [ownPasswordForm, setOwnPasswordForm] = React.useState({
    currentPassword: "",
    newPassword: "",
  });
  const [showOwnPasswords, setShowOwnPasswords] = React.useState({
    currentPassword: false,
    newPassword: false,
  });
  const [reservationTrashOpen, setReservationTrashOpen] = React.useState(false);
  const reservationTrashRef = React.useRef(null);
  React.useEffect(() => {
    if (!reservationTrashOpen) return;
    const closeOutsideTrash = (event) => {
      if (!reservationTrashRef.current?.contains(event.target)) setReservationTrashOpen(false);
    };
    document.addEventListener("pointerdown", closeOutsideTrash, true);
    return () => document.removeEventListener("pointerdown", closeOutsideTrash, true);
  }, [reservationTrashOpen]);
  const [deletedReservations, setDeletedReservations] = React.useState([]);
  const [reservationTrashBusy, setReservationTrashBusy] = React.useState(false);
  const [reservationTrashError, setReservationTrashError] = React.useState("");
  const [editingAdminId, setEditingAdminId] = React.useState(null);
  const [adminEditForm, setAdminEditForm] = React.useState({
    name: "",
    email: "",
    password: "",
    role: "Administrator",
    isActive: true,
  });
  const [productTier, setProductTier] = React.useState("Basic");
  const isProVersion = productTier === "Pro";
  const currentAdminRole = normalizeAdminRole(adminUser?.role);
  const isWaiterRole = currentAdminRole === "Waiter";
  const isKitchenRole = currentAdminRole === "Kitchen";
  const isBarRole = currentAdminRole === "Bar";
  const isProductionRole = isKitchenRole || isBarRole;
  const isOperationalRole = isWaiterRole || isProductionRole;
  const isDeveloperRole = currentAdminRole === "Developer";
  const canManageMarketing = ["Owner", "Developer"].includes(currentAdminRole);
  const canUseMaintenance = ["Administrator", "Owner", "Developer"].includes(currentAdminRole);
  const canUseReservationTrash = canUseMaintenance;
  const canViewFeedback = ["Administrator", "Owner", "Developer"].includes(currentAdminRole);
  const canManageAdmins = ["Owner", "Developer"].includes(currentAdminRole) ||
    ["administrator", "admin", "manager"].includes(String(adminUser?.role || "").trim().toLowerCase());
  const hasDeveloperAdmin = adminUsers.some((user) => normalizeAdminRole(user.role || user.Role) === "Developer");
  const availableAdminRoleOptions = adminRoleOptions.filter((role) => {
    if (!isProVersion && ["Waiter", "Kitchen", "Bar"].includes(role.value)) return false;
    if (currentAdminRole === "Administrator") return ["Administrator", "Waiter", "Kitchen", "Bar"].includes(role.value);
    return currentAdminRole === "Developer" || role.value !== "Developer" || !hasDeveloperAdmin;
  });
  React.useEffect(() => {
    setEditingAdminId(null);
    setAdminUserForm((previous) => ({ ...previous, role: "Administrator" }));
  }, [currentAdminRole]);

  const activeTablesByArea = React.useMemo(() => {
    const areas = plan.zones.filter(zone => zone.isActive).map(zone => zone.id);
    const next = {};

    areas.forEach((area) => {
      next[area] = getActiveLayoutTables(plan.tables, area)
        .sort((first, second) => first.id.localeCompare(second.id, undefined, { numeric: true }));
    });

    next.all = areas.flatMap((area) => next[area]);
    return next;
  }, [plan]);
  const activeTableIdsByArea = React.useMemo(
    () => Object.fromEntries(Object.entries(activeTablesByArea).map(([area, tables]) => [area, tables.map(table => table.id)])),
    [activeTablesByArea]
  );

  const withAdminToken = React.useCallback(
    (options = {}) => ({
      ...options,
      headers: {
        ...(options.headers || {}),
        "X-Admin-Token": adminToken,
      },
    }),
    [adminToken]
  );

  const adminFetch = React.useCallback(
    (url, options = {}) => fetch(url, withAdminToken(options)),
    [withAdminToken]
  );

  React.useEffect(() => {
    async function loadRestaurantClosure() {
      try {
        const response = await adminFetch(`${API_BASE_URL}/api/restaurant-closure`);
        if (response.ok) setRestaurantClosure(await response.json());
      } catch (error) {
        console.warn("Failed to load restaurant closure.", error);
      }
    }
    loadRestaurantClosure();
  }, [adminFetch]);

  React.useEffect(() => {
    let isMounted = true;

    async function checkPushSubscription() {
      if (typeof window === "undefined" || !adminToken || !("Notification" in window)) return;

      try {
        const response = await adminFetch(`${API_BASE_URL}/api/admin/push/config`);
        const config = response.ok ? await response.json() : null;
        const allowed = config?.enabled === true || (isCasaTenant && config?.enabled == null && Boolean(config?.publicKey));
        if (!isMounted) return;
        setNotificationsAllowed(allowed);
        if (!allowed || !("serviceWorker" in navigator) || !("PushManager" in window)) {
          setPushEnabled(false);
          return;
        }
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (isMounted) {
          setPushEnabled(Boolean(subscription));
          setPushPermission(Notification.permission);
        }
      } catch {
        if (isMounted) {
          setNotificationsAllowed(false);
          setPushEnabled(false);
        }
      }
    }

    checkPushSubscription();

    return () => {
      isMounted = false;
    };
  }, [adminToken, adminFetch]);

  const loadReservations = React.useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setAdminError("");
    }

    try {
      const reservationsData = await fetchJsonOrEmpty(`${API_BASE_URL}/api/reservations`, [], withAdminToken());
      setReservations(Array.isArray(reservationsData) ? reservationsData.map(normalizeReservation).filter((reservation) => reservation.status !== "Cancelled") : []);
      setReservationsLoaded(true);
      setReservationsStale(false);
    } catch (error) {
      setReservationsStale(true);
      console.error("Failed to load reservations", error);
      if (!silent) {
        setAdminError(error?.message || "Failed to load reservations.");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [withAdminToken]);

  const loadDeletedReservations = React.useCallback(async ({ silent = false } = {}) => {
    if (!canUseReservationTrash) {
      setDeletedReservations([]);
      return;
    }

    if (!silent) {
      setReservationTrashBusy(true);
      setReservationTrashError("");
    }

    try {
      const data = await fetchJsonOrEmpty(`${API_BASE_URL}/api/maintenance/reservations/archive?kind=deleted`, [], withAdminToken());
      setDeletedReservations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load deleted reservations", error);
      if (!silent) {
        setReservationTrashError(error?.message || "Failed to load deleted reservations.");
      }
    } finally {
      if (!silent) {
        setReservationTrashBusy(false);
      }
    }
  }, [canUseReservationTrash, withAdminToken]);

  const loadMenuItems = React.useCallback(async () => {
    try {
      const menuData = await fetchJsonOrEmpty(`${API_BASE_URL}/api/menu`, [], withAdminToken());
      setMenuItems(Array.isArray(menuData) ? menuData : []);
    } catch (error) {
      console.error("Failed to load menu", error);
      setAdminError(error?.message || "Failed to load menu.");
    }
  }, [withAdminToken]);

  React.useEffect(() => {
    if (!canUseReservationTrash) return;
    loadDeletedReservations({ silent: true });
  }, [canUseReservationTrash, loadDeletedReservations]);

  const loadEvents = React.useCallback(async () => {
    try {
      const eventData = await fetchJsonOrEmpty(`${API_BASE_URL}/api/events/admin`, [], withAdminToken());
      setEventItems(Array.isArray(eventData) ? eventData : []);
    } catch (error) {
      console.error("Failed to load events", error);
      setAdminError(error?.message || "Failed to load events.");
    }
  }, [withAdminToken]);

  const loadFeedbackEntries = React.useCallback(async () => {
    try {
      const query = feedbackSearch.trim() ? `?search=${encodeURIComponent(feedbackSearch.trim())}` : "";
      const [feedbackData, emailData] = await Promise.all([
        fetchJsonOrEmpty(`${API_BASE_URL}/api/feedback${query}`, [], withAdminToken()),
        fetchJsonOrEmpty(`${API_BASE_URL}/api/feedback/emails`, [], withAdminToken()),
      ]);
      setFeedbackEntries(Array.isArray(feedbackData) ? feedbackData : []);
      setFeedbackEmails(Array.isArray(emailData) ? emailData : []);
    } catch (error) {
      console.error("Failed to load feedback", error);
      setAdminError(error?.message || "Failed to load feedback.");
    }
  }, [feedbackSearch, withAdminToken]);

  async function sendFeedbackTest(event) {
    event.preventDefault();
    if (feedbackTestBusy) return;
    setFeedbackTestBusy(true);
    setAdminError("");
    setAdminNotice("");
    try {
      const response = await adminFetch(`${API_BASE_URL}/api/feedback/test-email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: feedbackTestEmail }) });
      if (!response.ok) throw new Error(await readErrorMessage(response, "Test email failed."));
      setAdminNotice(adminLocalText(adminLanguage, "Resend прие тестовото писмо. Проверете входящата поща.", "Resend accepted the test email. Please check the inbox.", "Resend принял тестовое письмо. Проверьте входящую почту."));
    } catch (error) { setAdminError(error.message); }
    finally { setFeedbackTestBusy(false); }
  }

  async function markFeedbackDiscountUsed(id) {
    setAdminError("");
    const response = await adminFetch(`${API_BASE_URL}/api/feedback/${id}/discount-used`, { method: "PATCH" });
    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to mark discount as used."));
      return;
    }
    await loadFeedbackEntries();
  }

  async function deleteFeedbackEntry(id) {
    if (!window.confirm(adminLocalText(adminLanguage, "Да изтрия ли тази обратна връзка?", "Delete this feedback entry?", "Удалить эту обратную связь?"))) return;

    setAdminError("");
    const response = await adminFetch(`${API_BASE_URL}/api/feedback/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setAdminError(await readErrorMessage(
        response,
        adminLocalText(adminLanguage, "Неуспешно изтриване на обратна връзка.", "Failed to delete feedback.", "Не удалось удалить обратную связь.")
      ));
      return;
    }
    await loadFeedbackEntries();
  }

  const loadDiningOrders = React.useCallback(async ({ silent = false, force = false } = {}) => {
    if (!isProVersion && !force) {
      setDiningOrders([]);
      return;
    }

    try {
      const ordersData = await fetchJsonOrEmpty(`${API_BASE_URL}/api/dining-orders`, [], withAdminToken());
      setDiningOrders(Array.isArray(ordersData) ? ordersData.map(normalizeDiningOrder) : []);
    } catch (error) {
      console.error("Failed to load dining orders", error);
      if (!silent) {
        setAdminError(error?.message || "Failed to load dining orders.");
      }
    }
  }, [isProVersion, withAdminToken]);

  const loadProductTier = React.useCallback(async () => {
    try {
      const data = await fetchJsonOrEmpty(`${API_BASE_URL}/api/product-tier`, { tier: "Basic" }, withAdminToken());
      setProductTier(data?.isPro || data?.tier === "Pro" ? "Pro" : "Basic");
    } catch (error) {
      console.error("Failed to load product tier", error);
      setProductTier("Basic");
    }
  }, [withAdminToken]);

  const loadBlacklist = React.useCallback(async () => {
    try {
      const blacklistData = await fetchJsonOrEmpty(`${API_BASE_URL}/api/blacklist`, [], withAdminToken());
      setBlacklist(Array.isArray(blacklistData) ? blacklistData : []);
    } catch (error) {
      console.error("Failed to load blacklist", error);
      setAdminError(error?.message || "Failed to load blacklist.");
    }
  }, [withAdminToken]);

  const loadPublicTableHolds = React.useCallback(async () => {
    try {
      const data = await fetchJsonOrEmpty(
        `${API_BASE_URL}/api/reservations/public-table-holds`,
        [],
        withAdminToken()
      );
      setPublicTableHolds(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load public table holds", error);
      setAdminError(error?.message || "Failed to load blocked public tables.");
    }
  }, [withAdminToken]);

  const loadCustomerProfiles = React.useCallback(async () => {
    try {
      const data = await fetchJsonOrEmpty(`${API_BASE_URL}/api/customers`, [], withAdminToken());
      setCustomerProfiles(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load customer profiles", error);
      setAdminError(error?.message || adminLocalText(adminLanguage, "Неуспешно зареждане на клиенти.", "Failed to load customer profiles.", "Не удалось загрузить клиентов."));
    }
  }, [adminLanguage, withAdminToken]);

  const loadTableLayout = React.useCallback(async () => {
    try {
      await layoutSession.load({ request: adminFetch, baseUrl: API_BASE_URL, normalize: normalizeLayoutItem, allowLegacy: isCasaTenant });
    } catch (error) {
      console.error("Failed to load table layout", error);
      setAdminError(error?.message || "Failed to load table layout.");
    }
  }, [adminFetch, layoutSession]);

  const loadAdminUsers = React.useCallback(async () => {
    try {
      const data = await fetchJsonOrEmpty(`${API_BASE_URL}/api/admin/users`, [], withAdminToken());
      setAdminUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      setAdminError(error?.message || "Failed to load admin users.");
    }
  }, [withAdminToken]);

  const loadAuditLogs = React.useCallback(async () => {
    try {
      const data = await fetchJsonOrEmpty(`${API_BASE_URL}/api/admin/audit`, [], withAdminToken());
      setAuditLogs(Array.isArray(data) ? data : []);
    } catch (error) {
      setAdminError(error?.message || "Failed to load audit logs.");
    }
  }, [withAdminToken]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      await loadProductTier();

      if (isWaiterRole && isProVersion) {
        setLoading(true);
        setAdminError("");
        await Promise.all([loadReservations(), loadDiningOrders(), loadTableLayout(), loadMenuItems()]);
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      if (isProductionRole && isProVersion) {
        setLoading(true);
        setAdminError("");
        await Promise.all([loadDiningOrders(), loadMenuItems()]);
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      loadReservations();
      loadBlacklist();
      loadPublicTableHolds();
      loadCustomerProfiles();
      if (isProVersion) {
        loadDiningOrders();
      }
      loadTableLayout();
      loadEvents();
      if (canViewFeedback) {
        loadFeedbackEntries();
      }
    }

    loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [canViewFeedback, isProductionRole, isProVersion, isWaiterRole, loadBlacklist, loadCustomerProfiles, loadDiningOrders, loadEvents, loadFeedbackEntries, loadMenuItems, loadProductTier, loadPublicTableHolds, loadReservations, loadTableLayout]);

  React.useEffect(() => {
    setAdminError("");

    if (activeTab === "menu" && !isWaiterRole) {
      loadMenuItems();
    }

    if (activeTab === "events" && !isWaiterRole && !isProductionRole) {
      loadEvents();
    }

    if (activeTab === "feedback" && canViewFeedback) {
      loadFeedbackEntries();
    }

    if (activeTab === "orders" && isProVersion) {
      loadDiningOrders();
      loadMenuItems();
    }

    if ((activeTab === "customers" || activeTab === "reports") && !isWaiterRole && !isProductionRole) {
      loadReservations({ silent: true });
      loadCustomerProfiles();
      if (isProVersion) {
        loadDiningOrders();
      }
    }

    if (activeTab === "blacklist" && !isWaiterRole) {
      loadBlacklist();
    }

    if (activeTab === "layout" || activeTab === "liveMap") {
      loadTableLayout();
    }

    if (activeTab === "liveMap") {
      loadReservations({ silent: true });
      if (isProVersion) {
        loadDiningOrders();
        loadMenuItems();
      }
      loadMenuItems();
    }

    if (canManageAdmins && (activeTab === "admins" || (activeTab === "dev" && isDeveloperRole && developerSection === "access"))) {
      loadAdminUsers();
      loadAuditLogs();
    }
  }, [activeTab, canManageAdmins, canViewFeedback, developerSection, isDeveloperRole, isProductionRole, isProVersion, isWaiterRole, loadAdminUsers, loadAuditLogs, loadBlacklist, loadCustomerProfiles, loadDiningOrders, loadEvents, loadFeedbackEntries, loadMenuItems, loadReservations, loadTableLayout]);

  React.useEffect(() => {
    if (activeTab === "liveMap") {
      adminSwipeStartRef.current = null;
      return undefined;
    }

    const pages = isProductionRole
      ? ["home", "orders"]
      : isWaiterRole
      ? ["home", "liveMap", "orders"]
      : canManageAdmins
      ? ["home", "liveMap", "reservations", "orders", "reports", "block", "menu", "events", ...(canViewFeedback ? ["feedback"] : []), "layout", "customers", isDeveloperRole ? "dev" : "admins"]
      : ["home", "liveMap", "reservations", "orders", "reports", "block", "menu", "events", ...(canViewFeedback ? ["feedback"] : []), "layout", "customers"];

    const handleTouchStart = (event) => {
      if (event.touches.length !== 1 || isInteractiveSwipeTarget(event.target)) {
        adminSwipeStartRef.current = null;
        return;
      }

      const touch = event.touches[0];
      adminSwipeStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
      };
    };

    const handleTouchEnd = (event) => {
      const start = adminSwipeStartRef.current;
      adminSwipeStartRef.current = null;
      if (!start || event.changedTouches.length !== 1) return;

      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      if (Math.abs(deltaX) < 70 || Math.abs(deltaX) < Math.abs(deltaY) * 1.35) return;

      const index = pages.indexOf(activeTab);
      if (index === -1) return;

      const nextIndex = deltaX < 0 ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= pages.length) return;

      setActiveTab(pages[nextIndex]);
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [activeTab, canManageAdmins, canViewFeedback, isDeveloperRole, isProductionRole, isWaiterRole]);

  function updateTableLayoutItem(tableId, nextItem) {
    const normalized = normalizeLayoutItem(nextItem);
    if (!normalized.id) {
      setAdminError(adminLanguage === "bg" ? "Въведете номер на масата." : "Enter a table number.");
      return;
    }
    if (
      normalized.id !== tableId &&
      tableLayout.some((item) => item.id.toLowerCase() === normalized.id.toLowerCase())
    ) {
      setAdminError(adminLanguage === "bg" ? "Вече има маса с този номер." : "A table with this number already exists.");
      return;
    }
    if (hasLayoutOverlap(tableLayout, normalized, tableId)) {
      setAdminError(a.layout.overlap);
      return;
    }

    setAdminError("");
    setTableLayout((prev) => prev.map((item) => (item.id === tableId ? normalized : item)));
  }

  function addTableLayoutItem() {
    if (!layoutArea) return;
    if (tableLayout.length >= 500) {
      setAdminError(adminLocalText(adminLanguage, "Достигнат е лимитът от 500 маси.", "The limit of 500 tables has been reached.", "Достигнут лимит в 500 столов."));
      return;
    }
    const point = nextTablePosition(tableLayout, layoutArea);
    if (!point) {
      setAdminError(adminLocalText(adminLanguage, "Няма свободна позиция. Преместете масите или добавете зала.", "No free position. Move tables or add a hall.", "Нет свободной позиции. Переставьте столы или добавьте зал."));
      return;
    }
    const nextNumber = Math.max(
      0,
      ...tableLayout.map((item) => Number.parseInt(String(item.id).replace(/\D/g, ""), 10)).filter(Number.isFinite)
    ) + 1;
    const candidate = {
      id: String(nextNumber),
      area: layoutArea,
      ...point,
      seats: 4,
      special: false,
      wide: layoutZones.find(zone => zone.id === layoutArea)?.presentation === "casa-indoor",
      isActive: true,
    };

    setAdminError("");
    setTableLayout((prev) => [...prev, candidate]);
  }

  function removeTableLayoutItem(tableId) {
    setTableLayout((prev) => prev.filter((item) => item.id !== tableId));
  }

  async function saveTableLayout() {
    setAdminNotice("");
    setAdminError("");
    try {
      if (await layoutSession.save({ request: adminFetch, baseUrl: API_BASE_URL, normalize: normalizeLayoutItem, allowLegacy: isCasaTenant })) {
        setAdminNotice("Table layout saved.");
      }
    } catch (error) {
      setAdminError(error?.acknowledged
        ? adminLocalText(adminLanguage, "Промените са записани, но картата не се обнови. Заредете я отново.", "Changes were saved, but the map could not refresh. Reload it.", "Изменения сохранены, но карта не обновилась. Загрузите её заново.")
        : error?.status === 409 || error?.status === 428
        ? adminLocalText(adminLanguage, "Картата е променена. Вашите промени са запазени тук; заредете актуалната карта преди нов запис.", "The map has changed. Your draft is kept here; reload the current map before saving again.", "Карта изменилась. Ваш черновик сохранён здесь; загрузите актуальную карту перед повторным сохранением.")
        : error?.message || "Failed to save table layout.");
    }
  }

  async function reloadTableLayout() {
    const current = layoutSession.getSnapshot();
    if ((current.dirty || current.requiresReload) && !window.confirm(adminLocalText(adminLanguage,
      "Да отхвърлим местните промени и да заредим актуалната карта?",
      "Discard local changes and load the current map?",
      "Отменить локальные изменения и загрузить актуальную карту?"))) return;
    setAdminError("");
    setAdminNotice("");
    try {
      await layoutSession.load({ request: adminFetch, baseUrl: API_BASE_URL, normalize: normalizeLayoutItem, discard: true, allowLegacy: isCasaTenant });
    } catch (error) {
      setAdminError(error?.message || "Failed to load table layout.");
    }
  }

  async function updateStatus(id, action) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/reservations/${id}/${action}`, {
      method: "PATCH",
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to update reservation status."));
      return;
    }

    await Promise.all([loadReservations(), loadDeletedReservations({ silent: true })]);
  }

  async function archiveReservation(id) {
    setAdminNotice("");
    setAdminError("");

    const confirmed = window.confirm(
      adminLanguage === "bg"
        ? "Да архивираме ли тази резервация? Тя ще се скрие от обичайните списъци, но може да се възстанови от Поддръжка."
        : "Archive this reservation? It will be hidden from regular lists, but can be restored from Maintenance."
    );
    if (!confirmed) return;

    const response = await adminFetch(`${API_BASE_URL}/api/maintenance/reservations/${id}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: adminLanguage === "bg" ? "Архивирана от списъка с резервации" : "Archived from reservations list",
      }),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to archive reservation."));
      return;
    }

    setAdminNotice(adminLanguage === "bg" ? "Резервацията е архивирана." : "Reservation archived.");
    await Promise.all([
      loadReservations(),
      loadDeletedReservations({ silent: true }),
    ]);
  }

  async function restoreReservationFromTrash(id) {
    setAdminNotice("");
    setAdminError("");
    setReservationTrashError("");
    setReservationTrashBusy(true);

    try {
      const response = await adminFetch(`${API_BASE_URL}/api/maintenance/reservations/${id}/restore`, { method: "POST" });
      if (!response.ok) {
        const message = await readErrorMessage(response, "Failed to restore reservation.");
        setReservationTrashError(message);
        return;
      }

      setAdminNotice(adminLanguage === "bg" ? "Резервацията е възстановена." : "Reservation restored.");
      await Promise.all([
        loadReservations({ silent: true }),
        loadDeletedReservations({ silent: true }),
      ]);
    } catch (error) {
      console.error("Failed to restore reservation", error);
      setReservationTrashError(error?.message || "Failed to restore reservation.");
    } finally {
      setReservationTrashBusy(false);
    }
  }

  async function processAllReservationTrash(restore) {
    if (reservationTrashBusy || !deletedReservations.length) return;
    const question = restore
      ? adminLocalText(adminLanguage, "Да възстановим ли всички резервации от кошчето? Резервациите с конфликти ще останат в него.", "Restore all reservations in the trash? Conflicting reservations will remain there.", "Восстановить все брони из корзины? Брони с конфликтами останутся в ней.")
      : adminLocalText(adminLanguage, "Да изчистим ли всички резервации от кошчето завинаги? Възстановяване няма да е възможно. Свързаните поръчки ще се запазят в архива.", "Permanently empty the reservation trash? This cannot be undone. Linked orders will be preserved in the archive.", "Очистить всю корзину броней навсегда? Восстановление невозможно. Связанные заказы сохранятся в архиве.");
    if (!window.confirm(question)) return;
    setReservationTrashBusy(true);
    setReservationTrashError("");
    setAdminNotice("");
    try {
      const response = await adminFetch(`${API_BASE_URL}/api/maintenance/reservations/deleted/${restore ? "restore" : "permanent"}`, { method: restore ? "POST" : "DELETE" });
      if (!response.ok) {
        setReservationTrashError(await readErrorMessage(response, "Could not process reservation trash."));
        return;
      }
      const result = await response.json();
      const summary = adminLocalText(adminLanguage,
        `${restore ? "Възстановени" : "Изтрити завинаги"}: ${result.succeeded}. Останали необработени: ${result.failed}.`,
        `${restore ? "Restored" : "Permanently deleted"}: ${result.succeeded}. Not processed: ${result.failed}.`,
        `${restore ? "Восстановлено" : "Удалено навсегда"}: ${result.succeeded}. Не обработано: ${result.failed}.`);
      setAdminNotice(summary);
      if (result.failed) setReservationTrashError(summary);
    } catch {
      setReservationTrashError(adminLocalText(adminLanguage, "Няма връзка със сървъра. Проверете кошчето преди повторен опит.", "Connection failed. Check the trash before trying again.", "Нет связи с сервером. Проверьте корзину перед повторной попыткой."));
    } finally {
      await Promise.all([loadReservations({ silent: true }), loadDeletedReservations({ silent: true }), loadDiningOrders()]);
      setReservationTrashBusy(false);
    }
  }

  async function permanentlyDeleteReservationFromTrash(id) {
    if (!window.confirm(adminLocalText(adminLanguage,
      "Да изтрием ли окончателно тази резервация? Възстановяване няма да е възможно. Свързаните поръчки ще се запазят в архива.",
      "Permanently delete this reservation? It cannot be restored. Linked orders will be preserved in the archive.",
      "Удалить эту бронь навсегда? Восстановить её будет невозможно. Связанные заказы сохранятся в архиве."
    ))) return;
    setReservationTrashBusy(true);
    setReservationTrashError("");
    try {
      const response = await adminFetch(`${API_BASE_URL}/api/maintenance/reservations/${id}/permanent`, { method: "DELETE" });
      if (!response.ok) {
        setReservationTrashError(await readErrorMessage(response, "Failed to delete reservation."));
        return;
      }
      await loadDeletedReservations({ silent: true });
    } catch (error) {
      setReservationTrashError(error?.message || "Failed to delete reservation.");
    } finally {
      setReservationTrashBusy(false);
    }
  }

  async function updateDiningOrderStatus(orderId, status) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/dining-orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to update order status."));
      return;
    }

    setAdminNotice(adminLanguage === "bg" ? "Статусът на поръчката е обновен." : "Order status updated.");
    await loadDiningOrders();
  }

  async function claimDiningOrder(orderId) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/dining-orders/${orderId}/claim`, {
      method: "POST",
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to claim order."));
      return;
    }

    setAdminNotice(adminLanguage === "bg" ? "Поръчката е взета от Вас." : "Order assigned to you.");
    await Promise.all([loadReservations(), loadDiningOrders()]);
  }

  async function claimReservationForConsumption(reservationId) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/dining-orders/reservations/${reservationId}/claim`, {
      method: "POST",
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(
        response,
        adminLanguage === "bg"
          ? "Резервацията вече е взета от друг сервитьор."
          : "Reservation is already assigned to another waiter."
      ));
      await Promise.all([loadReservations(), loadDiningOrders()]);
      return false;
    }

    await Promise.all([loadReservations(), loadDiningOrders()]);
    return true;
  }

  async function updateDiningOrderItemStatus(itemId, status) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/dining-orders/items/${itemId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to update item status."));
      return;
    }

    await loadDiningOrders();
  }

  async function seatWalkInFromMap({ area, tableId, seats, guestCount: requestedGuestCount }) {
    setAdminNotice("");
    setAdminError("");

    const now = new Date();
    const minutesNow = now.getHours() * 60 + now.getMinutes();
    const opensAt = 10 * 60;
    const latestWalkIn = 23 * 60 + 30;

    if (minutesNow < opensAt || minutesNow > latestWalkIn) {
      setAdminError(
        adminLanguage === "bg"
          ? "Настаняване без резервация е възможно само в работното време на ресторанта: 10:00-23:30."
          : "Walk-in seating is available only during restaurant working hours: 10:00-23:30."
      );
      return false;
    }

    const guestCount = Math.max(1, Math.min(40, Number.parseInt(requestedGuestCount ?? Math.min(Number(seats || 2), 4), 10) || 2));
    const response = await adminFetch(`${API_BASE_URL}/api/reservations/walk-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        area,
        tableIds: [tableId],
        guestCount,
      }),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to seat walk-in guest."));
      return false;
    }

    setAdminNotice(adminLanguage === "bg" ? "Гостът е настанен без резервация." : "Walk-in guest seated.");
    await Promise.all([loadReservations(), loadDiningOrders()]);
    return true;
  }

  async function clearReservationsAndOrders() {
    setAdminNotice("");
    setAdminError("");

    const confirmed = window.confirm(
      adminLocalText(
        adminLanguage,
        `Да се архивират ли всички резервации и поръчки за ${branding.name} (${tenantContext.tenantId})?`,
        `Archive all reservations and orders for ${branding.name} (${tenantContext.tenantId})?`,
        `Архивировать все бронирования и заказы ресторана ${branding.name} (${tenantContext.tenantId})?`
      )
    );

    if (!confirmed) return;

    const confirmationCode = window.prompt(
      adminLanguage === "bg"
        ? "Въведете код за потвърждение."
        : "Enter the confirmation code."
    );

    if (confirmationCode !== "2215") {
      setAdminError(adminLanguage === "bg" ? "Грешен код за потвърждение." : "Wrong confirmation code.");
      return;
    }

    const response = await adminFetch(`${API_BASE_URL}/api/maintenance/clear-reservations-and-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmationCode }),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to clear reservations and orders."));
      return;
    }

    await Promise.all([loadReservations(), loadDiningOrders()]);
    setAdminNotice(
      adminLocalText(adminLanguage, "Всички резервации и поръчки са архивирани.", "All reservations and orders were archived.", "Все бронирования и заказы архивированы.")
    );
  }

  async function addConsumptionItem(reservationId, item) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/dining-orders/reservations/${reservationId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to add item."));
      return;
    }

    await loadDiningOrders();
  }

  async function addOrderItem(order, item) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/dining-orders/${order.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to add item."));
      return;
    }

    await loadDiningOrders();
    setOrderMenuSearches((prev) => ({ ...prev, [order.id]: "" }));
  }

  async function updateConsumptionItem(itemId, quantity) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/dining-orders/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to update item."));
      return;
    }

    await loadDiningOrders();
  }

  async function markReservationArrived(reservation) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/reservations/${reservation.id}/arrive`, {
      method: "PATCH",
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to mark reservation as arrived."));
      return;
    }

    setAdminNotice(adminLanguage === "bg" ? "Гостът е отбелязан като пристигнал." : "Guest marked as arrived.");
    await loadReservations();
  }

  async function markReservationNoShow(reservation) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/reservations/${reservation.id}/no-show`, {
      method: "PATCH",
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to mark reservation as no-show."));
      return;
    }

    setAdminNotice(adminLanguage === "bg" ? "Резервацията е освободена като no-show." : "Reservation released as no-show.");
    await loadReservations();
  }

  async function releaseReservationTable(reservation) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/reservations/${reservation.id}/release`, {
      method: "PATCH",
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to release reservation."));
      return;
    }

    const result = await response.json();
    const mailStatus = result.feedbackEmailStatus;
    const mailNotice = mailStatus === "sent"
      ? adminLocalText(adminLanguage, "Писмото за отзив е изпратено.", "Feedback email sent.", "Письмо с просьбой об отзыве отправлено.")
      : mailStatus === "queued"
      ? adminLocalText(adminLanguage, "Писмото е в опашката; ще бъде направен нов опит автоматично.", "Email queued; it will be retried automatically.", "Письмо в очереди; отправка будет повторена автоматически.")
      : mailStatus === "not-visited"
      ? adminLocalText(adminLanguage, "Писмо не е изпратено: гостът не е бил отбелязан като пристигнал.", "No email sent: the guest was not marked as arrived.", "Письмо не отправлено: приход гостя не был отмечен.")
      : mailStatus === "missing-email" || mailStatus === "not-queued"
      ? adminLocalText(adminLanguage, "Няма валиден email за изпращане на писмо.", "No valid guest email for sending feedback.", "Нет корректного email гостя для отправки письма.") : "";
    setAdminNotice(`${adminLocalText(adminLanguage, "Масата е освободена.", "Table released.", "Столик освобождён.")} ${mailNotice}`);
    await loadReservations();
  }

  async function blockReservationTablesFromPublic(reservation) {
    setAdminNotice("");
    setAdminError("");
    const response = await adminFetch(`${API_BASE_URL}/api/reservations/public-table-holds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservedDate: reservation.reservedDate,
        tableIds: reservation.tableIds,
        note: reservation.id ? `Reserved for restaurant use from reservation #${reservation.id}` : "Reserved for restaurant use from table map",
      }),
    });
    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to block the table from public booking."));
      return;
    }
    setAdminNotice(adminLocalText(
      adminLanguage,
      `Маса ${reservation.tableIds.join(", ")} е скрита от онлайн резервации за ${reservation.reservedDate}.`,
      `Table ${reservation.tableIds.join(", ")} is hidden from online booking for ${reservation.reservedDate}.`,
      `Стол ${reservation.tableIds.join(", ")} скрыт от онлайн-бронирования на ${reservation.reservedDate}.`
    ));
    await loadPublicTableHolds();
  }

  async function removePublicTableHold(hold) {
    const id = hold.id || hold.Id;
    if (!id) return;
    setAdminNotice("");
    setAdminError("");
    const response = await adminFetch(`${API_BASE_URL}/api/reservations/public-table-holds/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to remove the public table block."));
      return;
    }
    setAdminNotice(adminLocalText(adminLanguage, "Блокирането е премахнато.", "Public block removed.", "Блокировка снята."));
    await loadPublicTableHolds();
  }

  async function moveReservationFromMap(reservation, area, tableIds, guestCount) {
    setAdminNotice("");
    setAdminError("");

    const nextGuestCount = Number(guestCount || reservation.guestCount || 0);
    const unavailableTableIds = getUnavailableTableIdsForSlot(
      reservations,
      reservation.reservedDate,
      reservation.reservedTime,
      reservation.id
    );
    const unavailableSelectedTableIds = getUnavailableSelectedTableIds(tableIds, unavailableTableIds);

    if (unavailableSelectedTableIds.length > 0) {
      const message = adminLanguage === "bg"
        ? `Маса ${unavailableSelectedTableIds.join(", ")} вече е заета около този час.`
        : `Table ${unavailableSelectedTableIds.join(", ")} is already reserved around this time.`;
      setAdminError(message);
      return { ok: false, message };
    }

    const response = await adminFetch(`${API_BASE_URL}/api/reservations/${reservation.id}/tables`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        area,
        tableIds,
        guestCount: nextGuestCount,
      }),
    });

    if (!response.ok) {
      const message = await readErrorMessage(response, "Selected table is not available.");
      setAdminError(localizeReservationSaveError(message, adminLanguage));
      return { ok: false, message };
    }

    setAdminNotice(adminLanguage === "bg" ? "Резервацията е преместена." : "Reservation moved.");
    await Promise.all([loadReservations(), loadDiningOrders()]);
    return true;
  }

  function openReservationFromMap(reservation) {
    setSearch("");
    setStatusFilter("All");
    setExpandedId(reservation.id);
    setActiveTab("reservations");
  }

  function getTableEdit(reservation) {
    return (
      tableEdits[reservation.id] || {
        area: reservation.area,
        tableIds: reservation.tableIds,
        guestCount: reservation.guestCount,
        reservedDate: reservation.reservedDate,
        reservedTime: reservation.reservedTime,
      }
    );
  }

  function setTableEditArea(reservation, area) {
    setTableEdits((prev) => ({
      ...prev,
      [reservation.id]: {
        ...getTableEdit(reservation),
        area,
        tableIds: [],
      },
    }));
  }

  function setTableEditDateTime(reservation, key, value) {
    const current = getTableEdit(reservation);

    setTableEdits((prev) => ({
      ...prev,
      [reservation.id]: {
        ...current,
        [key]: value,
      },
    }));
  }

  function setTableEditGuestCount(reservation, guestCount) {
    const current = getTableEdit(reservation);

    setTableEdits((prev) => ({
      ...prev,
      [reservation.id]: {
        ...current,
        guestCount,
      },
    }));
  }

  function toggleTableEdit(reservation, tableId) {
    const current = getTableEdit(reservation);
    const exists = current.tableIds.includes(tableId);
    const nextTableIds = exists
      ? current.tableIds.filter((id) => id !== tableId)
      : [...current.tableIds, tableId];

    setTableEdits((prev) => ({
      ...prev,
      [reservation.id]: {
        ...current,
        tableIds: nextTableIds,
      },
    }));
  }

  function getAdminReservationTableIds() {
    return String(adminReservation.tableIds || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }

  function toggleAdminReservationTable(tableId) {
    if (adminReservationUnavailableTableIds.has(tableId)) {
      return;
    }

    const currentTableIds = getAdminReservationTableIds();
    const exists = currentTableIds.includes(tableId);
    const nextTableIds = exists
      ? currentTableIds.filter((id) => id !== tableId)
      : [...currentTableIds, tableId];

    setAdminReservation((prev) => ({
      ...prev,
      tableIds: nextTableIds.join(", "),
    }));
  }

  function selectAdminMenuCategory(categoryId) {
    setSelectedMenuCategory(categoryId);
    window.setTimeout(() => {
      menuItemsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  function getNoteEdit(reservation) {
    return noteEdits[reservation.id] ?? reservation.internalNote ?? "";
  }

  function setNoteEdit(reservation, value) {
    setNoteEdits((prev) => ({
      ...prev,
      [reservation.id]: value,
    }));
  }

  async function saveReservationNote(reservation) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/reservations/${reservation.id}/note`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        internalNote: getNoteEdit(reservation),
      }),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to update admin note."));
      return;
    }

    setNoteEdits((prev) => {
      const next = { ...prev };
      delete next[reservation.id];
      return next;
    });
    setAdminNotice("Admin note updated.");
    await loadReservations();
  }

  async function saveReservationTables(reservation) {
    const edit = getTableEdit(reservation);

    setAdminNotice("");
    setAdminError("");

    if (isPastTimeForDate(edit.reservedDate, edit.reservedTime)) {
      setAdminError(
        adminLanguage === "bg"
          ? "Не може да запазите резервация за дата или час, които вече са минали."
          : "You cannot save a reservation for a date or time that has already passed."
      );
      return;
    }

    const unavailableTableIds = getUnavailableTableIdsForSlot(
      reservations,
      edit.reservedDate,
      edit.reservedTime,
      reservation.id
    );
    const unavailableSelectedTableIds = getUnavailableSelectedTableIds(edit.tableIds, unavailableTableIds);

    if (unavailableSelectedTableIds.length > 0) {
      setAdminError(
        adminLanguage === "bg"
          ? `Маса ${unavailableSelectedTableIds.join(", ")} вече е заета около този час.`
          : `Table ${unavailableSelectedTableIds.join(", ")} is already reserved around this time.`
      );
      return;
    }

    const response = await adminFetch(`${API_BASE_URL}/api/reservations/${reservation.id}/tables`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        area: edit.area,
        tableIds: edit.tableIds,
        guestCount: Number(edit.guestCount || reservation.guestCount || 0),
        reservedDate: edit.reservedDate || reservation.reservedDate,
        reservedTime: edit.reservedTime || reservation.reservedTime,
      }),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Selected table is not available."));
      return;
    }

    setTableEdits((prev) => {
      const next = { ...prev };
      delete next[reservation.id];
      return next;
    });
    setAdminNotice("Tables updated.");
    await Promise.all([loadReservations(), loadDiningOrders()]);
  }

  async function saveBlacklistPayload(payload) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/blacklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to add to blacklist."));
      return false;
    }

    await loadBlacklist();
    setAdminNotice("Added to blacklist.");
    return true;
  }

  async function addToBlacklist(reservation) {
    await saveBlacklistPayload({
      guestName: reservation.guestName,
      phone: reservation.phone,
      email: reservation.email,
      reason: "Manual review",
      notes: reservation.internalNote || reservation.notes || "",
    });
  }

  async function sendCustomerBirthdayEmail(customer) {
    const id = customer.profileId;
    if (!canManageMarketing || !id || !customer.marketingConsent || !String(customer.email || "").trim() || birthdayEmailPendingRef.current.has(id)) return;
    birthdayEmailPendingRef.current.add(id);
    setBirthdayEmailStates((current) => ({ ...current, [id]: { status: "sending", message: "" } }));
    try {
      const response = await adminFetch(`${API_BASE_URL}/api/marketing/birthday/${id}/send`, { method: "POST" });
      if (!response.ok) {
        const message = await readErrorMessage(response, adminLocalText(adminLanguage, "Имейлът не е изпратен. Опитайте отново.", "Email was not sent. Try again.", "Письмо не отправлено. Повторите попытку."));
        setBirthdayEmailStates((current) => ({ ...current, [id]: { status: "error", message } }));
        return;
      }
      setBirthdayEmailStates((current) => ({ ...current, [id]: {
        status: "success",
        message: adminLocalText(adminLanguage, "Имейлът е изпратен успешно.", "Email sent successfully.", "Письмо успешно отправлено."),
      } }));
      await loadCustomerProfiles();
    } catch {
      setBirthdayEmailStates((current) => ({ ...current, [id]: {
        status: "error",
        message: adminLocalText(adminLanguage, "Не успяхме да потвърдим изпращането. Проверете последната отправка преди нов опит.", "Could not confirm sending. Check the last sent time before retrying.", "Не удалось подтвердить отправку. Проверьте время последней отправки перед повтором."),
      } }));
    } finally {
      birthdayEmailPendingRef.current.delete(id);
    }
  }

  async function addCustomerToBlacklist(customer) {
    await saveBlacklistPayload({
      guestName: customer.guestName || "",
      phone: customer.phone || "",
      email: customer.email || "",
      reason: "Manual review",
      notes: `Added from Customers tab. Reservations: ${customer.count}`,
    });
  }

  async function saveMenuItem(event) {
    event.preventDefault();
    setAdminNotice("");
    setAdminError("");

    const payload = {
      ...menuForm,
      price: Number(menuForm.price || 0),
      department: normalizeDepartment(menuForm.department),
    };

    const url = editingMenuId
      ? `${API_BASE_URL}/api/menu/${editingMenuId}`
      : `${API_BASE_URL}/api/menu`;

    const response = await adminFetch(url, {
      method: editingMenuId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to save menu item."));
      return;
    }

    setMenuForm(emptyMenuItem);
    setEditingMenuId(null);
    setMenuMode("list");
    setAdminNotice(editingMenuId ? "Menu item updated." : "Menu item created.");
    await loadMenuItems();
    await onMenuChanged?.();
  }

  async function deleteMenuItem(id) {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/menu/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to delete menu item."));
      return;
    }

    setAdminNotice("Menu item deleted.");
    await loadMenuItems();
    await onMenuChanged?.();
  }

  async function seedMenuItems() {
    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/menu/seed`, {
      method: "POST",
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to seed menu items."));
      return;
    }

    const result = await response.json();
    await loadMenuItems();
    await onMenuChanged?.();
    setMenuMode("list");
    setAdminNotice(`Menu ready. Added ${result.created ?? result.Created ?? 0}, total ${result.total ?? result.Total ?? "—"}.`);
  }

  async function handleMenuImageFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const imageUrl = await compressMenuImage(file);
      setMenuForm((prev) => ({ ...prev, imageUrl }));
      setAdminError("");
    } catch (error) {
      setAdminError(error?.message || "Failed to load image.");
    }
  }

  async function saveEventItem(event) {
    event.preventDefault();
    setAdminNotice("");
    setAdminError("");

    const payload = {
      ...eventForm,
      imageUrls: (eventForm.imageUrls || []).filter(Boolean).slice(0, 8),
      activeUntilUtc: eventForm.activeUntilLocal ? new Date(eventForm.activeUntilLocal).toISOString() : null,
    };
    delete payload.activeUntilLocal;

    const url = editingEventId
      ? `${API_BASE_URL}/api/events/${editingEventId}`
      : `${API_BASE_URL}/api/events`;

    const response = await adminFetch(url, {
      method: editingEventId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to save event."));
      return;
    }

    setEventForm(emptyEventItem);
    setEditingEventId(null);
    setEventMode("list");
    setAdminNotice(editingEventId ? "Event updated." : "Event created.");
    await loadEvents();
    await onEventsChanged?.();
  }

  async function deleteEventItem(id) {
    setAdminNotice("");
    setAdminError("");

    const confirmed = window.confirm(adminLanguage === "bg" ? "Да изтрием ли това събитие?" : "Delete this event?");
    if (!confirmed) return;

    const response = await adminFetch(`${API_BASE_URL}/api/events/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to delete event."));
      return;
    }

    setAdminNotice("Event deleted.");
    await loadEvents();
    await onEventsChanged?.();
  }

  function startEditingEventItem(item) {
    setEditingEventId(getValue(item, "id"));
    setEventForm({
      titleBg: getValue(item, "titleBg") || "",
      titleEn: getValue(item, "titleEn") || "",
      textBg: getValue(item, "textBg") || "",
      textEn: getValue(item, "textEn") || "",
      badge: getValue(item, "badge") || "",
      imageUrls: getValue(item, "imageUrls") || [],
      isActive: getValue(item, "isActive") ?? true,
      activeUntilLocal: toLocalDateTimeInputValue(getValue(item, "activeUntilUtc")),
    });
    setEventMode("form");
  }

  async function handleEventImageFileChange(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;

    try {
      const imageUrls = await Promise.all(files.slice(0, 8).map((file) => compressEventImage(file)));
      setEventForm((prev) => ({
        ...prev,
        imageUrls: [...(prev.imageUrls || []), ...imageUrls].slice(0, 8),
      }));
      setAdminError("");
    } catch (error) {
      setAdminError(error?.message || "Failed to load event photos.");
    }
  }

  function removeEventImage(index) {
    setEventForm((prev) => ({
      ...prev,
      imageUrls: (prev.imageUrls || []).filter((_, photoIndex) => photoIndex !== index),
    }));
  }

  async function editAdminReservationPayload(id, payload) {
    setAdminNotice("");
    setAdminError("");
    const response = await adminFetch(`${API_BASE_URL}/api/reservations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const message = await readErrorMessage(response, "Failed to update reservation.");
      setAdminError(message);
      return { ok: false, message };
    }
    await loadReservations();
    setAdminNotice(adminLocalText(adminLanguage, "Резервацията е запазена.", "Reservation saved.", "Резервация сохранена."));
    return true;
  }

  async function saveAdminReservationPayload(source) {
    const payload = {
      ...source,
      email: source.email || "",
      guestCount: Number(source.guestCount || 0),
      tableIds: Array.isArray(source.tableIds)
        ? source.tableIds
        : String(source.tableIds || "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
      createdByAdmin: true,
    };

    setAdminNotice("");
    setAdminError("");

    const unavailableTableIds = getUnavailableTableIdsForSlot(
      reservations,
      payload.reservedDate,
      payload.reservedTime
    );
    const unavailableSelectedTableIds = getUnavailableSelectedTableIds(payload.tableIds, unavailableTableIds);

    if (unavailableSelectedTableIds.length > 0) {
      const message = adminLanguage === "bg"
          ? `Маса ${unavailableSelectedTableIds.join(", ")} вече е заета около този час.`
          : `Table ${unavailableSelectedTableIds.join(", ")} is already reserved around this time.`;
      setAdminError(message);
      return { ok: false, message };
    }

    const response = await adminFetch(`${API_BASE_URL}/api/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await readErrorMessage(response, "Failed to create reservation.");
      setAdminError(localizeReservationSaveError(message, adminLanguage));
      return { ok: false, message };
    }

    setAdminNotice("Reservation created.");
    await loadReservations();
    return true;
  }

  async function createAdminReservation(event) {
    event.preventDefault();

    const created = await saveAdminReservationPayload(adminReservation);
    if (created !== true) return;

    setAdminReservation(emptyAdminReservation);
    setActiveTab("reservations");
    setShowCreateReservation(false);
  }

  async function setSeasonalZone(area, closed) {
    if (savingSeasonalArea) return;
    setSavingSeasonalArea(area);
    setAdminError("");
    try {
      const response = await adminFetch(`${API_BASE_URL}/api/seasonal-zones/${area}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ closed }),
      });
      if (!response.ok) throw new Error(await readErrorMessage(response, "Failed to save seasonal closure."));
      updateZones(await response.json());
      setAdminNotice(closed
        ? adminLocalText(adminLanguage, "Зоната е затворена за сезона и скрита от сайта и картата. Резервациите са запазени.", "Area closed for the season and hidden from the website and map. Reservations are preserved.", "Зона закрыта на сезон и скрыта с сайта и карты. Резервации сохранены.")
        : adminLocalText(adminLanguage, "Зоната е отворена отново.", "Area reopened.", "Зона снова открыта."));
    } catch (error) { setAdminError(error.message); }
    finally { setSavingSeasonalArea(""); }
  }

  async function createHallBlock(event) {
    event.preventDefault();

    const times = buildTimeRange(hallBlock.startTime, hallBlock.endTime);

    setAdminNotice("");
    setAdminError("");

    if (!hallBlock.reservedDate || times.length === 0) {
      setAdminError(adminLocalText(adminLanguage, "Изберете дата, начален и краен час.", "Choose a date, start time and end time.", "Выберите дату, время начала и окончания."));
      return;
    }

    const response = await adminFetch(`${API_BASE_URL}/api/reservations/block`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservedDate: hallBlock.reservedDate,
        area: hallBlock.area,
        times,
        tableIds: activeTableIdsByArea[hallBlock.area] || [],
        note: hallBlock.note,
      }),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to block tables."));
      return;
    }

    setHallBlock(emptyHallBlock);
    setAdminNotice(
      adminLanguage === "bg"
        ? `Блокирани са ${times.length} часови слота.`
        : `Blocked ${times.length} time slots.`
    );
    await loadReservations();
  }

  async function unblockHall(id) {
    setUnblockingHallId(id);
    setAdminError("");
    setAdminNotice("");
    try {
      const response = await adminFetch(`${API_BASE_URL}/api/reservations/blocks/${id}/unblock`, { method: "PATCH" });
      if (!response.ok) {
        setAdminError(await readErrorMessage(response, "Failed to unblock hall."));
        return;
      }
      await loadReservations();
      setAdminNotice(adminLocalText(adminLanguage, "Блокировката е премахната. Съществуващите резервации са запазени.", "Block removed. Existing reservations are preserved.", "Блокировка снята. Существующие брони сохранены."));
    } catch (error) {
      setAdminError(error?.message || "Failed to unblock hall.");
    } finally {
      setUnblockingHallId(null);
    }
  }

  async function saveRestaurantClosure(event) {
    event.preventDefault();
    setAdminNotice("");
    setAdminError("");

    if (!restaurantClosure.startDate || !restaurantClosure.endDate || !restaurantClosure.message.trim()) {
      setAdminError(adminLanguage === "bg" ? "Попълнете датите и текста на уведомлението." : "Complete the dates and notification text.");
      return;
    }

    const response = await adminFetch(`${API_BASE_URL}/api/restaurant-closure`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(restaurantClosure),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to save restaurant closure."));
      return;
    }

    setRestaurantClosure(await response.json());
    setAdminNotice(
      adminLanguage === "bg"
        ? "Периодът на затваряне и уведомлението са запазени."
        : "Restaurant closure and notification saved."
    );
  }

  async function saveBlacklistEntry(event) {
    event.preventDefault();

    const saved = await saveBlacklistPayload(blacklistForm);
    if (!saved) return;

    setBlacklistForm({
      guestName: "",
      phone: "",
      email: "",
      reason: "No-show",
      notes: "",
    });
    setBlacklistMode("list");
  }

  async function saveManualCustomer(event) {
    event.preventDefault();
    setAdminNotice("");
    setAdminError("");

    const payload = {
      ...manualCustomerForm,
      birthDate: manualCustomerForm.birthDate || null,
      marketingConsent: Boolean(manualCustomerForm.marketingConsent),
    };

    const response = await adminFetch(`${API_BASE_URL}/api/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, adminLocalText(adminLanguage, "Неуспешно записване на клиент.", "Failed to save customer.", "Не удалось сохранить клиента.")));
      return;
    }

    setManualCustomerForm(emptyManualCustomer);
    setShowManualCustomerForm(false);
    await loadCustomerProfiles();
    setAdminNotice(adminLocalText(adminLanguage, "Клиентът е запазен.", "Customer saved.", "Клиент сохранён."));
  }

  async function deleteCustomerProfile(customer) {
    const profileId = customer.profileId;
    if (!profileId) return;

    const confirmed = window.confirm(
      adminLocalText(
        adminLanguage,
        `Да изтрием ли клиента "${customer.guestName}" от статистиката?`,
        `Delete "${customer.guestName}" from customer statistics?`,
        `Удалить клиента "${customer.guestName}" из статистики?`
      )
    );

    if (!confirmed) return;

    setAdminNotice("");
    setAdminError("");

    const response = await adminFetch(`${API_BASE_URL}/api/customers/${profileId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(
        response,
        adminLocalText(adminLanguage, "Неуспешно изтриване на клиент.", "Failed to delete customer.", "Не удалось удалить клиента.")
      ));
      return;
    }

    setExpandedCustomerKey(null);
    await loadCustomerProfiles();
    setAdminNotice(adminLocalText(adminLanguage, "Клиентът е изтрит от статистиката.", "Customer removed from statistics.", "Клиент удалён из статистики."));
  }

  async function deleteBlacklistEntry(id) {
    await adminFetch(`${API_BASE_URL}/api/blacklist/${id}`, {
      method: "DELETE",
    });

    await loadBlacklist();
  }

  async function unlockProVersion() {
    setAdminError("");
    setAdminNotice("");

    const code = window.prompt(
      adminLanguage === "bg"
        ? "Въведете developer код за отключване на Pro версия:"
        : "Enter developer code to unlock Pro version:"
    );

    if (code === null) return;

    const response = await adminFetch(`${API_BASE_URL}/api/product-tier/unlock-pro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to unlock Pro version."));
      return;
    }

    const data = await response.json().catch(() => null);
    setProductTier(data?.isPro || data?.tier === "Pro" ? "Pro" : "Basic");
    setAdminNotice(adminLanguage === "bg" ? "Pro версията е отключена." : "Pro version unlocked.");
    await Promise.all([loadReservations({ silent: true }), loadDiningOrders({ force: true }), loadMenuItems(), loadTableLayout()]);
  }

  async function lockBasicVersion() {
    setAdminError("");
    setAdminNotice("");

    const confirmed = window.confirm(
      adminLanguage === "bg"
        ? "Да върнем ли системата в Basic версия? Поръчки, кухня и сервитьорски роли ще се скрият, но данните няма да бъдат изтрити."
        : "Switch the system back to Basic? Orders, kitchen, and waiter roles will be hidden, but data will not be deleted."
    );

    if (!confirmed) return;

    const code = window.prompt(
      adminLanguage === "bg"
        ? "Въведете developer код за връщане към Basic версия:"
        : "Enter developer code to return to Basic version:"
    );

    if (code === null) return;

    const response = await adminFetch(`${API_BASE_URL}/api/product-tier/lock-basic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to switch to Basic version."));
      return;
    }

    setProductTier("Basic");
    setDiningOrders([]);
    if (activeTab === "orders") {
      setActiveTab("home");
    }
    setAdminNotice(adminLanguage === "bg" ? "Системата е върната в Basic версия." : "System switched back to Basic version.");
    await Promise.all([loadReservations({ silent: true }), loadMenuItems(), loadTableLayout(), loadAdminUsers(), loadAuditLogs()]);
  }

  async function createAdminUser(event) {
    event.preventDefault();
    setAdminError("");
    setAdminNotice("");

    const response = await adminFetch(`${API_BASE_URL}/api/admin/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adminUserForm),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to create admin."));
      return;
    }

    setAdminUserForm({ name: "", email: "", password: "", role: "Administrator" });
    setAdminNotice(adminLanguage === "bg" ? "Админът е създаден." : "Admin created.");
    await Promise.all([loadAdminUsers(), loadAuditLogs()]);
  }

  function startEditingAdminUser(user) {
    setEditingAdminId(getAdminUserId(user));
    setAdminEditForm({
      name: user.name || user.Name || "",
      email: user.email || user.Email || "",
      password: "",
      role: normalizeAdminRole(user.role || user.Role),
      isActive: Boolean(user.isActive ?? user.IsActive ?? true),
    });
  }

  async function saveAdminUser(userId) {
    setAdminError("");
    setAdminNotice("");

    const response = await adminFetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adminEditForm),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to update admin."));
      return;
    }

    setEditingAdminId(null);
    setAdminEditForm({ name: "", email: "", password: "", role: "Administrator", isActive: true });
    setAdminNotice(adminLanguage === "bg" ? "Админът е обновен." : "Admin updated.");
    await Promise.all([loadAdminUsers(), loadAuditLogs()]);
  }

  async function deleteAdminUser(user) {
    setAdminError("");
    setAdminNotice("");

    const userId = getAdminUserId(user);
    const userName = user.name || user.Name || user.email || user.Email || "admin";
    const confirmed = window.confirm(
      adminLanguage === "bg"
        ? `Да се изтрие ли админ акаунтът ${userName}?`
        : `Delete admin account ${userName}?`
    );

    if (!confirmed) return;

    const response = await adminFetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to delete admin."));
      return;
    }

    setAdminNotice(adminLanguage === "bg" ? "Админът е изтрит." : "Admin deleted.");
    await Promise.all([loadAdminUsers(), loadAuditLogs()]);
  }

  async function changeOwnPassword(event) {
    event.preventDefault();
    setAdminError("");
    setAdminNotice("");

    if (!ownPasswordForm.currentPassword || !ownPasswordForm.newPassword) {
      setAdminError(adminLanguage === "bg" ? "Въведете текуща и нова парола." : "Enter current and new password.");
      return;
    }

    if (ownPasswordForm.newPassword.length < 8) {
      setAdminError(adminLanguage === "bg" ? "Новата парола трябва да е поне 8 символа." : "New password must be at least 8 characters.");
      return;
    }

    const response = await adminFetch(`${API_BASE_URL}/api/admin/me/password`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ownPasswordForm),
    });

    if (!response.ok) {
      setAdminError(await readErrorMessage(response, "Failed to change password."));
      return;
    }

    setOwnPasswordForm({ currentPassword: "", newPassword: "" });
    setAdminNotice(adminLanguage === "bg" ? "Паролата е сменена." : "Password changed.");
  }

  async function enableQuickLogin() {
    setAdminError("");
    setAdminNotice("");

    try {
      if (window.PublicKeyCredential && navigator.credentials?.create) {
        await navigator.credentials.create({
          publicKey: {
            challenge: crypto.getRandomValues(new Uint8Array(32)),
            rp: { name: branding.name },
            user: {
              id: crypto.getRandomValues(new Uint8Array(16)),
              name: adminUser?.email || "admin",
              displayName: adminUser?.name || "Admin",
            },
            pubKeyCredParams: [{ type: "public-key", alg: -7 }],
            authenticatorSelection: { userVerification: "required" },
            timeout: 60000,
          },
        });
      }

      const credentialToken = crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

      const response = await adminFetch(`${API_BASE_URL}/api/admin/devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: navigator.userAgent.slice(0, 80),
          credentialToken,
        }),
      });

      if (!response.ok) {
        setAdminError(await readErrorMessage(response, "Failed to enable quick login."));
        return;
      }

      window.localStorage.setItem(tenantStorageKey("admin-device-token"), credentialToken);
      setAdminNotice(adminLanguage === "bg" ? "Бързият вход е активиран на това устройство." : "Quick login is enabled on this device.");
      await loadAuditLogs();
    } catch {
      setAdminError(adminLanguage === "bg" ? "Биометричният вход беше отказан." : "Biometric login was cancelled.");
    }
  }

  async function enablePushNotifications() {
    setAdminError("");
    setAdminNotice("");

    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setAdminError(
        adminLanguage === "bg"
          ? "Това устройство или браузър не поддържа push известия. На iPhone/iPad добавете сайта на началния екран, а на Android/компютър разрешете известията в браузъра."
          : "This device or browser does not support push notifications. On iPhone/iPad add the site to the Home Screen; on Android/desktop allow browser notifications."
      );
      return;
    }

    try {
      const configResponse = await adminFetch(`${API_BASE_URL}/api/admin/push/config`);
      if (!configResponse.ok) {
        setAdminError(await readErrorMessage(configResponse, "Failed to load push configuration."));
        return;
      }

      const config = await configResponse.json();
      const allowed = config.enabled === true || (isCasaTenant && config.enabled == null && Boolean(config.publicKey));
      setNotificationsAllowed(allowed);
      if (!allowed) {
        setPushEnabled(false);
        setAdminNotice(adminLocalText(adminLanguage, "Известията са изключени за този ресторант.", "Notifications are disabled for this restaurant.", "Уведомления отключены для этого ресторана."));
        return;
      }
      const { publicKey } = config;
      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      if (permission !== "granted") {
        setAdminError(adminLanguage === "bg" ? `Разрешете известията за ${branding.name}.` : `Allow notifications for ${branding.name}.`);
        return;
      }
      const registration = await getReadyAdminPushRegistration();
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription = existingSubscription || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const saveResponse = await adminFetch(`${API_BASE_URL}/api/admin/push/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!saveResponse.ok) {
        setAdminError(await readErrorMessage(saveResponse, "Failed to save push subscription."));
        return;
      }

      setPushEnabled(true);
      setAdminNotice(
        adminLanguage === "bg"
          ? "Push известията са включени за това устройство."
          : "Push notifications are enabled for this device."
      );
      showTenantNotification(
        branding.name,
        adminLanguage === "bg" ? "Известията са активни на това устройство." : "Notifications are active on this device."
      );
    } catch (error) {
      console.error("Failed to enable push notifications", error);
      setAdminError(
        adminLanguage === "bg"
          ? "Не успях да включа push известията. Презаредете админката, проверете HTTPS и дали уведомленията са разрешени за сайта."
          : "Could not enable push notifications. Reload the admin app, then check HTTPS and site notification permission."
      );
    }
  }

  function isInStatsPeriod(dateValue) {
    if (!dateValue) return false;

    const normalizedDate = String(dateValue).slice(0, 10);
    const today = formatLocalDate(new Date());
    if (statsPeriod === "today") {
      return normalizedDate === today;
    }

    const reservationDate = new Date(dateValue);
    const now = new Date();

    const start = new Date(now);

    if (statsPeriod === "week") {
      start.setDate(now.getDate() - 7);
    }

    if (statsPeriod === "month") {
      start.setMonth(now.getMonth() - 1);
    }

    if (statsPeriod === "year") {
      start.setFullYear(now.getFullYear() - 1);
    }

    return reservationDate >= start;
  }

  function isActiveCustomerReservation(reservation) {
    return reservation.status !== "Cancelled" && !reservation.isNoShow;
  }

  function isReportableVisit(reservation) {
    if (!isActiveCustomerReservation(reservation)) return false;
    if (reservation.createdByAdmin && (reservation.phone === "admin" || reservation.guestName === "Admin block")) return false;
    return true;
  }

  function isUpcomingOperationalReservation(reservation) {
    if (!["Pending", "Approved"].includes(reservation.status)) return false;
    if (reservation.isWalkIn) return false;
    if (reservation.isNoShow || reservation.isArrived) return false;

    const minutes = getReservationMinutesFromNow(reservation);
    return minutes !== null && minutes >= 0;
  }

  function isUpcomingDashboardReservation(reservation) {
    if (!["Pending", "Approved"].includes(reservation.status)) return false;
    if (reservation.isNoShow || reservation.isArrived) return false;

    const minutes = getReservationMinutesFromNow(reservation);
    return minutes !== null && minutes >= 0;
  }

  function isPastDashboardReservation(reservation) {
    const minutes = getReservationMinutesFromNow(reservation);
    return reservation.isNoShow ||
      reservation.isArrived ||
      ["Cancelled", "Released"].includes(reservation.status) ||
      (minutes !== null && minutes < 0);
  }

  function getOrderReportDate(order) {
    const relatedReservation = reservations.find(
      (reservation) => Number(reservation.id) === Number(order.reservationId)
    );
    if (relatedReservation?.reservedDate) return relatedReservation.reservedDate;
    if (!order.createdAtUtc) return "";
    const createdAt = new Date(order.createdAtUtc);
    return Number.isNaN(createdAt.getTime()) ? "" : formatLocalDate(createdAt);
  }

  function isInReportsPeriod(dateValue) {
    if (reportsPeriod === "all") return true;
    return String(dateValue || "").slice(0, 7) === reportsPeriod;
  }

  const statsReservations = reservations.filter((r) =>
    isInStatsPeriod(r.reservedDate)
  );
  const statsUpcomingReservations = statsReservations.filter(isUpcomingDashboardReservation);
  const statsPastReservations = statsReservations.filter(isPastDashboardReservation);

  const reportMonthLabels = {
    bg: ["януари", "февруари", "март", "април", "май", "юни", "юли", "август", "септември", "октомври", "ноември", "декември"],
    en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    ru: ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"],
  };
  const currentReportDate = new Date();
  const currentReportYear = currentReportDate.getFullYear();
  const reportMonthKeys = new Set();
  for (let month = 0; month <= currentReportDate.getMonth(); month += 1) {
    reportMonthKeys.add(`${currentReportYear}-${String(month + 1).padStart(2, "0")}`);
  }
  reservations.forEach((reservation) => {
    if (/^\d{4}-\d{2}/.test(String(reservation.reservedDate || ""))) {
      reportMonthKeys.add(String(reservation.reservedDate).slice(0, 7));
    }
  });
  diningOrders.forEach((order) => {
    const date = getOrderReportDate(order);
    if (/^\d{4}-\d{2}/.test(date)) reportMonthKeys.add(date.slice(0, 7));
  });
  const reportMonthOptions = [...reportMonthKeys]
    .sort((first, second) => second.localeCompare(first))
    .map((key) => {
      const [year, month] = key.split("-").map(Number);
      const labels = reportMonthLabels[adminLanguage] || reportMonthLabels.en;
      return { key, label: `${labels[month - 1]} ${year}` };
    });

  const reportsReservations = reservations
    .filter((reservation) => isInReportsPeriod(reservation.reservedDate))
    .filter(isReportableVisit);
  const reportsOrders = diningOrders.filter(
    (order) => order.status !== "Cancelled" && isInReportsPeriod(getOrderReportDate(order))
  );
  const walkInReservations = reportsReservations.filter((reservation) => reservation.isWalkIn);
  const reservationReportReservations = reportsReservations.filter((reservation) => !reservation.isWalkIn);
  const siteReservations = reservationReportReservations.filter((reservation) => !reservation.createdByAdmin);
  const adminReservations = reservationReportReservations.filter((reservation) => reservation.createdByAdmin);
  const sumReservationGuests = (items) =>
    items.reduce((total, reservation) => total + Number(reservation.guestCount || 0), 0);
  const siteReservationGuests = sumReservationGuests(siteReservations);
  const adminReservationGuests = sumReservationGuests(adminReservations);
  const walkInGuests = sumReservationGuests(walkInReservations);
  const totalVisitors = siteReservationGuests + adminReservationGuests + walkInGuests;
  const waiterReportRows = Object.values(
    reportsOrders.reduce((acc, order) => {
      const key = order.assignedWaiterId || "unassigned";
      if (!acc[key]) {
        acc[key] = {
          key,
          waiterName: order.assignedWaiterName || (adminLanguage === "bg" ? "Непоети" : "Unassigned"),
          orders: 0,
          revenue: 0,
          tables: new Set(),
        };
      }

      acc[key].orders += 1;
      acc[key].revenue += Number(order.totalPrice || 0);
      String(order.tableLabel || "")
        .split(",")
        .map((table) => table.trim())
        .filter(Boolean)
        .forEach((table) => acc[key].tables.add(table));

      return acc;
    }, {})
  ).map((row) => ({ ...row, tableCount: row.tables.size })).sort((aRow, bRow) => bRow.revenue - aRow.revenue);
  const soldItemRows = Object.values(
    reportsOrders.flatMap((order) => order.items || []).reduce((acc, item) => {
      const key = item.name;
      if (!acc[key]) {
        acc[key] = {
          name: item.name,
          quantity: 0,
          revenue: 0,
        };
      }

      acc[key].quantity += Number(item.quantity || 0);
      acc[key].revenue += Number(item.quantity || 0) * Number(item.unitPrice || 0);
      return acc;
    }, {})
  ).sort((aRow, bRow) => bRow.quantity - aRow.quantity);
  const reportMetrics = [
    {
      label: adminLanguage === "bg" ? "Резервации от сайта" : "Website reservations",
      value: siteReservations.length,
      detail: adminLanguage === "bg" ? "направени от гости" : "made by guests",
    },
    {
      label: adminLanguage === "bg" ? "Резервации от админ" : "Admin reservations",
      value: adminReservations.length,
      detail: adminLanguage === "bg" ? "ръчно въведени" : "entered manually",
    },
    {
      label: adminLanguage === "bg" ? "Без резервация" : "Walk-ins",
      value: walkInReservations.length,
      detail: adminLanguage === "bg" ? "настанявания без резервация" : "seated without reservation",
    },
    {
      label: adminLanguage === "bg" ? "Гости от сайта" : "Website guests",
      value: siteReservationGuests,
      detail: adminLanguage === "bg" ? "хора с онлайн резервации" : "people with online reservations",
    },
    {
      label: adminLanguage === "bg" ? "Гости от админ" : "Admin guests",
      value: adminReservationGuests,
      detail: adminLanguage === "bg" ? "хора с ръчни резервации" : "people with manual reservations",
    },
    {
      label: adminLanguage === "bg" ? "Гости без резервация" : "Walk-in guests",
      value: walkInGuests,
      detail: adminLanguage === "bg" ? "хора настанени директно" : "people seated directly",
    },
    ...(isProVersion
      ? [
          {
            label: adminLanguage === "bg" ? "Онлайн поръчки" : "Online orders",
            value: reportsOrders.length,
            detail: formatEuroAmount(reportsOrders.reduce((total, order) => total + order.totalPrice, 0)),
          },
        ]
      : []),
    {
      label: adminLanguage === "bg" ? "Посетители общо" : "Total visitors",
      value: totalVisitors,
      detail: adminLanguage === "bg" ? "сайт, админ и без резервация" : "site, admin, and walk-ins",
    },
  ];

  const filteredReservations = reservations
    .filter((r) => {
      if (!isUpcomingOperationalReservation(r)) return false;

      const matchesStatus = statusFilter === "All" || r.status === statusFilter;
      const haystack = `${r.guestName} ${r.phone} ${r.email} ${r.tableIds.join(" ")} ${r.reservedDate}`.toLowerCase();

      return matchesStatus && haystack.includes(search.toLowerCase());
    })
    .sort((first, second) => {
      const firstMinutes = getReservationMinutesFromNow(first) ?? 999999;
      const secondMinutes = getReservationMinutesFromNow(second) ?? 999999;
      return firstMinutes - secondMinutes;
    });

  const pendingCount = statsReservations.filter((r) => r.status === "Pending").length;
  const blacklistKeys = new Set(
    blacklist.flatMap((entry) => [
      String(entry.phone || entry.Phone || "").trim().toLowerCase(),
      String(entry.email || entry.Email || "").trim().toLowerCase(),
    ]).filter(Boolean)
  );

  const customerProfileAccumulator = customerProfiles.reduce((acc, profile) => {
    const phone = profile.phone ?? profile.Phone ?? "";
    const email = profile.email ?? profile.Email ?? "";
    const key = getCustomerProfileKey(profile);
    if (!key || key === "—") return acc;

    const firstReservationAt = profile.firstReservationAtUtc ?? profile.FirstReservationAtUtc ?? "";
    const lastReservationAt = profile.lastReservationAtUtc ?? profile.LastReservationAtUtc ?? firstReservationAt;
    const reservationCount = Number(profile.reservationCount ?? profile.ReservationCount ?? 0);
    const profileReservations = (profile.reservations ?? profile.Reservations ?? [])
      .map(normalizeCustomerHistoryReservation)
      .filter((reservation) => reservation.id)
      .sort((first, second) => {
        const firstValue = `${first.reservedDate} ${first.reservedTime}`;
        const secondValue = `${second.reservedDate} ${second.reservedTime}`;
        return secondValue.localeCompare(firstValue);
      });

    acc[key] = {
      key,
      profileId: profile.id ?? profile.Id,
      birthDate: getCustomerBirthDate(profile),
      birthdayEmailLastSentAtUtc: profile.birthdayEmailLastSentAtUtc ?? profile.BirthdayEmailLastSentAtUtc ?? null,
      guestName: profile.guestName ?? profile.GuestName ?? "—",
      phone,
      email,
      count: Math.max(reservationCount, profileReservations.length),
      firstReservation: String(firstReservationAt || formatLocalDate(new Date())).slice(0, 10),
      lastReservation: String(lastReservationAt || firstReservationAt || formatLocalDate(new Date())).slice(0, 10),
      reservations: profileReservations,
      reservationIds: new Set(profileReservations.map((reservation) => Number(reservation.id))),
      isRegularCustomer: Boolean(profile.isRegularCustomer ?? profile.IsRegularCustomer),
      marketingConsent: Boolean(profile.marketingConsent ?? profile.MarketingConsent),
      isManualProfile: reservationCount === 0 && profileReservations.length === 0,
      isBlacklisted:
        blacklistKeys.has(String(phone || "").trim().toLowerCase()) ||
        blacklistKeys.has(String(email || "").trim().toLowerCase()),
    };

    return acc;
  }, {});

  const customers = Object.values(
    reservations.reduce((acc, r) => {
      if (r.createdByAdmin && (r.phone === "admin" || r.guestName === "Admin block")) {
        return acc;
      }

      if (!isActiveCustomerReservation(r)) {
        return acc;
      }

      const key = getReservationCustomerKey(r);
      if (!key || key === "—") return acc;

      if (!acc[key]) {
        return acc;
      }

      const reservationId = Number(r.id);
      const hasReservation = Number.isFinite(reservationId) && acc[key].reservationIds?.has(reservationId);
      acc[key].isManualProfile = false;
      if (!hasReservation) {
        acc[key].reservations.push(r);
        if (Number.isFinite(reservationId)) acc[key].reservationIds?.add(reservationId);
      }
      acc[key].count = Math.max(acc[key].count, acc[key].reservations.length);
      acc[key].guestName = acc[key].guestName === "—" ? r.guestName : acc[key].guestName;
      acc[key].phone = acc[key].phone || r.phone;
      acc[key].email = acc[key].email || r.email;
      if (r.reservedDate < acc[key].firstReservation) {
        acc[key].firstReservation = r.reservedDate;
      }
      if (r.reservedDate > acc[key].lastReservation) {
        acc[key].lastReservation = r.reservedDate;
      }
      acc[key].isRegularCustomer = acc[key].isRegularCustomer || r.isRegularCustomer || acc[key].count >= 5;
      acc[key].marketingConsent = acc[key].marketingConsent || r.marketingConsent;
      acc[key].isBlacklisted =
        acc[key].isBlacklisted ||
        blacklistKeys.has(String(r.phone || "").trim().toLowerCase()) ||
        blacklistKeys.has(String(r.email || "").trim().toLowerCase());

      return acc;
    }, customerProfileAccumulator)
  ).sort((a, b) => b.count - a.count);

  const ordersByReservationId = React.useMemo(() => {
    const grouped = new Map();

    diningOrders.forEach((order) => {
      if (!order.reservationId || order.status === "Cancelled") return;
      const key = Number(order.reservationId);
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(order);
    });

    return grouped;
  }, [diningOrders]);

  function isInCustomerPeriod(dateValue) {
    if (customerPeriod === "all") return true;
    if (!dateValue) return false;

    const date = new Date(dateValue);
    const now = new Date();
    const start = new Date(now);

    if (customerPeriod === "today") {
      start.setHours(0, 0, 0, 0);
    }

    if (customerPeriod === "week") {
      start.setDate(now.getDate() - 7);
    }

    if (customerPeriod === "month") {
      start.setMonth(now.getMonth() - 1);
    }

    return date >= start;
  }

  const customersForPeriod = customers
    .map((customer) => {
      const periodReservations = customer.reservations.filter((reservation) =>
        isInCustomerPeriod(reservation.reservedDate)
      );

      return {
        ...customer,
        periodCount: customer.isManualProfile
          ? customerPeriod === "all" || isInCustomerPeriod(customer.firstReservation)
            ? 1
            : 0
          : customerPeriod === "all"
            ? customer.count
            : periodReservations.length,
        periodReservations: customerPeriod === "all" ? customer.reservations : periodReservations,
      };
    })
    .filter((customer) => customer.periodCount > 0);

  const birthdayCustomers = customers.filter((customer) => getCustomerBirthDate(customer));
  const directoryCustomers = customersMode === "birthdays"
    ? birthdayCustomers.map((customer) => ({ ...customer, periodCount: customer.count, periodReservations: customer.reservations }))
    : customersMode === "website"
      ? customersForPeriod.filter((customer) => Boolean(String(customer.email || "").trim()) && !customer.isManualProfile)
      : customersForPeriod;
  const visibleCustomersForPeriod = searchCustomers(directoryCustomers, customerQuery);
  const customerToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const sortedCustomers = sortCustomers(visibleCustomersForPeriod, customerSort, adminLanguage, customerToday);
  const searchedBlacklist = searchCustomers(blacklist, customerQuery);

  const visibleNewCustomersCount = visibleCustomersForPeriod.filter((customer) =>
    isInCustomerPeriod(customer.firstReservation)
  ).length;
  const totalCustomerVisits = visibleCustomersForPeriod.reduce((total, customer) => total + customer.periodCount, 0);

  const a = adminText[adminLanguage] || adminText.bg;

  const menuCategories = React.useMemo(() => {
    const grouped = new Map();

    menuItems
      .filter((item) => normalizeDepartment(getValue(item, "department")) === selectedMenuDepartment)
      .forEach((item) => {
      const category = normalizeCategory(item.category || item.Category);

      if (!grouped.has(category)) {
        grouped.set(category, {
          id: category,
          label: getCategoryLabel(category, adminLanguage),
          count: 0,
          activeCount: 0,
          items: [],
        });
      }

      const group = grouped.get(category);
      group.count += 1;
      if ((item.isActive ?? item.IsActive ?? true) === true) {
        group.activeCount += 1;
      }
      group.items.push(item);
    });

    return Array.from(grouped.values()).sort((first, second) =>
      first.label.localeCompare(second.label, adminLanguage === "ru" ? "ru" : adminLanguage === "bg" ? "bg" : "en")
    );
  }, [adminLanguage, menuItems, selectedMenuDepartment]);

  const menuDepartmentCounts = React.useMemo(() => {
    return menuDepartmentOptions.map((department) => {
      const items = menuItems.filter((item) => normalizeDepartment(getValue(item, "department")) === department.value);
      return {
        ...department,
        count: items.length,
        activeCount: items.filter((item) => (getValue(item, "isActive") ?? true) === true).length,
      };
    });
  }, [menuItems]);

  React.useEffect(() => {
    if (menuMode !== "list") return;

    if (menuCategories.length === 0) {
      if (selectedMenuCategory) setSelectedMenuCategory("");
      return;
    }

    if (!selectedMenuCategory || !menuCategories.some((category) => category.id === selectedMenuCategory)) {
      setSelectedMenuCategory(menuCategories[0].id);
    }
  }, [menuCategories, menuMode, selectedMenuCategory]);

  const selectedCategoryData =
    menuCategories.find((category) => category.id === selectedMenuCategory) || menuCategories[0];
  const selectedCategoryItems = selectedCategoryData?.items || [];
  const todayInput = React.useMemo(() => formatLocalDate(new Date()), []);
  const availableAdminReservationTimes = React.useMemo(
    () => getAvailableReservationTimesForDate(adminReservationTimes, adminReservation.reservedDate),
    [adminReservation.reservedDate]
  );
  const availableHallBlockTimes = adminReservationTimes;

  React.useEffect(() => {
    if (!adminReservation.reservedTime) return;
    if (!isPastTimeForDate(adminReservation.reservedDate, adminReservation.reservedTime)) return;

    setAdminReservation((prev) => ({
      ...prev,
      reservedTime: "",
      tableIds: "",
    }));
  }, [adminReservation.reservedDate, adminReservation.reservedTime]);

  const adminReservationTableIds = getAdminReservationTableIds();
  const adminReservationUnavailableTableIds = getUnavailableTableIdsForSlot(
    reservations,
    adminReservation.reservedDate,
    adminReservation.reservedTime
  );
  const casaReservationAreaOptions = [
    {
      value: "indoor",
      title: adminLanguage === "bg" ? "Зала / непушачи" : "Hall / non-smoking",
      subtitle: adminLanguage === "bg" ? "Тиха вътрешна зала" : "Quiet indoor hall",
      meta: `${(activeTableIdsByArea.indoor || []).length} ${adminLanguage === "bg" ? "маси" : "tables"}`,
    },
    {
      value: "garden",
      title: adminLanguage === "bg" ? "Покрита тераса" : "Covered terrace",
      subtitle: adminLanguage === "bg" ? "Зона за пушачи" : "Smoking area",
      meta: `${(activeTableIdsByArea.garden || []).length} ${adminLanguage === "bg" ? "маси" : "tables"}`,
    },
    {
      value: "openTerrace",
      title: adminLanguage === "bg" ? "Открита тераса" : "Open terrace",
      subtitle: adminLanguage === "bg" ? "Навън, компактна зона" : "Outdoor compact area",
      meta: `${(activeTableIdsByArea.openTerrace || []).length} ${adminLanguage === "bg" ? "маси" : "tables"}`,
    },
  ].filter((option) => !closedAreas.includes(option.value));
  const reservationAreaOptions = plan.zones.filter(zone => zone.isActive && !closedAreas.includes(zone.id)).map(zone =>
    zone.presentation?.startsWith("casa-")
      ? casaReservationAreaOptions.find(option => option.value === zone.id)
      : { value: zone.id, title: getZoneName(zone, adminLanguage), subtitle: "", meta: `${(activeTableIdsByArea[zone.id] || []).length} ${adminLanguage === "bg" ? "маси" : "tables"}` }
  ).filter(Boolean);
  const hallBlockAreaOptions = [
    {
      value: "all",
      title: adminLanguage === "bg" ? "Целият ресторант" : "Whole restaurant",
      subtitle: adminLanguage === "bg" ? "Всички зали и тераси" : "All halls and terraces",
      meta: `${activeTableIdsByArea.all.length} ${adminLanguage === "bg" ? "маси" : "tables"}`,
    },
    ...reservationAreaOptions,
  ];
  const categoryOptions = menuCategories.length
    ? menuCategories
    : (isCasaTenant ? Object.keys(categoryDisplayNames[adminLanguage]) : tenantCategoryOptions(tenantContext.tenantId, selectedMenuDepartment)).map((category) => ({
        id: category,
        label: getCategoryLabel(category, adminLanguage),
        count: 0,
        activeCount: 0,
        items: [],
      }));

  const tabs = React.useMemo(
    () => isProductionRole && isProVersion
      ? [
          ["orders", isBarRole ? (adminLanguage === "bg" ? "Бар" : "Bar") : (adminLanguage === "bg" ? "Кухня" : "Kitchen")],
        ]
      : isWaiterRole && isProVersion
      ? [
          ["liveMap", a.tabs.liveMap],
          ["orders", a.tabs.orders],
        ]
      : [
          ["liveMap", a.tabs.liveMap],
          ["reservations", a.tabs.reservations],
          ...(isProVersion ? [["orders", a.tabs.orders]] : []),
          ["reports", a.tabs.reports],
          ...(isProVersion ? [["inventory", a.tabs.inventory]] : []),
          ["block", a.tabs.block],
          ["menu", a.tabs.menu],
          ["events", a.tabs.events],
          ...(canViewFeedback ? [["feedback", a.tabs.feedback]] : []),
          ...(canManageMarketing ? [["marketing", a.tabs.marketing]] : []),
          ["layout", a.tabs.layout],
          ["customers", a.tabs.customers],
          ...(canUseMaintenance && !isDeveloperRole ? [["maintenance", a.tabs.maintenance]] : []),
          ...(canManageAdmins && !isDeveloperRole ? [["admins", adminLanguage === "bg" ? "Админи" : "Admins"]] : []),
          ...(isDeveloperRole ? [["dev", adminLocalText(adminLanguage, "DEV управление", "DEV management", "DEV управление")]] : []),
        ],
    [a.tabs, adminLanguage, canManageAdmins, canManageMarketing, canUseMaintenance, canViewFeedback, isBarRole, isDeveloperRole, isProductionRole, isProVersion, isWaiterRole]
  );
  const readyWaiterItemsCount = React.useMemo(
    () => isWaiterRole
      ? diningOrders.reduce((count, order) => count + (order.items || []).filter((item) => item.status === "Ready").length, 0)
      : 0,
    [diningOrders, isWaiterRole]
  );
  const newWaiterItemsCount = React.useMemo(
    () => isWaiterRole
      ? diningOrders.reduce((count, order) => count + (order.items || []).filter((item) => item.source === "GuestOnline" && !item.waiterSeenAtUtc).length, 0)
      : 0,
    [diningOrders, isWaiterRole]
  );
  const allowedTabKeys = React.useMemo(() => new Set(["home", "profile", ...tabs.map(([key]) => key)]), [tabs]);
  const dashboardNavigationGroups = React.useMemo(() => {
    const operationKeys = new Set(["liveMap", "reservations", "block", "orders"]);
    const operationTabs = tabs.filter(([key]) => operationKeys.has(key));
    const managementTabs = tabs.filter(([key]) => !operationKeys.has(key) && key !== "dev");
    const developerTabs = tabs.filter(([key]) => key === "dev");

    return [
      {
        key: "operations",
        title: adminLanguage === "bg" ? "Резервации и поръчки" : "Reservations and orders",
        subtitle:
          adminLanguage === "bg"
            ? "Бърз достъп до залата, календарите и текущите консумации."
            : "Fast access to the floor, calendars, and live consumption.",
        icon: "reservations",
        tabs: operationTabs,
      },
      {
        key: "management",
        title: adminLanguage === "bg" ? "Управление" : "Management",
        subtitle:
          adminLanguage === "bg"
            ? "Меню, клиенти, отчети, разпределение и админ настройки."
            : "Menu, guests, reports, layout, and admin settings.",
        icon: "layout",
        tabs: managementTabs,
      },
      {
        key: "developer",
        title: adminLocalText(adminLanguage, "DEV управление", "DEV management", "DEV управление"),
        subtitle: adminLocalText(adminLanguage, "Услуги, комисиони, достъп и техническа поддръжка.", "Services, commissions, access, and technical maintenance.", "Сервисы, комиссии, доступ и техническое обслуживание."),
        icon: "dev",
        tabs: developerTabs,
      },
    ].filter((group) => group.tabs.length > 0);
  }, [adminLanguage, tabs]);

  React.useEffect(() => {
    if (!allowedTabKeys.has(activeTab)) {
      setActiveTab(isProVersion && (isWaiterRole || isProductionRole) ? "orders" : "home");
    }
  }, [activeTab, allowedTabKeys, isProductionRole, isProVersion, isWaiterRole]);

  const refreshActiveTab = React.useCallback(async ({ silent = false } = {}) => {
    if (activeTab === "home") {
      await Promise.all([
        ...(isWaiterRole || isProductionRole ? [] : [loadReservations({ silent }), loadBlacklist()]),
        ...(isProVersion ? [loadDiningOrders()] : []),
        ...(isProductionRole ? [] : [loadTableLayout()]),
      ]);
      return;
    }

    if (activeTab === "orders" && isProVersion) {
      await Promise.all([loadDiningOrders(), loadMenuItems()]);
      return;
    }

    if (activeTab === "reports" && !isWaiterRole && !isProductionRole) {
      await Promise.all([
        loadReservations({ silent }),
        ...(isProVersion ? [loadDiningOrders()] : []),
      ]);
      return;
    }

    if (activeTab === "menu" && !isWaiterRole) {
      await loadMenuItems();
      return;
    }

    if (activeTab === "events" && !isWaiterRole && !isProductionRole) {
      await loadEvents();
      return;
    }

    if (activeTab === "feedback" && canViewFeedback) {
      await loadFeedbackEntries();
      return;
    }

    if (activeTab === "blacklist" && !isWaiterRole) {
      await loadBlacklist();
      return;
    }

    if (activeTab === "layout") {
      await loadTableLayout();
      return;
    }

    if (canManageAdmins && (activeTab === "admins" || (activeTab === "dev" && isDeveloperRole && developerSection === "access"))) {
      await Promise.all([loadAdminUsers(), loadAuditLogs()]);
      return;
    }

    if (activeTab === "dev" && isDeveloperRole) {
      if (developerSection === "service") await loadProductTier();
      return;
    }

    if (activeTab === "liveMap") {
      await Promise.all([
        ...(isWaiterRole ? [loadMenuItems()] : [loadReservations({ silent }), ...(isProVersion ? [loadMenuItems()] : [])]),
        ...(isProVersion ? [loadDiningOrders()] : []),
        ...(!isWaiterRole ? [loadPublicTableHolds()] : []),
        loadTableLayout(),
      ]);
      return;
    }

    if (!isWaiterRole && !isProductionRole) {
      await loadReservations({ silent });
    }
  }, [
    activeTab,
    canManageAdmins,
    canViewFeedback,
    developerSection,
    isDeveloperRole,
    isProductionRole,
    isProVersion,
    isWaiterRole,
    loadAdminUsers,
    loadAuditLogs,
    loadBlacklist,
    loadDiningOrders,
    loadEvents,
    loadFeedbackEntries,
    loadMenuItems,
    loadProductTier,
    loadPublicTableHolds,
    loadReservations,
    loadTableLayout,
  ]);

  const refreshLiveData = React.useCallback(async () => {
    await Promise.all([
      ...(isProductionRole ? [] : [loadReservations({ silent: true })]),
      loadDiningOrders({ silent: true }),
    ]);
  }, [isProductionRole, loadDiningOrders, loadReservations]);

  const shouldPauseLiveDataRefresh = Boolean(
    showCreateReservation ||
    menuMode !== "list" ||
    eventMode !== "list" ||
    blacklistMode !== "list" ||
    Object.keys(tableEdits).length > 0 ||
    Object.keys(noteEdits).length > 0 ||
    Object.values(orderMenuSearches).some((value) => String(value || "").trim())
  );

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;
    const liveDataTabs = new Set(["home", "liveMap", "reservations", "orders"]);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (!liveDataTabs.has(activeTab) && !isCasaTenant) return;
      if (shouldPauseLiveDataRefresh) return;
      void refreshLiveData();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [activeTab, refreshLiveData, shouldPauseLiveDataRefresh]);

  React.useEffect(() => {
    if (isProductionRole) {
      const productionKind = isBarRole ? "Drink" : "Dish";
      const productionLabel = isBarRole
        ? adminLanguage === "bg" ? "бара" : "bar"
        : adminLanguage === "bg" ? "кухнята" : "kitchen";
      const orderIdsRef = isBarRole ? seenBarOrderIdsRef : seenKitchenOrderIdsRef;
      const itemIdsRef = isBarRole ? seenBarItemIdsRef : seenKitchenItemIdsRef;
      const activeOrderIds = diningOrders
        .filter((order) => !["Done", "Cancelled"].includes(order.status))
        .filter((order) => (order.items || []).some((item) => item.kind === productionKind))
        .map((order) => order.id);
      const newOrderIds = activeOrderIds.filter((id) => !orderIdsRef.current.has(id));
      const hadSeenOrders = orderIdsRef.current.size > 0;

      activeOrderIds.forEach((id) => orderIdsRef.current.add(id));
      if (hadSeenOrders && newOrderIds.length > 0) {
        const firstOrder = diningOrders.find((order) => order.id === newOrderIds[0]);
        const title = adminLanguage === "bg" ? `Нова поръчка за ${productionLabel}` : `New ${productionLabel} order`;
        const body = firstOrder
          ? `${adminLanguage === "bg" ? "Маса" : "Table"} ${firstOrder.tableLabel} · #${firstOrder.id}`
          : title;
        setAdminNotice(`${title}${firstOrder ? ` · ${body}` : "."}`);
        showTenantNotification(title, body);
      }

      const newKitchenItems = diningOrders.flatMap((order) =>
        (order.items || [])
          .filter((item) => item.status === "New" && item.kind === productionKind)
          .map((item) => ({ id: item.id, name: item.name, tableLabel: order.tableLabel }))
      );
      const unseenKitchenItems = newKitchenItems.filter((item) => !itemIdsRef.current.has(item.id));
      const hadSeenKitchenItems = itemIdsRef.current.size > 0;

      newKitchenItems.forEach((item) => itemIdsRef.current.add(item.id));
      if (hadSeenKitchenItems && unseenKitchenItems.length > 0) {
        const first = unseenKitchenItems[0];
        const title = adminLanguage === "bg" ? `Нова позиция за ${productionLabel}` : `New ${productionLabel} item`;
        const body = `${first.name} · ${adminLanguage === "bg" ? "маса" : "table"} ${first.tableLabel}`;
        setAdminNotice(`${title} · ${body}`);
        showTenantNotification(title, body);
      }
    }

    if (isWaiterRole) {
      const guestItems = diningOrders.flatMap((order) =>
        (order.items || [])
          .filter((item) => item.source === "GuestOnline" && !item.waiterSeenAtUtc)
          .map((item) => ({ id: item.id, name: item.name, kind: item.kind, tableLabel: order.tableLabel }))
      );
      const newGuestItems = guestItems.filter((item) => !seenWaiterGuestItemIdsRef.current.has(item.id));
      const hadSeenGuestItems = seenWaiterGuestItemIdsRef.current.size > 0;

      guestItems.forEach((item) => seenWaiterGuestItemIdsRef.current.add(item.id));
      if (hadSeenGuestItems && newGuestItems.length > 0) {
        const first = newGuestItems[0];
        const title = first.kind === "BillRequest"
          ? adminLanguage === "bg" ? "Клиент поиска сметка" : "Guest requested bill"
          : first.kind === "WaiterCall"
          ? adminLanguage === "bg" ? "Клиент повика сервитьор" : "Guest called waiter"
          : adminLanguage === "bg" ? "Нова онлайн добавка" : "New online addition";
        const body = first.kind === "Dish"
          ? `${first.name} · ${adminLanguage === "bg" ? "маса" : "table"} ${first.tableLabel}`
          : `${adminLanguage === "bg" ? "маса" : "table"} ${first.tableLabel}`;
        setAdminNotice(`${title} · ${body}`);
        showTenantNotification(title, body);
      }

      const readyItems = diningOrders.flatMap((order) =>
        (order.items || [])
          .filter((item) => item.status === "Ready")
          .map((item) => ({ id: item.id, name: item.name, tableLabel: order.tableLabel }))
      );
      const newReadyItems = readyItems.filter((item) => !seenReadyItemIdsRef.current.has(item.id));
      const hadSeenReadyItems = seenReadyItemIdsRef.current.size > 0;

      readyItems.forEach((item) => seenReadyItemIdsRef.current.add(item.id));
      if (hadSeenReadyItems && newReadyItems.length > 0) {
        const first = newReadyItems[0];
        setAdminNotice(
          adminLanguage === "bg"
            ? `Готово блюдо: ${first.name} · маса ${first.tableLabel}`
            : `Ready dish: ${first.name} · table ${first.tableLabel}`
        );
        showTenantNotification(
          adminLanguage === "bg" ? "Готово блюдо" : "Dish ready",
          `${first.name} · ${adminLanguage === "bg" ? "маса" : "table"} ${first.tableLabel}`
        );
      }
    }
  }, [adminLanguage, diningOrders, isBarRole, isProductionRole, isWaiterRole, showTenantNotification]);

  const isDashboard = activeTab === "home";
  const activeTabLabel =
    activeTab === "profile"
      ? (adminLanguage === "bg" ? "Моят профил" : "My profile")
      : tabs.find(([key]) => key === activeTab)?.[1] || a.appTitle;
  const todayDashboardReservations = reservations
    .filter((reservation) => reservation.reservedDate === formatLocalDate(new Date()))
    .sort((first, second) => first.reservedTime.localeCompare(second.reservedTime, undefined, { numeric: true }));
  const upcomingDashboardReservations = (statsPeriod === "today" ? todayDashboardReservations : reservations)
    .filter(isUpcomingDashboardReservation)
    .sort((first, second) => {
      const firstMinutes = getReservationMinutesFromNow(first) ?? 999999;
      const secondMinutes = getReservationMinutesFromNow(second) ?? 999999;
      return firstMinutes - secondMinutes;
    })
    .slice(0, 5);
  const pastDashboardReservations = todayDashboardReservations
    .filter(isPastDashboardReservation)
    .sort((first, second) => second.reservedTime.localeCompare(first.reservedTime, undefined, { numeric: true }))
    .slice(0, 5);
  const dashboardReservationSections = statsPeriod === "today"
    ? [
        {
          key: "all-today",
          title: adminLanguage === "bg" ? "Всички резервации днес" : "All reservations today",
          empty: adminLanguage === "bg" ? "Няма резервации за днес." : "No reservations for today.",
          items: todayDashboardReservations,
        },
        {
          key: "upcoming-today",
          title: adminLanguage === "bg" ? "Чакащи / предстоящи" : "Pending / upcoming",
          empty: adminLanguage === "bg" ? "Няма предстоящи резервации за днес." : "No upcoming reservations for today.",
          items: upcomingDashboardReservations,
        },
        {
          key: "past-today",
          title: adminLanguage === "bg" ? "Изминали" : "Past",
          empty: adminLanguage === "bg" ? "Няма изминали резервации за днес." : "No past reservations for today.",
          items: pastDashboardReservations,
        },
      ]
    : [
        {
          key: "upcoming",
          title: adminLanguage === "bg" ? "Следващите 5 резервации" : "Next 5 reservations",
          empty: adminLanguage === "bg"
            ? "Няма предстоящи резервации за показване."
            : "No upcoming reservations to show.",
          items: upcomingDashboardReservations,
        },
      ];
  const recentDashboardOrders = diningOrders
    .filter((order) => !["Done", "Cancelled"].includes(order.status))
    .slice(0, 5);

  function renderReservationTrash() {
    if (!canUseReservationTrash) return null;

    const title = adminLanguage === "bg" ? "Кошче с резервации" : "Reservation trash";
    const emptyText = adminLocalText(adminLanguage, "Няма отменени или изтрити резервации.", "No cancelled or deleted reservations.", "Нет отменённых или удалённых броней.");

    return (
      <div ref={reservationTrashRef} className="fixed bottom-4 right-4 z-[10020] flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3 sm:bottom-6 sm:right-6">
        {reservationTrashOpen && (
          <div className="w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-[22px] border border-[#f2d39a]/24 bg-[#15110e]/96 text-left shadow-[0_28px_90px_rgba(0,0,0,0.72)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div>
                <div className="section-kicker text-[10px]">{title}</div>
                <div className="mt-1 text-xs text-white/45">
                  {deletedReservations.length >= 300 ? "300+" : deletedReservations.length} {adminLanguage === "bg" ? "записа" : "records"}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                <button type="button" onClick={() => processAllReservationTrash(true)} disabled={reservationTrashBusy || deletedReservations.length === 0} className="rounded-xl border border-emerald-300/25 bg-emerald-400/15 px-3 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-50">
                  {adminLocalText(adminLanguage, "Възстанови всички", "Restore all", "Восстановить все")}
                </button>
                <button type="button" onClick={() => processAllReservationTrash(false)} disabled={reservationTrashBusy || deletedReservations.length === 0} className="rounded-xl border border-red-300/25 bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-100 disabled:opacity-50">
                  {adminLocalText(adminLanguage, "Изчисти всички", "Empty trash", "Очистить всё")}
                </button>
              </div>
            </div>

            <div className="max-h-[min(520px,calc(100svh-9rem))] overflow-y-auto p-3">
              {reservationTrashError && (
                <div className="mb-3 rounded-2xl border border-red-300/25 bg-red-500/15 px-3 py-2 text-sm text-red-100">
                  {reservationTrashError}
                </div>
              )}

              {deletedReservations.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/50">
                  {emptyText}
                </div>
              ) : (
                <div className="space-y-2">
                  {deletedReservations.map((reservation) => {
                    const id = reservation.id || reservation.Id;
                    const tableIds = reservation.tableIds || reservation.TableIds || [];
                    const deletedAt = reservation.deletedAtUtc || reservation.DeletedAtUtc;
                    return (
                      <div key={id} className="rounded-2xl border border-white/10 bg-black/24 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-[#fff4df]">
                              {reservation.guestName || reservation.GuestName || "-"}
                            </div>
                            <div className="mt-1 text-xs leading-5 text-white/50">
                              {(reservation.reservedDate || reservation.ReservedDate || "").slice(0, 10)} · {reservation.reservedTime || reservation.ReservedTime || "-"} · {reservation.guestCount ?? reservation.GuestCount ?? 0} {adminLanguage === "bg" ? "гости" : "guests"}
                            </div>
                            <div className="text-xs leading-5 text-white/40">
                              {adminLanguage === "bg" ? "Маси" : "Tables"}: {tableIds.join(", ") || "-"}
                            </div>
                            {deletedAt && (
                              <div className="mt-1 text-[11px] text-white/30">
                                {new Date(deletedAt).toLocaleString()}
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => restoreReservationFromTrash(id)}
                              disabled={reservationTrashBusy}
                              className="shrink-0 rounded-xl border border-emerald-300/25 bg-emerald-400/15 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:border-emerald-200/40 disabled:opacity-50"
                            >
                              {adminLocalText(adminLanguage, "Възстанови", "Restore", "Восстановить")}
                            </button>
                            <button type="button" onClick={() => permanentlyDeleteReservationFromTrash(id)} disabled={reservationTrashBusy} className="rounded-xl border border-red-300/25 bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-100 disabled:opacity-50">
                              {adminLocalText(adminLanguage, "Изтрий завинаги", "Delete forever", "Удалить навсегда")}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setReservationTrashOpen((isOpen) => !isOpen);
            if (!reservationTrashOpen) loadDeletedReservations({ silent: true });
          }}
          className="relative flex h-14 w-14 items-center justify-center rounded-full border border-[#f2d39a]/35 bg-[#15110e]/95 text-[#f2d39a] shadow-[0_18px_48px_rgba(0,0,0,0.58)] backdrop-blur transition hover:border-[#f2d39a]/65 hover:bg-[#211811] focus:outline-none focus:ring-2 focus:ring-[#f2d39a]/45"
          aria-label={title}
          title={title}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" />
            <path d="M6.5 6l.8 14A2 2 0 0 0 9.3 22h5.4a2 2 0 0 0 2-1.9l.8-14" />
            <path d="M10 10v7" />
            <path d="M14 10v7" />
          </svg>
          {deletedReservations.length > 0 && (
            <span className="absolute -right-1 -top-1 min-w-5 rounded-full border border-[#15110e] bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white">
              {deletedReservations.length > 99 ? "99+" : deletedReservations.length}
            </span>
          )}
        </button>
      </div>
    );
  }

  const openAdminTab = (key) => {
    if (key !== "liveMap") {
      setActiveTab(key);
      return;
    }

    flushSync(() => setActiveTab("liveMap"));
    if (!shouldUseNativeMapFullscreen(window.navigator)) return;
    const mapShell = document.querySelector('[data-admin-reservation-map-shell="true"]');
    if (!mapShell?.requestFullscreen || document.fullscreenElement) return;
    void mapShell.requestFullscreen({ navigationUI: "hide" }).catch(() => {
      // iPadOS and restricted browser modes keep the fixed-position fullscreen fallback.
    });
  };

  const showTodayGuestSummary = !isProductionRole;

  return (
    <div className="admin-page luxury-shell min-h-screen text-white">
      <div className="mx-auto max-w-[1500px] px-5 py-8 md:px-8">
        <div className={`admin-hero-panel luxury-panel relative mb-8 rounded-[28px] flex flex-col ${
          isDashboard
            ? "min-h-[236px] p-6 pr-24 pb-24 md:min-h-[232px] md:p-8 md:pr-32 md:pb-8"
            : "min-h-[156px] p-4 pr-20 pb-24 md:p-5 md:pr-32 md:min-h-[148px] md:pb-5"
        }`}>
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={`admin-profile-anchor absolute right-5 top-5 flex h-16 w-12 items-center justify-center rounded-[22px] border p-1 transition md:right-7 md:top-7 ${
              activeTab === "profile"
                ? "border-[#f2d39a]/60 bg-[#c9a56a]/18 text-[#f2d39a]"
                : "border-white/10 bg-black/20 text-white/75 hover:border-[#c9a56a]/35 hover:text-[#f2d39a]"
            }`}
            title={adminLanguage === "bg" ? "Моят профил" : "My profile"}
            aria-label={adminLanguage === "bg" ? "Моят профил" : "My profile"}
          >
            <RoleProfileIcon role={adminUser?.role} className="h-full w-full rounded-[18px]" />
          </button>

          <div className={isDashboard ? "max-w-[760px]" : "pr-2"}>
            <TenantBrandLogo
              branding={branding}
              className={`object-left ${isDashboard ? "mb-5 h-16 w-[220px]" : "h-12 w-[168px]"}`}
            />
            {isDashboard && (
              <>
                <p className="section-kicker">
                  {branding.name} Admin OS
                </p>
                <h1 className="admin-hero-title mt-3 text-4xl font-semibold text-[#fff4df] md:text-5xl">
                  {a.appTitle}
                </h1>
              </>
            )}
          </div>

          <div
            className={`admin-header-controls absolute bottom-5 right-5 flex w-auto items-center justify-end gap-3 ${
              isDashboard
                ? "md:bottom-7 md:right-7"
                : "md:bottom-auto md:right-32 md:top-1/2 md:-translate-y-1/2"
            }`}
          >
            <div className="flex rounded-full border border-white/10 bg-black/20 p-1">
              {["bg", "en", "ru"].map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setAdminLanguage(lang)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    adminLanguage === lang ? "luxury-button" : "text-white/70 hover:text-white"
                  }`}
                  aria-label={`${a.language}: ${lang.toUpperCase()}`}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => refreshActiveTab()}
                className="ghost-button flex h-12 w-12 items-center justify-center rounded-full text-white/80"
                title={a.refresh}
                aria-label={a.refresh}
              >
                <RefreshIcon />
              </button>
              {onToggleTheme ? (
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="ghost-button flex h-12 w-12 items-center justify-center rounded-full text-white/80"
                  title={theme === "light" ? "Dark" : "Light"}
                  aria-label={theme === "light" ? "Dark" : "Light"}
                >
                  <ThemeIcon theme={theme} />
                </button>
              ) : null}
            </div>
          </div>
        </div>
        {isDashboard ? (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              {[
                ["today", a.stats.today],
                ["week", a.stats.week],
                ["month", a.stats.month],
                ["year", a.stats.year],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setStatsPeriod(key)}
                  className={`rounded-full px-4 py-2 text-sm transition ${
                    statsPeriod === key ? "luxury-button" : "ghost-button"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className={`mb-8 grid gap-4 ${isOperationalRole ? "md:grid-cols-2" : isProVersion ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
              {!isOperationalRole && <StatCard label={a.stats.allReservations} value={statsReservations.length} />}
              {!isOperationalRole && (
                <StatCard
                  label={statsPeriod === "today" ? (adminLanguage === "bg" ? "Чакащи" : "Upcoming") : a.stats.pending}
                  value={statsPeriod === "today" ? statsUpcomingReservations.length : pendingCount}
                />
              )}
              {!isOperationalRole && (
                <StatCard
                  label={adminLanguage === "bg" ? "Изминали" : "Past"}
                  value={statsPastReservations.length}
                />
              )}
              {isProVersion && <StatCard label={a.stats.orders} value={diningOrders.length} />}
            </div>

            <div className="mb-8 grid gap-4 xl:grid-cols-2">
              {dashboardNavigationGroups.map((group) => (
                <section
                  key={group.key}
                  className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black/20 p-4 shadow-2xl shadow-black/15"
                >
                  <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full border border-[#c9a56a]/10 bg-[#c9a56a]/5" />
                  <div className="relative mb-4 flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#f2d39a]/18 bg-[#c9a56a]/10 text-[#f2d39a]">
                      <AdminNavIcon type={group.icon} />
                    </div>
                    <div>
                      <div className="section-kicker">{group.title}</div>
                      <p className="mt-2 text-sm leading-5 text-white/45">
                        {group.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="relative grid gap-2 sm:grid-cols-2">
                    {group.tabs.map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
	                        onClick={() => openAdminTab(key)}
	                        className={`group flex min-h-[82px] items-center gap-3 rounded-[20px] border border-white/10 bg-white/[0.035] p-3 text-left transition hover:border-[#c9a56a]/45 hover:bg-[#c9a56a]/10 ${
	                          key === "liveMap" && newWaiterItemsCount > 0
	                            ? "waiter-new-alert"
	                            : key === "orders" && readyWaiterItemsCount > 0
	                            ? "waiter-ready-alert"
	                            : ""
	                        }`}
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-[#f2d39a] transition group-hover:border-[#f2d39a]/30 group-hover:bg-[#c9a56a]/12">
                          <AdminNavIcon type={key} className="h-6 w-6" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-[#fff4df]">
                            {label}
                          </span>
                          <span className="mt-1 block text-xs uppercase tracking-[0.16em] text-white/35">
                            {group.key === "operations"
                              ? adminLanguage === "bg" ? "Оперативно" : "Operations"
                              : adminLanguage === "bg" ? "Контрол" : "Control"}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className={`mb-8 grid gap-5 ${isOperationalRole ? "" : "xl:grid-cols-2"}`}>
              {!isOperationalRole && (
              <div className="rounded-[26px] border border-white/10 bg-black/20 p-4 md:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="section-kicker">
                      {adminLanguage === "bg" ? "Резервации" : "Reservations"}
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold text-[#fff4df]">
                      {statsPeriod === "today"
                        ? (adminLanguage === "bg" ? "Днешни резервации" : "Today's reservations")
                        : (adminLanguage === "bg" ? "Следващите 5 резервации" : "Next 5 reservations")}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("reservations")}
                    className="ghost-button hidden rounded-full px-4 py-2 text-sm font-semibold sm:block"
                  >
                    {a.tabs.reservations}
                  </button>
                </div>

                <div className="grid gap-5">
                  {dashboardReservationSections.map((section) => (
                    <section key={section.key}>
                      {statsPeriod === "today" && (
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#f2d39a]">
                            {section.title}
                          </h3>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/55">
                            {section.items.length}
                          </span>
                        </div>
                      )}
                      {section.items.length === 0 ? (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">
                          {section.empty}
                        </div>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {section.items.map((reservation) => (
                            <button
                              key={`${section.key}-${reservation.id}`}
                              type="button"
                              onClick={() => {
                                setExpandedId(reservation.id);
                                setSearch("");
                                setStatusFilter("All");
                                setActiveTab("reservations");
                              }}
                              className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left transition hover:border-[#c9a56a]/45 hover:bg-[#c9a56a]/10"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <span className="min-w-0 truncate text-base font-semibold text-[#fff4df]">
                                  {reservation.guestName}
                                </span>
                                <span className="shrink-0 rounded-full border border-[#f2d39a]/20 bg-[#c9a56a]/12 px-2.5 py-1 text-xs font-semibold text-[#f2d39a]">
                                  {reservation.reservedTime}
                                </span>
                              </div>
                              <div className="mt-3 text-xs leading-5 text-white/50">
                                {reservation.reservedDate} · {reservation.guestCount} {a.liveMap.guests}
                              </div>
                              <div className="mt-1 text-xs text-white/40">
                                {a.liveMap.table} {reservation.tableIds.join(", ")}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              </div>
              )}

              {isProVersion && <div className="rounded-[26px] border border-white/10 bg-black/20 p-4 md:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="section-kicker">
                      {adminLanguage === "bg" ? "Поръчки" : "Orders"}
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold text-[#fff4df]">
                      {adminLanguage === "bg" ? "Активни поръчки" : "Active orders"}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("orders")}
                    className="ghost-button hidden rounded-full px-4 py-2 text-sm font-semibold sm:block"
                  >
                    {a.tabs.orders}
                  </button>
                </div>

                {recentDashboardOrders.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">
                    {adminLanguage === "bg"
                      ? "Няма активни поръчки за показване."
                      : "No active orders to show."}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {recentDashboardOrders.map((order) => (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => {
                          setExpandedOrderId(order.id);
                          setActiveTab("orders");
                        }}
	                        className={`rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left transition hover:border-[#c9a56a]/45 hover:bg-[#c9a56a]/10 ${
	                          isWaiterRole && hasUnseenGuestItems(order)
	                            ? "waiter-new-alert"
	                            : isWaiterRole && hasReadyDiningItems(order)
	                            ? "waiter-ready-alert"
	                            : ""
	                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="min-w-0 truncate text-base font-semibold text-[#fff4df]">
                            {order.tableLabel}
                          </span>
                          <span className="shrink-0 rounded-full border border-emerald-300/20 bg-emerald-400/12 px-2.5 py-1 text-xs font-semibold text-emerald-100">
                            {order.status}
                          </span>
                        </div>
                        <div className="mt-3 truncate text-xs leading-5 text-white/50">
                          {order.guestName || "—"} · {formatEuroAmount(order.totalPrice)}
                        </div>
	                        {isWaiterRole && hasWaiterAttentionItems(order) && (
	                          <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
	                            hasUnseenGuestItems(order)
	                              ? "border-amber-300/30 bg-amber-400/15 text-amber-100"
	                              : "border-emerald-300/30 bg-emerald-400/15 text-emerald-100"
	                          }`}>
	                            {hasUnseenGuestItems(order)
	                              ? adminLanguage === "bg" ? "Нова добавка" : "New addition"
	                              : adminLanguage === "bg" ? "Има готово блюдо" : "Ready dish"}
	                          </div>
	                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>}
            </div>
          </>
        ) : (
          <div className="mb-8 flex flex-col gap-3 rounded-[22px] border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setActiveTab("home")}
              className="ghost-button w-full rounded-2xl px-4 py-3 text-sm font-semibold sm:w-auto"
            >
              ← {adminLanguage === "bg" ? "Назад" : "Back"}
            </button>
            <div className="px-2 text-sm font-semibold uppercase tracking-[0.2em] text-[#c9a56a]">
              {activeTabLabel}
            </div>
          </div>
        )}

        {adminError && (
          <div className="mb-6 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {adminError}
          </div>
        )}

        {adminNotice && (
          <div className="mb-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {adminNotice}
          </div>
        )}

        {loading && !isDashboard ? (
          <Panel title="Loading">Loading...</Panel>
        ) : !isDashboard ? (
          <>
            {activeTab === "dev" && isDeveloperRole && (
              <>
                <DeveloperManagement
                  language={adminLanguage}
                  restaurantName={branding.name}
                  restaurantId={tenantContext.tenantId}
                  section={developerSection}
                  onSectionChange={setDeveloperSection}
                />
                {developerSection === "service" && (
                  <DeveloperServiceSettings
                    language={adminLanguage}
                    isProVersion={isProVersion}
                    onUnlockPro={unlockProVersion}
                    onLockBasic={lockBasicVersion}
                    adminFetch={adminFetch}
                  />
                )}
                {developerSection === "restaurant" && (
                  <TenantBrandingSettings key={JSON.stringify(branding)} adminFetch={adminFetch} />
                )}
              </>
            )}
            {activeTab === "profile" && (
              <Panel
                title={adminLanguage === "bg" ? "Моят профил" : "My profile"}
                subtitle={
                  adminLanguage === "bg"
                    ? "Личен достъп, смяна на парола и изход от системата."
                    : "Personal access, password change, and logout."
                }
                right={
                  <button
                    type="button"
                    onClick={onAdminLogout}
                    className="rounded-2xl border border-red-300/25 bg-red-500/12 px-5 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/20"
                  >
                    {adminLanguage === "bg" ? "Изход" : "Logout"}
                  </button>
                }
              >
                <div className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
                  <div className="rounded-[26px] border border-white/10 bg-black/20 p-5 text-center md:p-6">
                    <RoleProfileIcon role={adminUser?.role} className="mx-auto h-48 w-32 md:h-56 md:w-36" />
                    <h3 className="mt-5 text-2xl font-semibold text-[#fff4df]">
                      {adminUser?.name || adminUser?.email || "Admin"}
                    </h3>
                    <div className="mt-2 text-sm text-white/45">{adminUser?.email}</div>
                    <div className="mt-4 inline-flex rounded-full border border-[#f2d39a]/20 bg-[#c9a56a]/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#f2d39a]">
                      {getAdminRoleLabel(adminUser?.role, adminLanguage)}
                    </div>
                  </div>

                  <div className="grid gap-5">
                    <div className="rounded-[26px] border border-white/10 bg-black/20 p-5 md:p-6">
                      <div className="section-kicker">
                        {adminLanguage === "bg" ? "Известия" : "Notifications"}
                      </div>
                      <h3 className="mt-2 text-2xl font-semibold text-[#fff4df]">
                        {adminLanguage === "bg" ? "Push известия на това устройство" : "Push notifications on this device"}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-white/45">
                        {adminLanguage === "bg"
                          ? "Включете ги на всяко устройство, което трябва да получава известие при нова потвърдена резервация."
                          : "Enable them on every device that should receive an alert for each new confirmed reservation."}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-white/35">
                        {adminLanguage === "bg"
                          ? "Компютър и Android работят директно от браузъра. На iPhone/iPad първо добавете админката на началния екран и я отворете от иконата."
                          : "Desktop and Android work directly from the browser. On iPhone/iPad, first add the admin to the Home Screen and open it from the icon."}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={enablePushNotifications}
                          className="luxury-button rounded-2xl px-6 py-3 text-sm font-semibold"
                        >
                          {pushEnabled
                            ? adminLanguage === "bg" ? "Включени са" : "Enabled"
                            : adminLanguage === "bg" ? "Включи известия" : "Enable notifications"}
                        </button>
                        <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                          {pushPermission === "granted"
                            ? adminLanguage === "bg" ? "разрешени" : "allowed"
                            : pushPermission === "denied"
                              ? adminLanguage === "bg" ? "блокирани" : "blocked"
                              : pushPermission === "unsupported"
                                ? adminLanguage === "bg" ? "неподдържани" : "unsupported"
                                : adminLanguage === "bg" ? "изчаква разрешение" : "waiting for permission"}
                        </span>
                      </div>
                    </div>

                  <form onSubmit={changeOwnPassword} className="rounded-[26px] border border-white/10 bg-black/20 p-5 md:p-6">
                    <input type="text" name="username" autoComplete="username" value={adminUser?.email || ""} readOnly hidden />
                    <div className="section-kicker">
                      {adminLanguage === "bg" ? "Сигурност" : "Security"}
                    </div>
                    <h3 className="mt-2 text-2xl font-semibold text-[#fff4df]">
                      {adminLanguage === "bg" ? "Смяна на парола" : "Change password"}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-white/45">
                      {adminLanguage === "bg"
                        ? "Въведете текущата парола и нова парола с поне 8 символа."
                        : "Enter your current password and a new password with at least 8 characters."}
                    </p>

	                    <div className="mt-5 grid gap-4 md:grid-cols-2">
	                      <label className="block text-sm text-white/60">
	                        {adminLanguage === "bg" ? "Текуща парола" : "Current password"}
	                        <span className="mt-2 flex overflow-hidden rounded-2xl border border-white/10 bg-black/25 focus-within:border-amber-300">
	                          <input name="currentPassword"
	                            type={showOwnPasswords.currentPassword ? "text" : "password"}
	                            autoComplete="current-password"
	                            value={ownPasswordForm.currentPassword}
	                            onChange={(event) => setOwnPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
	                            className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
	                          />
	                          <button
	                            type="button"
	                            onClick={() => setShowOwnPasswords((prev) => ({ ...prev, currentPassword: !prev.currentPassword }))}
	                            className="border-l border-white/10 px-3 text-xs font-semibold text-[#f2d39a] transition hover:bg-white/5"
	                          >
	                            {showOwnPasswords.currentPassword
	                              ? adminLanguage === "bg" ? "Скрий" : "Hide"
	                              : adminLanguage === "bg" ? "Покажи" : "Show"}
	                          </button>
	                        </span>
	                      </label>
	                      <label className="block text-sm text-white/60">
	                        {adminLanguage === "bg" ? "Нова парола" : "New password"}
	                        <span className="mt-2 flex overflow-hidden rounded-2xl border border-white/10 bg-black/25 focus-within:border-amber-300">
	                          <input name="newPassword"
	                            type={showOwnPasswords.newPassword ? "text" : "password"}
	                            autoComplete="new-password"
	                            value={ownPasswordForm.newPassword}
	                            onChange={(event) => setOwnPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))}
	                            className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
	                          />
	                          <button
	                            type="button"
	                            onClick={() => setShowOwnPasswords((prev) => ({ ...prev, newPassword: !prev.newPassword }))}
	                            className="border-l border-white/10 px-3 text-xs font-semibold text-[#f2d39a] transition hover:bg-white/5"
	                          >
	                            {showOwnPasswords.newPassword
	                              ? adminLanguage === "bg" ? "Скрий" : "Hide"
	                              : adminLanguage === "bg" ? "Покажи" : "Show"}
	                          </button>
	                        </span>
	                      </label>
	                    </div>

                    <button className="luxury-button mt-5 rounded-2xl px-6 py-3 text-sm font-semibold">
                      {adminLanguage === "bg" ? "Смени паролата" : "Change password"}
                    </button>
                  </form>
                  {currentAdminRole === "Owner" && <PreorderSettings adminFetch={adminFetch} role={currentAdminRole} language={adminLanguage} />}
                  </div>
                </div>
              </Panel>
            )}

            {activeTab === "liveMap" && (
              <ReservationOperationsMap
                text={a.liveMap}
                leadingStatistic={showTodayGuestSummary ? (
                  <TodayGuestSummary reservations={reservations} language={adminLanguage}
                    timeZone={branding.timeZoneId} loaded={reservationsLoaded} stale={reservationsStale} />
                ) : null}
                language={adminLanguage}
                layout={plan.tables}
                reservations={reservations.filter((reservation) => !isHallBlock(reservation))}
                diningOrders={diningOrders}
                menuItems={menuItems}
                selectedArea={reservationMapArea}
                onAreaChange={setReservationMapArea}
                selectedDate={reservationMapDate}
                onDateChange={setReservationMapDate}
                onArrived={markReservationArrived}
                onAddConsumptionItem={addConsumptionItem}
                onUpdateConsumptionItem={updateConsumptionItem}
                onMove={moveReservationFromMap}
                onNoShow={markReservationNoShow}
                onCancel={(reservation) => updateStatus(reservation.id, "cancel")}
                onOpenReservation={isWaiterRole ? null : openReservationFromMap}
                onOpenOrder={(orderId) => {
                  setExpandedOrderId(orderId);
                  setActiveTab("orders");
                }}
                onSeatWalkIn={seatWalkInFromMap}
                onCreateReservation={isWaiterRole ? null : saveAdminReservationPayload}
                onEditReservation={isWaiterRole ? null : editAdminReservationPayload}
                onClaimReservation={isWaiterRole ? claimReservationForConsumption : null}
                onRelease={releaseReservationTable}
                publicTableHolds={publicTableHolds}
                onBlockPublicTables={isWaiterRole ? null : blockReservationTablesFromPublic}
                onRemovePublicTableHold={isWaiterRole ? null : removePublicTableHold}
                requireTableClaim={isWaiterRole}
                diningEnabled={isProVersion}
                ordersOnly={false}
                onExitMap={() => setActiveTab("home")}
                mapViewMode={adminMapViewMode}
                onMapViewModeChange={changeAdminMapViewMode}
              />
            )}

            {activeTab === "reservations" && (
              <Panel
                title={a.reservations.title}
                subtitle={a.reservations.subtitle}
                right={
                  <div className="flex flex-col gap-3 md:flex-row">
                    <button
                      type="button"
                      onClick={() => setShowCreateReservation((isOpen) => !isOpen)}
                      className="luxury-button rounded-2xl px-5 py-3 text-sm font-semibold"
                    >
                      {adminLanguage === "bg" ? "Нова резервация" : "New reservation"}
                    </button>

                    <input name="reservationSearch"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={a.reservations.search}
                      className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-white/35 focus:border-amber-300"
                    />

                    <select name="reservationStatusFilter"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-amber-300"
                    >
                      {[
                        ["All", adminLanguage === "bg" ? "Всички" : "All"],
                        ["Pending", adminLanguage === "bg" ? "Чакащи" : "Pending"],
                        ["Approved", adminLanguage === "bg" ? "Потвърдени" : "Approved"],
                        ["Cancelled", adminLanguage === "bg" ? "Отказани" : "Cancelled"],
                      ].map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                }
              >
                {["Administrator", "Owner", "Developer"].includes(currentAdminRole) && <WaitlistPanel adminFetch={adminFetch} language={adminLanguage} />}
                {showCreateReservation && (
                  <div className="mb-6 overflow-hidden rounded-[26px] border border-[#c9a56a]/22 bg-[radial-gradient(circle_at_top_left,rgba(201,165,106,0.16),transparent_36%),rgba(0,0,0,0.2)] p-5 shadow-2xl shadow-black/20">
                    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                      <div>
                        <div className="section-kicker">
                          {adminLanguage === "bg" ? "Бързо добавяне" : "Quick create"}
                        </div>
                        <h3 className="mt-2 text-2xl font-semibold text-[#fff4df]">
                          {adminLanguage === "bg" ? "Нова резервация" : "New reservation"}
                        </h3>
                        <p className="mt-2 text-sm text-stone-400">
                          {adminLanguage === "bg"
                            ? "За телефонни резервации. Email може да остане празен."
                            : "For phone reservations. Email can stay empty."}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowCreateReservation(false)}
                        className="ghost-button rounded-full px-4 py-2 text-sm"
                      >
                        {adminLanguage === "bg" ? "Скрий" : "Hide"}
                      </button>
                    </div>

                    <form onSubmit={createAdminReservation} className="grid gap-4 lg:grid-cols-3">
                      {[
                        ["guestName", adminLanguage === "bg" ? "Име на гост" : "Guest name"],
                        ["phone", adminLanguage === "bg" ? "Телефон" : "Phone"],
                        ["email", adminLanguage === "bg" ? "Email по желание" : "Email optional"],
                        ["reservedDate", adminLanguage === "bg" ? "Дата" : "Date"],
                        ["reservedTime", adminLanguage === "bg" ? "Час" : "Time"],
                        ["guestCount", adminLanguage === "bg" ? "Гости" : "Guests"],
                      ].map(([key, label]) => (
                        <div key={key}>
                          <label htmlFor={`${adminFormId}-reservation-create-${key}`} className="mb-2 block text-sm text-stone-400">{label}</label>
                          {key === "reservedTime" ? (
                            <select name="reservationCreate.reservedTime"
                              id={`${adminFormId}-reservation-create-${key}`}
                              aria-label={label}
                              value={adminReservation.reservedTime}
                              onChange={(e) =>
                                setAdminReservation((prev) => ({
                                  ...prev,
                                  reservedTime: e.target.value,
                                  tableIds: "",
                                }))
                              }
                              required
                              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                            >
                              <option value="">{adminLanguage === "bg" ? "Избери час" : "Select time"}</option>
                              {availableAdminReservationTimes.map((time) => (
                                <option key={time} value={time}>
                                  {time}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input name={`reservationCreate.${key}`}
                              id={`${adminFormId}-reservation-create-${key}`}
                              aria-label={label}
                              type={key === "reservedDate" ? "date" : key === "guestCount" ? "number" : "text"}
                              value={adminReservation[key]}
                              onChange={(e) =>
                                setAdminReservation((prev) => ({
                                  ...prev,
                                  [key]: e.target.value,
                                  ...(key === "reservedDate" ? { tableIds: "" } : {}),
                                }))
                              }
                              required={["phone", "reservedDate", "guestCount", "tableIds"].includes(key)}
                              {...(key === "reservedDate" ? { min: todayInput } : {})}
                              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                            />
                          )}
                        </div>
                      ))}

                      <div className="lg:col-span-3">
                        <p id={`${adminFormId}-reservation-create-area`} className="mb-3 block text-sm text-stone-400">
                          {adminLanguage === "bg" ? "Зона за гостите" : "Guest area"}
                        </p>
                        <div role="group" aria-labelledby={`${adminFormId}-reservation-create-area`} className="grid gap-3 md:grid-cols-3">
                          {reservationAreaOptions.map((option) => {
                            const selected = adminReservation.area === option.value;

                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() =>
                                  setAdminReservation((prev) => ({
                                    ...prev,
                                    area: option.value,
                                    tableIds: "",
                                  }))
                                }
                                className={`menu-spark rounded-[22px] border p-4 text-left transition ${
                                  selected
                                    ? "border-[#c9a56a]/55 bg-[#c9a56a]/15 shadow-xl shadow-black/25"
                                    : "border-white/10 bg-white/[0.04] hover:border-[#c9a56a]/30"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="font-semibold text-[#fff4df]">{option.title}</div>
                                    <div className="mt-1 text-sm text-stone-400">{option.subtitle}</div>
                                  </div>
                                  <span
                                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                      selected ? "bg-[#c9a56a] text-black" : "border border-white/10 text-stone-300"
                                    }`}
                                  >
                                    {option.meta}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="lg:col-span-3">
                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <label htmlFor={`${adminFormId}-reservation-create-tableIds`} className="block text-sm text-stone-400">
                              {adminLanguage === "bg" ? "Маси" : "Tables"}
                            </label>
                            <p className="mt-1 text-xs text-stone-500">
                              {adminLanguage === "bg"
                                ? "Избери от бутоните или въведи номера ръчно."
                                : "Pick from chips or type table numbers manually."}
                            </p>
                          </div>
                          {adminReservationTableIds.length > 0 && (
                            <div className="rounded-full border border-[#c9a56a]/25 bg-[#c9a56a]/10 px-4 py-2 text-sm text-[#f2d39a]">
                              {adminReservationTableIds.join(", ")}
                            </div>
                          )}
                        </div>
                        <input name="reservationCreate.tableIds"
                          id={`${adminFormId}-reservation-create-tableIds`}
                          value={adminReservation.tableIds}
                          onChange={(e) =>
                            setAdminReservation((prev) => ({
                              ...prev,
                              tableIds: e.target.value,
                            }))
                          }
                          required
                          placeholder={adminLanguage === "bg" ? "Напр. 20, 21, 22" : "Example: 20, 21, 22"}
                          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none placeholder:text-white/30 focus:border-amber-300"
                        />
                        <div className="mt-3 rounded-[22px] border border-white/10 bg-black/15 p-3">
                          <TableChipSelector
                            area={adminReservation.area}
                            selectedTableIds={adminReservationTableIds}
                            onToggle={toggleAdminReservationTable}
                            unavailableTableIds={adminReservationUnavailableTableIds}
                            requiredSeats={Number(adminReservation.guestCount || 0)}
                            staffSelection
                            tableIdsOverride={activeTableIdsByArea[adminReservation.area]}
                            areaTables={activeTablesByArea[adminReservation.area]}
                            hideUnavailable={Boolean(adminReservation.reservedDate && adminReservation.reservedTime)}
                            emptyMessage={
                              adminLanguage === "bg"
                                ? "Няма свободни маси за този час."
                                : "No free tables for this time."
                            }
                          />
                        </div>
                      </div>

                      <div className="lg:col-span-3">
                        <label htmlFor={`${adminFormId}-reservation-create-internalNote`} className="mb-2 block text-sm text-stone-400">
                          {adminLanguage === "bg" ? "Вътрешна бележка" : "Internal note"}
                        </label>
                        <textarea name="reservationCreate.internalNote"
                          id={`${adminFormId}-reservation-create-internalNote`}
                          value={adminReservation.internalNote}
                          onChange={(e) =>
                            setAdminReservation((prev) => ({
                              ...prev,
                              internalNote: e.target.value,
                            }))
                          }
                          rows={4}
                          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                        />
                      </div>

                      <button className="luxury-button rounded-2xl px-6 py-4 font-semibold lg:col-span-3">
                        {adminLanguage === "bg" ? "Създай резервация" : "Create reservation"}
                      </button>
                    </form>
                  </div>
                )}

                <div className="grid gap-3 xl:hidden">
                  {filteredReservations.map((r) => {
                    const expanded = expandedId === r.id;
                    const tableEdit = getTableEdit(r);

                    return (
                      <article
                        key={r.id}
                        className={`rounded-[24px] border p-4 transition ${
                          r.isBlacklisted
                            ? "border-yellow-400/25 bg-yellow-500/10"
                            : r.isRegularCustomer
                            ? "border-emerald-400/20 bg-emerald-500/10"
                            : "border-white/10 bg-white/[0.04]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : r.id)}
                          className="w-full text-left"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-lg font-semibold text-white">{r.guestName}</div>
                              <div className="mt-1 text-xs text-stone-500">
                                #{r.id} · {r.createdByAdmin ? a.reservations.sourceAdmin : a.reservations.sourceWebsite}
                              </div>
                            </div>
                            <StatusBadge status={r.status} />
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                            <div className="rounded-2xl bg-black/20 p-3">
                              <div className="text-xs text-stone-500">{a.reservations.date}</div>
                              <div className="mt-1 text-white">{r.reservedDate}</div>
                            </div>
                            <div className="rounded-2xl bg-black/20 p-3">
                              <div className="text-xs text-stone-500">{a.reservations.time}</div>
                              <div className="mt-1 text-white">{r.reservedTime}</div>
                            </div>
                            <div className="rounded-2xl bg-black/20 p-3">
                              <div className="text-xs text-stone-500">{a.reservations.guests}</div>
                              <div className="mt-1 text-white">{r.guestCount}</div>
                            </div>
                            <div className="rounded-2xl bg-black/20 p-3">
                              <div className="text-xs text-stone-500">{a.reservations.tables}</div>
                              <div className="mt-1 truncate text-white">{r.tableIds.join(", ")}</div>
                            </div>
                          </div>

                          <div className="mt-3 text-right text-xs uppercase tracking-[0.22em] text-[#d8b377]">
                            {expanded ? a.reservations.close : a.reservations.open}
                          </div>
                        </button>

                        {expanded && (
                          <div className="mt-4 border-t border-white/10 pt-4">
                            <div className="grid gap-3 md:grid-cols-3">
                              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <div className="text-xs uppercase tracking-[0.22em] text-amber-300">
                                  {a.reservations.contact}
                                </div>
                                <div className="mt-3 text-sm text-stone-300">{a.reservations.phone}: {r.phone}</div>
                                <div className="mt-2 text-sm text-stone-300">{a.reservations.email}: {r.email || "—"}</div>
                                <div className="mt-2 text-sm text-stone-300">{a.reservations.birthday}: {formatBirthday(r.birthDate, adminLanguage)}</div>
                              </div>

                              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <div className="text-xs uppercase tracking-[0.22em] text-amber-300">
                                  {a.reservations.notes}
                                </div>
                                <div className="mt-3 text-sm text-stone-300">{a.reservations.client}: {r.notes || "—"}</div>
                                <label className="mt-3 block text-xs text-stone-500">{a.reservations.internal}</label>
                                <textarea name={`reservationRows[${r.id}].internalNote`}
                                  value={getNoteEdit(r)}
                                  onChange={(event) => setNoteEdit(r, event.target.value)}
                                  rows={3}
                                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-amber-300"
                                  placeholder={adminLanguage === "bg" ? "Вътрешна бележка за екипа..." : "Internal note for the team..."}
                                />
                                <button
                                  type="button"
                                  onClick={() => saveReservationNote(r)}
                                  className="ghost-button mt-3 rounded-xl px-4 py-2 text-xs font-semibold"
                                >
                                  {adminLanguage === "bg" ? "Запази бележка" : "Save note"}
                                </button>
                              </div>

                              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <div className="text-xs uppercase tracking-[0.22em] text-amber-300">
                                  {a.reservations.flags}
                                </div>
                                <div className="mt-3 text-sm text-stone-300">Blacklist: {r.isBlacklisted ? (adminLanguage === "bg" ? "Да" : "Yes") : (adminLanguage === "bg" ? "Не" : "No")}</div>
                                <div className="mt-2 text-sm text-stone-300">{adminLanguage === "bg" ? "Редовен клиент" : "Regular"}: {r.isRegularCustomer ? (adminLanguage === "bg" ? "Да" : "Yes") : (adminLanguage === "bg" ? "Не" : "No")}</div>
                                <div className="mt-2 text-sm text-stone-300">Marketing: {r.marketingConsent ? (adminLanguage === "bg" ? "Да" : "Yes") : (adminLanguage === "bg" ? "Не" : "No")}</div>
                                <div className="mt-2 text-sm text-stone-300">Privacy: {r.privacyConsent ? (adminLanguage === "bg" ? "Да" : "Yes") : (adminLanguage === "bg" ? "Не" : "No")}</div>
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <button
                                onClick={() => updateStatus(r.id, "cancel")}
                                disabled={r.status === "Cancelled"}
                                className="rounded-xl bg-red-500 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                              >
                                {a.reservations.cancel}
                              </button>
                              <button
                                onClick={() => archiveReservation(r.id)}
                                className="rounded-xl border border-red-300/25 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-100"
                              >
                                {a.reservations.archive}
                              </button>
                              <button
                                onClick={() => addToBlacklist(r)}
                                className="rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-3 py-2 text-xs font-medium text-yellow-200"
                              >
                                {a.reservations.noShow}
                              </button>
                            </div>

                            <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
                              <div className="text-xs uppercase tracking-[0.22em] text-amber-300">
                                {a.reservations.changeTables}
                              </div>
                              <p className="mt-2 text-sm text-stone-400">{a.reservations.changeTablesHint}</p>
                              <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_1fr_0.9fr_1fr_auto]">
                                <label className="min-w-[140px]">
                                  <span className="mb-1 block text-xs text-stone-500">
                                    {a.reservations.date}
                                  </span>
                                  <input name={`reservationRows[${r.id}].reservedDate`}
                                    type="date"
                                    min={todayInput}
                                    value={tableEdit.reservedDate}
                                    onChange={(e) => setTableEditDateTime(r, "reservedDate", e.target.value)}
                                    disabled={r.status === "Cancelled"}
                                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-amber-300 disabled:opacity-40"
                                  />
                                </label>
                                <label className="min-w-[140px]">
                                  <span className="mb-1 block text-xs text-stone-500">
                                    {a.reservations.time}
                                  </span>
                                  <select name={`reservationRows[${r.id}].reservedTime`}
                                    value={tableEdit.reservedTime}
                                    onChange={(e) => setTableEditDateTime(r, "reservedTime", e.target.value)}
                                    disabled={r.status === "Cancelled"}
                                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-amber-300 disabled:opacity-40"
                                  >
                                    {getAvailableReservationTimesForDate(adminReservationTimes, tableEdit.reservedDate).map((time) => (
                                      <option key={time} value={time}>{time}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="min-w-[140px]">
                                  <span className="mb-1 block text-xs text-stone-500">
                                    {a.reservations.guests}
                                  </span>
                                  <input name={`reservationRows[${r.id}].guestCount`}
                                    type="number"
                                    min="1"
                                    value={tableEdit.guestCount}
                                    onChange={(e) => setTableEditGuestCount(r, e.target.value)}
                                    disabled={r.status === "Cancelled"}
                                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-amber-300 disabled:opacity-40"
                                  />
                                </label>
                                <select name={`reservationRows[${r.id}].area`}
                                  value={tableEdit.area}
                                  onChange={(e) => setTableEditArea(r, e.target.value)}
                                  disabled={r.status === "Cancelled"}
                                  className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-amber-300 disabled:opacity-40"
                                >
                                  {plan.zones.filter(zone => zone.isActive && (!closedAreas.includes(zone.id) || tableEdit.area === zone.id)).map(zone => <option key={zone.id} value={zone.id}>{getAdminZoneLabel(zone, adminLanguage, "selection")}</option>)}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => saveReservationTables(r)}
                                  disabled={r.status === "Cancelled" || tableEdit.tableIds.length === 0}
                                  className="rounded-2xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black disabled:opacity-40"
                                >
                                  {a.reservations.saveTables}
                                </button>
                              </div>
                              <div className="mt-4">
                                <TableChipSelector
                                  area={tableEdit.area}
                                  selectedTableIds={tableEdit.tableIds}
                                  onToggle={(tableId) => toggleTableEdit(r, tableId)}
                                  requiredSeats={Number(tableEdit.guestCount || r.guestCount || 0)}
                                  staffSelection
                                  tableIdsOverride={activeTableIdsByArea[tableEdit.area]}
                                  areaTables={activeTablesByArea[tableEdit.area]}
                                  unavailableTableIds={getUnavailableTableIdsForSlot(
                                    reservations,
                                    tableEdit.reservedDate,
                                    tableEdit.reservedTime,
                                    r.id
                                  )}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>

                <div className="hidden overflow-x-auto xl:block">
                  <table className="w-full min-w-[950px] text-left text-sm">
                    <thead className="text-stone-400">
                      <tr className="border-b border-white/10">
                        <th className="p-4">{a.reservations.guest}</th>
                        <th className="p-4">{a.reservations.date}</th>
                        <th className="p-4">{a.reservations.time}</th>
                        <th className="p-4">{a.reservations.tables}</th>
                        <th className="p-4">{a.reservations.guests}</th>
                        <th className="p-4">{a.reservations.status}</th>
                        <th className="p-4">{a.reservations.actions}</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredReservations.map((r) => {
                        const expanded = expandedId === r.id;
                        const tableEdit = getTableEdit(r);

                        return (
                          <React.Fragment key={r.id}>
                            <tr
                              className={`border-b border-white/10 transition ${
                                r.isBlacklisted
                                  ? "bg-yellow-500/10"
                                  : r.isRegularCustomer
                                  ? "bg-emerald-500/10"
                                  : "hover:bg-white/[0.03]"
                              }`}
                            >
                              <td className="p-4">
                                <button
                                  onClick={() => setExpandedId(expanded ? null : r.id)}
                                  className="text-left"
                                >
                                  <div className="font-medium text-white">{r.guestName}</div>
                                  <div className="mt-1 text-xs text-stone-500">
                                    #{r.id} · {r.createdByAdmin ? a.reservations.sourceAdmin : a.reservations.sourceWebsite}
                                  </div>
                                </button>
                              </td>

                              <td className="p-4">{r.reservedDate}</td>
                              <td className="p-4">{r.reservedTime}</td>
                              <td className="p-4">{r.tableIds.join(", ")}</td>
                              <td className="p-4">{r.guestCount}</td>
                              <td className="p-4">
                                <StatusBadge status={r.status} />
                              </td>

                              <td className="p-4">
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    onClick={() => updateStatus(r.id, "cancel")}
                                    disabled={r.status === "Cancelled"}
                                    className="rounded-xl bg-red-500 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                                  >
                                    {a.reservations.cancel}
                                  </button>
                                  <button
                                    onClick={() => archiveReservation(r.id)}
                                    className="rounded-xl border border-red-300/25 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-100"
                                  >
                                    {a.reservations.archive}
                                  </button>

                                  <button
                                    onClick={() => addToBlacklist(r)}
                                    className="rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-3 py-2 text-xs font-medium text-yellow-200"
                                  >
                                    {a.reservations.noShow}
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {expanded && (
                              <tr className="border-b border-white/10 bg-black/20">
                                <td colSpan={7} className="p-5">
                                  <div className="grid gap-4 md:grid-cols-3">
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                                      <div className="text-xs uppercase tracking-[0.25em] text-amber-300">
                                        {a.reservations.contact}
                                      </div>
                                      <div className="mt-3 text-sm text-stone-300">
                                        {a.reservations.phone}: {r.phone}
                                      </div>
                                      <div className="mt-2 text-sm text-stone-300">
                                        {a.reservations.email}: {r.email || "—"}
                                      </div>
                                      <div className="mt-2 text-sm text-stone-300">
                                        {a.reservations.birthday}: {formatBirthday(r.birthDate, adminLanguage)}
                                      </div>
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                                      <div className="text-xs uppercase tracking-[0.25em] text-amber-300">
                                        {a.reservations.notes}
                                      </div>
                                      <div className="mt-3 text-sm text-stone-300">
                                        {a.reservations.client}: {r.notes || "—"}
                                      </div>
                                      <label className="mt-3 block text-xs text-stone-500">{a.reservations.internal}</label>
                                      <textarea name={`reservationCards[${r.id}].internalNote`}
                                        value={getNoteEdit(r)}
                                        onChange={(event) => setNoteEdit(r, event.target.value)}
                                        rows={3}
                                        className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-amber-300"
                                        placeholder={adminLanguage === "bg" ? "Вътрешна бележка за екипа..." : "Internal note for the team..."}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => saveReservationNote(r)}
                                        className="ghost-button mt-3 rounded-xl px-4 py-2 text-xs font-semibold"
                                      >
                                        {adminLanguage === "bg" ? "Запази бележка" : "Save note"}
                                      </button>
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                                      <div className="text-xs uppercase tracking-[0.25em] text-amber-300">
                                        {a.reservations.flags}
                                      </div>
                                      <div className="mt-3 text-sm text-stone-300">
                                        Blacklist: {r.isBlacklisted ? (adminLanguage === "bg" ? "Да" : "Yes") : (adminLanguage === "bg" ? "Не" : "No")}
                                      </div>
                                      <div className="mt-2 text-sm text-stone-300">
                                        {adminLanguage === "bg" ? "Редовен клиент" : "Regular"}: {r.isRegularCustomer ? (adminLanguage === "bg" ? "Да" : "Yes") : (adminLanguage === "bg" ? "Не" : "No")}
                                      </div>
                                      <div className="mt-2 text-sm text-stone-300">
                                        Marketing: {r.marketingConsent ? (adminLanguage === "bg" ? "Да" : "Yes") : (adminLanguage === "bg" ? "Не" : "No")}
                                      </div>
                                      <div className="mt-2 text-sm text-stone-300">
                                        Privacy: {r.privacyConsent ? (adminLanguage === "bg" ? "Да" : "Yes") : (adminLanguage === "bg" ? "Не" : "No")}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
                                    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                                      <div>
                                        <div className="text-xs uppercase tracking-[0.25em] text-amber-300">
                                          {a.reservations.changeTables}
                                        </div>
                                        <p className="mt-2 text-sm text-stone-400">
                                          {a.reservations.changeTablesHint}
                                        </p>
                                      </div>

                              <div className="flex flex-col gap-2 sm:flex-row">
                                <label className="min-w-[140px]">
                                  <span className="mb-1 block text-xs text-stone-500">
                                    {a.reservations.date}
                                  </span>
                                  <input name={`reservationCards[${r.id}].reservedDate`}
                                    type="date"
                                    min={todayInput}
                                    value={tableEdit.reservedDate}
                                    onChange={(e) => setTableEditDateTime(r, "reservedDate", e.target.value)}
                                    disabled={r.status === "Cancelled"}
                                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-amber-300 disabled:opacity-40"
                                  />
                                </label>
                                <label className="min-w-[140px]">
                                  <span className="mb-1 block text-xs text-stone-500">
                                    {a.reservations.time}
                                  </span>
                                  <select name={`reservationCards[${r.id}].reservedTime`}
                                    value={tableEdit.reservedTime}
                                    onChange={(e) => setTableEditDateTime(r, "reservedTime", e.target.value)}
                                    disabled={r.status === "Cancelled"}
                                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-amber-300 disabled:opacity-40"
                                  >
                                    {getAvailableReservationTimesForDate(adminReservationTimes, tableEdit.reservedDate).map((time) => (
                                      <option key={time} value={time}>{time}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="min-w-[140px]">
                                          <span className="mb-1 block text-xs text-stone-500">
                                            {a.reservations.guests}
                                          </span>
                                          <input name={`reservationCards[${r.id}].guestCount`}
                                            type="number"
                                            min="1"
                                            value={tableEdit.guestCount}
                                            onChange={(e) => setTableEditGuestCount(r, e.target.value)}
                                            disabled={r.status === "Cancelled"}
                                            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-amber-300 disabled:opacity-40"
                                          />
                                        </label>
                                        <select name={`reservationCards[${r.id}].area`}
                                          value={tableEdit.area}
                                          onChange={(e) => setTableEditArea(r, e.target.value)}
                                          disabled={r.status === "Cancelled"}
                                          className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-amber-300 disabled:opacity-40"
                                        >
                                          {plan.zones.filter(zone => zone.isActive && (!closedAreas.includes(zone.id) || tableEdit.area === zone.id)).map(zone => <option key={zone.id} value={zone.id}>{getAdminZoneLabel(zone, adminLanguage, "selection")}</option>)}
                                        </select>

                                        <button
                                          type="button"
                                          onClick={() => saveReservationTables(r)}
                                          disabled={r.status === "Cancelled" || tableEdit.tableIds.length === 0}
                                          className="rounded-2xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black disabled:opacity-40"
                                        >
                                          {a.reservations.saveTables}
                                        </button>
                                      </div>
                                    </div>

                                    <div className="mt-4">
                                      <TableChipSelector
                                        area={tableEdit.area}
                                        selectedTableIds={tableEdit.tableIds}
                                        onToggle={(tableId) => toggleTableEdit(r, tableId)}
                                        requiredSeats={Number(tableEdit.guestCount || r.guestCount || 0)}
                                        staffSelection
                                        tableIdsOverride={activeTableIdsByArea[tableEdit.area]}
                                        areaTables={activeTablesByArea[tableEdit.area]}
                                        unavailableTableIds={getUnavailableTableIdsForSlot(
                                          reservations,
                                          tableEdit.reservedDate,
                                          tableEdit.reservedTime,
                                          r.id
                                        )}
                                      />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}

            {activeTab === "orders" && (
              <Panel title={a.orders.title} subtitle={a.orders.subtitle}>
                {diningOrders.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/55">
                    {a.orders.empty}
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {diningOrders.map((order) => {
	                      const detailsId = `dining-order-${order.id}-details`;
	                      const hasReadyItems = hasReadyDiningItems(order);
	                      const hasNewItems = isWaiterRole ? hasUnseenGuestItems(order) : hasNewDiningItems(order);
                      const visibleOrderItems = isWaiterRole
                        ? order.items.filter((item) => item.status !== "Done" && item.status !== "Cancelled")
                        : order.items;
                      const productionOrderComplete =
                        isProductionRole &&
                        order.items.length > 0 &&
                        order.items.every((item) => ["Ready", "Done"].includes(item.status));
                      const waiterOrderServed =
                        isWaiterRole &&
                        order.items.length > 0 &&
                        visibleOrderItems.length === 0;
                      const compactOrder = productionOrderComplete || waiterOrderServed;
                      const expanded = isProductionRole ? !productionOrderComplete : !waiterOrderServed && expandedOrderId === order.id;

                      return (
                        <article
                          key={order.id}
                          className={`rounded-[24px] border p-4 ${
	                            productionOrderComplete
	                              ? "border-emerald-300/20 bg-emerald-400/[0.06]"
	                            : isProductionRole && order.status === "New"
	                              ? "new-kitchen-order border-amber-300/45 bg-amber-400/10 shadow-[0_0_34px_rgba(251,191,36,0.14)]"
	                              : isWaiterRole && hasNewItems
	                              ? "waiter-new-alert border-amber-300/35 bg-amber-400/10"
	                              : isWaiterRole && hasReadyItems
	                              ? "waiter-ready-alert border-emerald-300/35 bg-emerald-400/10"
                              : "border-white/10 bg-white/[0.04]"
                          }`}
                        >
                          <button
                            type="button"
	                            aria-expanded={expanded}
	                            aria-controls={detailsId}
	                            disabled={isProductionRole || compactOrder}
	                            onClick={() => setExpandedOrderId(expanded ? null : order.id)}
	                            className={`grid w-full gap-3 text-left md:items-center disabled:cursor-default ${
	                              compactOrder ? "md:grid-cols-[1fr_auto]" : "md:grid-cols-[1fr_1fr_auto]"
	                            }`}
	                          >
                            <div>
                              <div className="text-xs uppercase tracking-[0.2em] text-[#c9a56a]">
                                {a.orders.table}
                              </div>
                              <div className="mt-1 text-xl font-semibold text-[#fff4df]">{order.tableLabel}</div>
                            </div>
	                            {!compactOrder && (
	                            <div className={isProductionRole ? "hidden md:block" : ""}>
                              <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                                {isProductionRole ? (adminLanguage === "bg" ? "Поръчка" : "Order") : a.orders.guest}
                              </div>
                              <div className="mt-1 text-base font-semibold text-white">
                                {isProductionRole ? `#${order.id}` : order.guestName}
                                {!isProductionRole && order.reservation?.isWalkIn && (
                                  <span className="ml-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-emerald-100">
                                    Walk-in
                                  </span>
                                )}
                              </div>
                              {!isWaiterRole && (
                                <div className="mt-1 text-xs text-white/40">
                                  {order.assignedWaiterName
                                    ? `${adminLanguage === "bg" ? "Сервитьор" : "Waiter"}: ${order.assignedWaiterName}`
                                    : adminLanguage === "bg" ? "Непоета поръчка" : "Unclaimed order"}
                                </div>
	                              )}
	                            </div>
	                            )}
	                            <div className="flex items-center justify-between gap-3 md:justify-end">
                              <div className="text-left md:text-right">
                                <div className="text-xs uppercase tracking-[0.2em] text-white/35">
                                  {isProductionRole ? a.orders.status : a.orders.total}
                                </div>
                                <div className="mt-1 text-xl font-semibold text-[#f2d39a]">
	                                  {productionOrderComplete
	                                    ? adminLanguage === "bg" ? "Готово" : "Ready"
	                                    : isProductionRole ? order.status : formatEuroAmount(order.totalPrice)}
	                                </div>
	                              </div>
	                              {!isProductionRole && !waiterOrderServed && <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/65">
	                                {expanded ? a.reservations.close : a.reservations.open}
	                              </span>}
	                            </div>
	                          </button>

	                          {compactOrder && (
	                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/18 px-3 py-2">
	                              <div className="text-xs text-white/50">
	                                {productionOrderComplete
	                                  ? isBarRole
                                      ? adminLanguage === "bg" ? "Всички напитки са готови." : "All drinks are ready."
                                      : adminLanguage === "bg" ? "Всички блюда са готови." : "All dishes are ready."
	                                  : adminLanguage === "bg" ? "Всички блюда са сервирани." : "All dishes are served."}
	                              </div>
	                              {waiterOrderServed && (
	                                <button
	                                  type="button"
	                                  onClick={() => updateDiningOrderStatus(order.id, "Paid")}
	                                  className="rounded-xl border border-emerald-300/25 bg-emerald-400/15 px-4 py-2 text-xs font-semibold text-emerald-100"
	                                >
	                                  {a.orders.paid}
	                                </button>
	                              )}
	                            </div>
	                          )}

	                          {expanded && (
                            <div id={detailsId} className="mt-4 border-t border-white/10 pt-4">
                              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                <div className="flex flex-wrap items-center gap-2">
                                  {!isWaiterRole && (
                                    <>
                                      <span className="rounded-full border border-[#c9a56a]/25 bg-[#c9a56a]/12 px-3 py-1 text-xs font-semibold text-[#f2d39a]">
                                        #{order.id}
                                      </span>
                                      <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/65">
                                        {a.orders.status}: {order.status}
                                      </span>
                                      <span className="rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-xs text-sky-100">
                                        {order.source === "Waiter"
                                          ? adminLanguage === "bg" ? "От сервитьор" : "Waiter order"
                                          : order.source === "Admin"
                                          ? adminLanguage === "bg" ? "От админ" : "Admin order"
                                          : adminLanguage === "bg" ? "Онлайн" : "Online"}
                                      </span>
                                    </>
                                  )}
                                  {order.notes && (
                                    <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs text-amber-100">
                                      {a.orders.notes}: {order.notes}
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  {isProductionRole && order.status === "New" && (
                                    <button
                                      type="button"
                                      onClick={() => updateDiningOrderStatus(order.id, "Seen")}
                                      className="luxury-button rounded-xl px-4 py-2 text-xs font-semibold"
                                    >
                                      {adminLanguage === "bg" ? "Приета" : "Accepted"}
                                    </button>
                                  )}
                                  {isWaiterRole && !order.assignedWaiterId && (
                                    <button
                                      type="button"
                                      onClick={() => claimDiningOrder(order.id)}
                                      className="luxury-button rounded-xl px-3 py-2 text-xs font-semibold"
                                    >
                                      {adminLanguage === "bg" ? "Вземи поръчка" : "Claim order"}
                                    </button>
                                  )}
                                  {isWaiterRole ? (
                                    <>
                                      {hasUnseenGuestItems(order) && (
                                        <button
                                          type="button"
                                          onClick={() => updateDiningOrderStatus(order.id, "Seen")}
                                          className="luxury-button rounded-xl px-3 py-2 text-xs font-semibold"
                                        >
                                          {a.orders.markSeen}
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => updateDiningOrderStatus(order.id, "Paid")}
                                        className="rounded-xl border border-emerald-300/25 bg-emerald-400/15 px-3 py-2 text-xs font-semibold text-emerald-100"
                                      >
                                        {a.orders.paid}
                                      </button>
                                    </>
                                  ) : !isProductionRole && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => updateDiningOrderStatus(order.id, "Seen")}
                                        className="ghost-button rounded-xl px-3 py-2 text-xs font-semibold"
                                      >
                                        {a.orders.markSeen}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => updateDiningOrderStatus(order.id, "Preparing")}
                                        className="rounded-xl border border-[#f2d39a]/25 bg-[#c9a56a]/15 px-3 py-2 text-xs font-semibold text-[#f2d39a]"
                                      >
                                        {a.orders.preparing}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => updateDiningOrderStatus(order.id, "Done")}
                                        className="rounded-xl border border-emerald-300/25 bg-emerald-400/15 px-3 py-2 text-xs font-semibold text-emerald-100"
                                      >
                                        {a.orders.done}
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="mt-4 grid gap-2 md:grid-cols-2">
                                {visibleOrderItems.map((item) => (
                                  <div
                                    key={item.id || item.name}
                                    className={`rounded-2xl border p-3 ${
	                                      item.status === "New"
	                                        ? "waiter-new-dish border-amber-300/35 bg-amber-400/12"
	                                        : isWaiterRole && item.status === "Ready"
	                                        ? "waiter-ready-dish border-emerald-300/35 bg-emerald-400/12"
                                        : "border-white/10 bg-black/20"
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="font-semibold text-white">{item.name}</div>
                                        {item.notes && <div className="mt-1 text-xs text-white/45">{item.notes}</div>}
                                        <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                          item.status === "Ready"
                                            ? "border-emerald-300/30 bg-emerald-400/15 text-emerald-100"
                                            : "border-white/10 bg-black/25 text-white/55"
                                        }`}>
                                          {getDiningItemStatusLabel(item, adminLanguage)}
                                        </div>
                                      </div>
                                      <div className="shrink-0 text-right">
                                        <div className="mb-1 text-xs text-white/45">{formatEuroAmount(item.unitPrice * item.quantity)}</div>
                                        {isProductionRole ? (
                                          <button
                                            type="button"
                                            onClick={() => updateDiningOrderItemStatus(item.id, "Ready")}
                                            disabled={item.status === "Ready" || item.status === "Done"}
                                            className="rounded-full border border-emerald-300/25 bg-emerald-400/15 px-3 py-1.5 text-[11px] font-semibold text-emerald-100 disabled:cursor-default disabled:border-white/10 disabled:bg-white/[0.04] disabled:text-white/40"
                                          >
                                            {item.status === "Ready" || item.status === "Done"
                                              ? adminLanguage === "bg" ? "Готово" : "Ready"
                                            : adminLanguage === "bg" ? "Готово" : "Ready"}
                                          </button>
                                        ) : isWaiterRole ? (
                                          <div className="space-y-2">
                                            <div className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-3 py-1 text-sm text-white">
                                              × {item.quantity}
                                            </div>
                                            {item.status === "Ready" && (
                                              <button
                                                type="button"
                                                onClick={() => updateDiningOrderItemStatus(item.id, "Done")}
                                                className="block rounded-full border border-emerald-300/25 bg-emerald-400/15 px-3 py-1.5 text-[11px] font-semibold text-emerald-100"
                                              >
                                                {a.orders.served}
                                              </button>
                                            )}
                                          </div>
                                        ) : (
                                          <div className="flex items-center overflow-hidden rounded-full border border-white/10">
                                            <button type="button" onClick={() => updateConsumptionItem(item.id, item.quantity - 1)} className="px-3 py-1 text-[#f2d39a]" aria-label={`${a.orders.addItem} ${item.name}`}>-</button>
                                            <span className="min-w-8 text-center text-sm text-white">{item.quantity}</span>
                                            <button type="button" onClick={() => updateConsumptionItem(item.id, item.quantity + 1)} className="px-3 py-1 text-[#f2d39a]" aria-label={`${a.orders.addItem} ${item.name}`}>+</button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {!isProductionRole && (
                              <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-400/10 p-4">
                                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
                                  {a.orders.addItem}
                                </div>
                                <input name={`orders[${order.id}].menuSearch`}
                                  value={orderMenuSearches[order.id] || ""}
                                  onChange={(event) =>
                                    setOrderMenuSearches((prev) => ({ ...prev, [order.id]: event.target.value }))
                                  }
                                  placeholder={a.orders.searchDish}
                                  className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#f2d39a]/50"
                                />
                                {(orderMenuSearches[order.id] || "").trim() && (
                                  <div className="mt-2 grid max-h-72 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                                    {menuItems
                                      .filter((item) => (item.isActive ?? item.IsActive ?? true) === true)
                                      .filter((item) => {
                                        const haystack = `${getValue(item, "nameBg") || ""} ${getValue(item, "nameEn") || ""}`.toLowerCase();
                                        return haystack.includes((orderMenuSearches[order.id] || "").trim().toLowerCase());
                                      })
                                      .slice(0, 12)
                                      .map((item) => {
                                        const name = getValue(item, "nameBg") || getValue(item, "nameEn") || "";
                                        const price = Number(getValue(item, "price") || 0);
                                        return (
                                          <button
                                            key={getValue(item, "id") || name}
                                            type="button"
                                            onClick={() => addOrderItem(order, {
                                              menuItemId: getValue(item, "id"),
                                              name,
                                              unitPrice: price,
                                              kind: getMenuItemKind(item),
                                              quantity: 1,
                                            })}
                                            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-left transition hover:border-[#c9a56a]/40"
                                          >
                                            <span className="min-w-0 truncate text-sm text-white/80">{name}</span>
                                            <span className="shrink-0 text-xs font-semibold text-[#f2d39a]">{formatEuroAmount(price)}</span>
                                          </button>
                                        );
                                      })}
                                  </div>
                                )}
                              </div>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </Panel>
            )}

            {activeTab === "block" && (
              <Panel
                title={adminLanguage === "bg" ? "Блокирай зала" : "Block hall"}
                subtitle={
                  adminLanguage === "bg"
                    ? "Спира новите онлайн резервации за избраната зона, дата и часове. Съществуващите резервации остават без промяна."
                    : adminLanguage === "ru"
                    ? "Закрывает выбранный зал, дату и время для новых онлайн-бронирований. Существующие брони сохраняются."
                    : "Stop new online bookings for the selected area, date and times. Existing reservations stay unchanged."
                }
              >
                <section className="mb-8 rounded-[28px] border border-[#c9a56a]/30 bg-[#c9a56a]/[0.08] p-5 md:p-6" aria-labelledby="seasonal-zones-heading">
                  <h3 id="seasonal-zones-heading" className="text-2xl font-semibold text-[#fff4df]">{adminLocalText(adminLanguage, "Сезонно затваряне на зони", "Seasonal area closure", "Сезонное закрытие зон")}</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">{adminLocalText(adminLanguage, "Затворената зона изчезва от сайта и картата с резервации, докато не я отворите отново. Съществуващите резервации остават в списъка; масите и разположението им се запазват.", "A closed area disappears from the website and reservation map until you reopen it. Existing bookings remain in the list; tables and layout are preserved.", "Закрытая зона исчезает с сайта и карты резерваций, пока вы её не откроете. Существующие брони остаются в списке; столы и расстановка сохраняются.")}</p>
                  {zonesError && <p role="alert" className="mt-3 text-red-200">{adminLocalText(adminLanguage, "Неуспешно зареждане на зоните.", "Failed to load areas.", "Не удалось загрузить зоны.")} <button type="button" onClick={reloadZones} className="underline">{adminLocalText(adminLanguage, "Опитай отново", "Retry", "Повторить")}</button></p>}
                  <div className="mt-5 grid gap-3 lg:grid-cols-3">
                    {plan.zones.map(zone => [zone.id, getAdminZoneLabel(zone, adminLanguage)]).map(([area, name]) => {
                      const closed = closedAreas.includes(area);
                      return <article key={area} className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                        <div><h4 className="font-semibold text-[#fff4df]">{name}</h4><p role="status" className={`mt-2 text-sm ${closed ? "text-amber-200" : "text-emerald-200"}`}>{!zonesLoaded ? "…" : closed ? adminLocalText(adminLanguage, "Затворена за сезона · скрита", "Seasonally closed · hidden", "Закрыта на сезон · скрыта") : adminLocalText(adminLanguage, "Отворена · видима", "Open · visible", "Открыта · видна")}</p></div>
                        <button type="button" disabled={!zonesLoaded || Boolean(savingSeasonalArea)} aria-busy={savingSeasonalArea === area} onClick={() => setSeasonalZone(area, !closed)} className={`${closed ? "luxury-button" : "ghost-button"} mt-auto min-h-[44px] rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-50`}>
                          {savingSeasonalArea === area ? "…" : closed ? adminLocalText(adminLanguage, "Отвори зоната", "Reopen area", "Открыть зону") : adminLocalText(adminLanguage, "Затвори за сезона", "Close for the season", "Закрыть на сезон")}
                        </button>
                      </article>;
                    })}
                  </div>
                </section>
                <form
                  onSubmit={saveRestaurantClosure}
                  className="mb-8 rounded-[28px] border border-[#c9a56a]/30 bg-[#c9a56a]/[0.08] p-5 md:p-6"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="section-kicker">
                        {adminLanguage === "bg" ? "Затвори ресторанта" : "Close restaurant"}
                      </div>
                      <h3 className="mt-2 text-2xl font-semibold text-[#fff4df]">
                        {adminLanguage === "bg" ? "Отпуск или временно затваряне" : "Holiday or temporary closure"}
                      </h3>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
                        {adminLanguage === "bg"
                          ? "Показва уведомление на сайта и автоматично спира онлайн резервациите за целия избран период."
                          : "Shows a website notice and automatically stops online reservations throughout the selected period."}
                      </p>
                    </div>
                    <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                      <input name="restaurantClosure.enabled"
                        type="checkbox"
                        checked={restaurantClosure.enabled}
                        onChange={(event) => setRestaurantClosure((current) => ({ ...current, enabled: event.target.checked }))}
                        className="h-5 w-5 accent-[#c9a56a]"
                      />
                      <span className="text-sm font-semibold text-[#fff4df]">
                        {adminLanguage === "bg" ? "Функцията е активна" : "Closure enabled"}
                      </span>
                    </label>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-sm text-stone-400">
                        {adminLanguage === "bg" ? "Затворено от" : "Closed from"}
                      </span>
                      <input name="restaurantClosure.startDate"
                        type="date"
                        value={restaurantClosure.startDate || ""}
                        onChange={(event) => setRestaurantClosure((current) => ({ ...current, startDate: event.target.value }))}
                        required
                        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm text-stone-400">
                        {adminLanguage === "bg" ? "Затворено до (включително)" : "Closed through (inclusive)"}
                      </span>
                      <input name="restaurantClosure.endDate"
                        type="date"
                        min={restaurantClosure.startDate || undefined}
                        value={restaurantClosure.endDate || ""}
                        onChange={(event) => setRestaurantClosure((current) => ({ ...current, endDate: event.target.value }))}
                        required
                        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                      />
                    </label>
                  </div>

                  <label className="mt-4 block">
                    <span className="mb-2 block text-sm text-stone-400">
                      {adminLanguage === "bg" ? "Текст на уведомлението" : "Notification text"}
                    </span>
                    <textarea name="restaurantClosure.message"
                      value={restaurantClosure.message || ""}
                      onChange={(event) => setRestaurantClosure((current) => ({ ...current, message: event.target.value }))}
                      rows={8}
                      required
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 leading-7 outline-none focus:border-amber-300"
                    />
                  </label>

                  <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-white/55">
                      {restaurantClosure.enabled
                        ? adminLanguage === "bg" ? "Уведомлението ще се показва автоматично през зададения период." : "The notice will appear automatically during this period."
                        : adminLanguage === "bg" ? "Функцията е изключена — сайтът приема резервации нормално." : "Disabled — the website accepts reservations normally."}
                    </div>
                    <button type="submit" className="luxury-button shrink-0 rounded-2xl px-6 py-3 font-semibold">
                      {adminLanguage === "bg" ? "Запази затварянето" : "Save closure"}
                    </button>
                  </div>
                </form>

                <div className="mb-5 border-t border-white/10 pt-7">
                  <div className="section-kicker">
                    {adminLanguage === "bg" ? "Блокиране на зона или часове" : "Block area or hours"}
                  </div>
                </div>
                <form onSubmit={createHallBlock} className="grid gap-4 md:grid-cols-4">
                  <div className="md:col-span-4">
                    <label className="mb-3 block text-sm text-stone-400">
                      {adminLanguage === "bg" ? "Какво резервираме" : "What to block"}
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {hallBlockAreaOptions.map((option) => {
                        const selected = hallBlock.area === option.value;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              setHallBlock((prev) => ({
                                ...prev,
                                area: option.value,
                              }));
                            }}
                            className={`menu-spark rounded-[24px] border p-5 text-left transition ${
                              selected
                                ? "border-[#c9a56a]/55 bg-[#c9a56a]/15 shadow-xl shadow-black/25"
                                : "border-white/10 bg-white/[0.04] hover:border-[#c9a56a]/30"
                            }`}
                          >
                            <div className="section-kicker text-[0.62rem]">
                              {option.value === "all"
                                ? adminLanguage === "bg"
                                  ? "Цял ресторант"
                                  : "Full buyout"
                                : adminLanguage === "bg"
                                ? "Зона"
                                : "Area"}
                            </div>
                            <div className="mt-3 text-lg font-semibold text-[#fff4df]">{option.title}</div>
                            <div className="mt-2 text-sm leading-6 text-stone-400">{option.subtitle}</div>
                            <div
                              className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                selected ? "bg-[#c9a56a] text-black" : "border border-white/10 text-stone-300"
                              }`}
                            >
                              {option.meta}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-stone-400">
                      {adminLanguage === "bg" ? "Дата" : "Date"}
                    </label>
                    <input name="hallBlock.reservedDate"
                      type="date"
                      value={hallBlock.reservedDate}
                      min={todayInput}
                      onChange={(e) => {
                        setHallBlock((prev) => ({
                          ...prev,
                          reservedDate: e.target.value,
                          startTime: prev.startTime || emptyHallBlock.startTime,
                          endTime: prev.endTime || emptyHallBlock.endTime,
                        }));
                      }}
                      required
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-stone-400">
                      {adminLanguage === "bg" ? "От" : "From"}
                    </label>
                    <select name="hallBlock.startTime"
                      value={hallBlock.startTime}
                      onChange={(e) => {
                        setHallBlock((prev) => ({
                          ...prev,
                          startTime: e.target.value,
                        }));
                      }}
                      required
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                    >
                      {availableHallBlockTimes.map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-stone-400">
                      {adminLanguage === "bg" ? "До" : "To"}
                    </label>
                    <select name="hallBlock.endTime"
                      value={hallBlock.endTime}
                      onChange={(e) => {
                        setHallBlock((prev) => ({
                          ...prev,
                          endTime: e.target.value,
                        }));
                      }}
                      required
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                    >
                      {availableHallBlockTimes.map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-4">
                    <label className="mb-2 block text-sm text-stone-400">
                      {adminLanguage === "bg" ? "Бележка" : "Note"}
                    </label>
                    <textarea name="hallBlock.note"
                      value={hallBlock.note}
                      onChange={(e) =>
                        setHallBlock((prev) => ({
                          ...prev,
                          note: e.target.value,
                        }))
                      }
                      rows={3}
                      placeholder={
                        adminLanguage === "bg"
                          ? "Частно събитие, ремонт, запазен ресторант..."
                          : "Private event, maintenance, full buyout..."
                      }
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none placeholder:text-white/30 focus:border-amber-300"
                    />
                  </div>

                  <div className="grid gap-3 text-sm text-stone-300 md:col-span-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <div className="text-stone-500">{adminLanguage === "bg" ? "Часове" : "Slots"}</div>
                      <div className="mt-1 text-lg font-semibold text-[#fff4df]">
                        {buildTimeRange(hallBlock.startTime, hallBlock.endTime).length}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <div className="text-stone-500">{adminLanguage === "bg" ? "Маси" : "Tables"}</div>
                      <div className="mt-1 text-lg font-semibold text-[#fff4df]">
                        {(activeTableIdsByArea[hallBlock.area] || []).length}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[#c9a56a]/20 bg-[#c9a56a]/10 p-4">
                      <div className="text-[#f2d39a]/70">{adminLanguage === "bg" ? "Статус" : "Status"}</div>
                      <div className="mt-1 text-lg font-semibold text-[#f2d39a]">
                        {adminLanguage === "bg" ? "Блокираща резервация" : "Blocking reservation"}
                      </div>
                    </div>
                  </div>

                  <button className="luxury-button rounded-2xl px-6 py-4 font-semibold md:col-span-4">
                    {adminLanguage === "bg" ? "Блокирай избраната зона" : "Block selected area"}
                  </button>

                </form>
                <section className="mt-8 border-t border-white/10 pt-6">
                  <h3 className="text-xl font-semibold text-[#fff4df]">{adminLocalText(adminLanguage, "Блокировки на зали", "Hall blocks", "Блокировки залов")}</h3>
                  <p className="mt-2 text-sm text-white/55">{adminLocalText(adminLanguage, "Разблокирането отваря масите за нови онлайн резервации. Съществуващите резервации остават.", "Unblocking opens tables for new online bookings. Existing reservations stay unchanged.", "Разблокировка открывает столы для новых онлайн-бронирований. Существующие брони остаются.")}</p>
                  <div className="mt-4 space-y-3">
                    {reservations.filter((item) => item.createdByAdmin && item.phone === "admin" && item.guestName === "Admin block" && item.status === "Approved").sort((a, b) => `${b.reservedDate} ${b.reservedTime}`.localeCompare(`${a.reservedDate} ${a.reservedTime}`)).map((block) => (
                      <div key={block.id} className="flex flex-col gap-4 rounded-2xl border border-[#c9a56a]/25 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="font-semibold text-[#fff4df]">{block.area === "all" ? adminLocalText(adminLanguage, "Цял ресторант", "Whole restaurant", "Весь ресторан") : getAdminZoneLabel(plan.zones.find(zone => zone.id === block.area), adminLanguage, "block") || block.area}</div>
                          <div className="mt-1 text-sm text-white/65">{block.reservedDate} · {block.reservedTime}</div>
                          <div className="mt-1 text-xs text-white/45">{adminLocalText(adminLanguage, "Маси", "Tables", "Столы")}: {block.tableIds.join(", ")}</div>
                          {block.notes && <p className="mt-2 text-sm text-white/55">{block.notes}</p>}
                        </div>
                        <button type="button" disabled={unblockingHallId !== null} onClick={() => unblockHall(block.id)} className="shrink-0 rounded-xl border border-emerald-300/25 bg-emerald-400/15 px-4 py-3 text-sm font-semibold text-emerald-100 disabled:opacity-50">
                          {unblockingHallId === block.id ? "..." : adminLocalText(adminLanguage, "Разблокирай", "Unblock", "Разблокировать")}
                        </button>
                      </div>
                    ))}
                    {!reservations.some((item) => item.createdByAdmin && item.phone === "admin" && item.guestName === "Admin block" && item.status === "Approved") && <p className="rounded-2xl border border-white/10 p-4 text-sm text-white/50">{adminLocalText(adminLanguage, "Няма блокировки на зали.", "No hall blocks.", "Блокировок залов нет.")}</p>}
                  </div>
                </section>
              </Panel>
            )}

            {activeTab === "menu" && (
              <Panel
                title={a.menu.title}
                subtitle={a.menu.subtitle}
                right={
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={seedMenuItems}
                      className="ghost-button rounded-full px-4 py-2 text-sm font-semibold"
                    >
                      {adminLanguage === "bg" ? "Запълни от менюто на сайта" : "Seed from site menu"}
                    </button>

                    <div className="flex rounded-full border border-white/10 bg-black/20 p-1">
                      {[
                        ["list", a.menu.list],
                        ["form", editingMenuId ? a.menu.edit : a.menu.add],
                      ].map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            if (key === "form" && menuMode !== "form") {
                              setEditingMenuId(null);
                              setMenuForm({ ...emptyMenuItem, department: selectedMenuDepartment });
                            }
                            setMenuMode(key);
                          }}
                          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                            menuMode === key ? "luxury-button" : "text-white/70 hover:text-white"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                }
              >
                <SommelierSettings adminFetch={adminFetch} language={adminLanguage} />
                {menuMode === "form" ? (
                  <form onSubmit={saveMenuItem} className="space-y-5">
                    <div className="rounded-[26px] border border-white/10 bg-black/20 p-5 md:p-6">
                      <div className="mb-5">
                        <div className="section-kicker">
                          {editingMenuId
                            ? adminLanguage === "bg" ? "Редакция" : "Edit"
                            : adminLanguage === "bg" ? "Ново ястие" : "New dish"}
                        </div>
                        <h3 className="mt-2 text-2xl font-semibold text-[#fff4df]">
                          {editingMenuId ? a.menu.editTitle : a.menu.addTitle}
                        </h3>
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        <div>
                          <label className="mb-2 block text-sm text-stone-400">{a.menu.nameBg}</label>
                          <input name="menuItem.nameBg"
                            value={menuForm.nameBg}
                            onChange={(e) => setMenuForm((prev) => ({ ...prev, nameBg: e.target.value }))}
                            required
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm text-stone-400">{a.menu.nameEn}</label>
                          <input name="menuItem.nameEn"
                            value={menuForm.nameEn}
                            onChange={(e) => setMenuForm((prev) => ({ ...prev, nameEn: e.target.value }))}
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm text-stone-400">Название на русском</label>
                          <input name="menuItem.nameRu"
                            value={menuForm.nameRu}
                            onChange={(e) => setMenuForm((prev) => ({ ...prev, nameRu: e.target.value }))}
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm text-stone-400">{a.menu.weight}</label>
                          <input name="menuItem.weight"
                            value={menuForm.weight}
                            onChange={(e) => setMenuForm((prev) => ({ ...prev, weight: e.target.value }))}
                            placeholder={adminLanguage === "bg" ? "напр. 350 гр" : "e.g. 350 g"}
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm text-stone-400">{a.menu.price}</label>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#f2d39a]">
                              €
                            </span>
                            <input name="menuItem.price"
                              type="number"
                              step="0.01"
                              min="0"
                              value={menuForm.price}
                              onChange={(e) => setMenuForm((prev) => ({ ...prev, price: e.target.value }))}
                              required
                              className="w-full rounded-2xl border border-white/10 bg-black/20 px-9 py-3 outline-none focus:border-amber-300"
                            />
                          </div>
                          <p className="mt-2 text-xs leading-5 text-stone-500">
                            {a.menu.priceHelp}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_180px]">
                        <div>
                          <label className="mb-2 block text-sm text-stone-400">{a.menu.imageUrl}</label>
                          <input name="menuItem.imageUrl"
                            value={menuForm.imageUrl}
                            onChange={(e) => setMenuForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
                            placeholder="https://..."
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                          />
                          <div className="mt-3 flex flex-wrap gap-2">
                            <label className="ghost-button cursor-pointer rounded-2xl px-4 py-3 text-sm font-semibold">
                              <input name="menuItem.imageUpload"
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={handleMenuImageFileChange}
                                className="sr-only"
                              />
                              {a.menu.uploadImage}
                            </label>
                            {menuForm.imageUrl && (
                              <button
                                type="button"
                                onClick={() => setMenuForm((prev) => ({ ...prev, imageUrl: "" }))}
                                className="rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100"
                              >
                                {a.menu.removeImage}
                              </button>
                            )}
                          </div>
                          <p className="mt-2 text-xs leading-5 text-stone-500">
                            {a.menu.imageHelp}
                          </p>
                        </div>

                        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                          {menuForm.imageUrl ? (
                            <img
                              src={restaurantAssetUrl(menuForm.imageUrl, branding.assetBaseUrl)}
                              alt={menuForm.nameBg || a.menu.imageUrl}
                              className="h-36 w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-36 items-center justify-center px-4 text-center text-xs text-stone-500">
                              {adminLanguage === "bg" ? "Preview на снимката" : "Image preview"}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-5 md:p-6">
                      <div className="mb-5">
                        <div className="section-kicker">
                          {adminLanguage === "bg" ? "Основен раздел" : "Main section"}
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {menuDepartmentOptions.map((department) => {
                            const selected = normalizeDepartment(menuForm.department) === department.value;

                            return (
                              <button
                                key={department.value}
                                type="button"
                                onClick={() => {
                                  setSelectedMenuDepartment(department.value);
                                  setSelectedMenuCategory("");
                                  setMenuForm((prev) => ({
                                    ...prev,
                                    department: department.value,
                                    category: isCasaTenant ? (department.value === "Bar" ? "cold-drinks" : "Main") : tenantCategoryOptions(tenantContext.tenantId, department.value)[0] || "",
                                  }));
                                }}
                                className={`rounded-2xl border p-4 text-left transition ${
                                  selected
                                    ? "border-[#c9a56a]/50 bg-[#c9a56a]/15"
                                    : "border-white/10 bg-black/20 hover:border-[#c9a56a]/35"
                                }`}
                              >
                                <div className="font-semibold text-[#fff4df]">
                                  {department.labels[adminLanguage]}
                                </div>
                                <div className="mt-1 text-xs text-stone-500">
                                  {department.value === "Bar"
                                    ? adminLanguage === "bg" ? "Изпраща се към бара" : "Sent to the bar"
                                    : adminLanguage === "bg" ? "Изпраща се към кухнята" : "Sent to the kitchen"}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                        <div>
                          <div className="section-kicker">{a.menu.category}</div>
                          <h4 className="mt-2 text-xl font-semibold text-[#fff4df]">
                            {adminLanguage === "bg" ? "Избери секция" : "Choose section"}
                          </h4>
                        </div>
                        <div className="text-sm text-stone-500">
                          {adminLanguage === "bg" ? "Или създай нова секция по-долу" : "Or create a new section below"}
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {categoryOptions.map((category) => {
                          const selected = normalizeCategory(menuForm.category) === category.id;

                          return (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => setMenuForm((prev) => ({ ...prev, category: category.id }))}
                              className={`rounded-2xl border p-4 text-left transition ${
                                selected
                                  ? "border-[#c9a56a]/50 bg-[#c9a56a]/15"
                                  : "border-white/10 bg-black/20 hover:border-[#c9a56a]/35"
                              }`}
                            >
                              <div className="font-semibold text-[#fff4df]">{category.label}</div>
                              <div className="mt-1 text-xs text-stone-500">
                                {category.count} {adminLanguage === "bg" ? "ястия" : "dishes"}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-4">
                        <label className="mb-2 block text-sm text-stone-400">
                          {adminLanguage === "bg" ? "Нова секция" : "New section"}
                        </label>
                        <input name="menuItem.customCategory"
                          value={
                            categoryOptions.some((category) => category.id === normalizeCategory(menuForm.category))
                              ? ""
                              : menuForm.category
                          }
                          onChange={(e) => setMenuForm((prev) => ({ ...prev, category: e.target.value }))}
                          placeholder={adminLanguage === "bg" ? "например: Напитки" : "for example: Drinks"}
                          className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-amber-300"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <label className="mb-2 block text-sm text-stone-400">{a.menu.descriptionBg}</label>
                        <textarea name="menuItem.descriptionBg"
                          value={menuForm.descriptionBg}
                          onChange={(e) => setMenuForm((prev) => ({ ...prev, descriptionBg: e.target.value }))}
                          rows={5}
                          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-stone-400">{a.menu.descriptionEn}</label>
                        <textarea name="menuItem.descriptionEn"
                          value={menuForm.descriptionEn}
                          onChange={(e) => setMenuForm((prev) => ({ ...prev, descriptionEn: e.target.value }))}
                          rows={5}
                          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-stone-400">Описание на русском</label>
                        <textarea name="menuItem.descriptionRu"
                          value={menuForm.descriptionRu}
                          onChange={(e) => setMenuForm((prev) => ({ ...prev, descriptionRu: e.target.value }))}
                          rows={5}
                          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-stone-300">
                        <input name="menuItem.isActive"
                          type="checkbox"
                          checked={menuForm.isActive}
                          onChange={(e) => setMenuForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                        />
                        {a.menu.active}
                      </label>

                      <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-stone-300">
                        <input name="menuItem.notifySubscribers"
                          type="checkbox"
                          checked={menuForm.notifySubscribers}
                          onChange={(e) => setMenuForm((prev) => ({ ...prev, notifySubscribers: e.target.checked }))}
                        />
                        {a.menu.notify}
                      </label>
                    </div>

                    <div className="flex flex-col gap-3 md:flex-row">
                      <button className="luxury-button rounded-2xl px-6 py-4 font-semibold">
                        {editingMenuId ? a.menu.saveEdit : a.menu.saveAdd}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMenuId(null);
                          setMenuForm(emptyMenuItem);
                          setMenuMode("list");
                        }}
                        className="ghost-button rounded-2xl px-6 py-4 font-semibold"
                      >
                        {a.menu.cancelEdit}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-5">
                    {menuItems.length === 0 && (
                      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-stone-400">
                        <div>{a.menu.empty}</div>
                        <button
                          type="button"
                          onClick={seedMenuItems}
                          className="luxury-button mt-4 rounded-2xl px-5 py-3 text-sm font-semibold"
                        >
                          {adminLanguage === "bg" ? "Добави всички базови ястия" : "Add all base dishes"}
                        </button>
                      </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                      {menuDepartmentCounts.map((department) => {
                        const selected = selectedMenuDepartment === department.value;

                        return (
                          <button
                            key={department.value}
                            type="button"
                            onClick={() => {
                              setSelectedMenuDepartment(department.value);
                              setSelectedMenuCategory("");
                            }}
                            className={`menu-spark rounded-[24px] border p-5 text-left transition ${
                              selected
                                ? "border-[#c9a56a]/45 bg-[#c9a56a]/15 shadow-xl shadow-black/20"
                                : "border-white/10 bg-white/[0.04] hover:border-[#c9a56a]/30 hover:bg-white/[0.07]"
                            }`}
                          >
                            <div className="section-kicker">
                              {department.value === "Bar"
                                ? adminLanguage === "bg" ? "Бар" : "Bar"
                                : adminLanguage === "bg" ? "Кухня" : "Kitchen"}
                            </div>
                            <div className="mt-2 text-2xl font-semibold text-[#fff4df]">
                              {department.labels[adminLanguage]}
                            </div>
                            <div className="mt-2 text-sm text-stone-400">
                              {department.count} {adminLanguage === "bg" ? "позиции" : "items"} · {department.activeCount} active
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {menuCategories.length > 0 && (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {menuCategories.map((category) => {
                          const selected = selectedCategoryData?.id === category.id;

                          return (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => selectAdminMenuCategory(category.id)}
                              className={`menu-spark rounded-[24px] border p-5 text-left transition ${
                                selected
                                  ? "border-[#c9a56a]/45 bg-[#c9a56a]/15 shadow-xl shadow-black/20"
                                  : "border-white/10 bg-white/[0.04] hover:border-[#c9a56a]/30 hover:bg-white/[0.07]"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-lg font-semibold text-[#fff4df]">
                                    {category.label}
                                  </div>
                                  <div className="mt-2 text-sm text-stone-400">
                                    {category.count} {adminLanguage === "bg" ? "ястия" : "dishes"}
                                  </div>
                                </div>
                                <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                  selected
                                    ? "bg-[#c9a56a] text-black"
                                    : "border border-white/10 bg-black/20 text-stone-300"
                                }`}>
                                  {category.activeCount}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {selectedCategoryData && (
                      <div ref={menuItemsRef} className="scroll-mt-6 rounded-[26px] border border-white/10 bg-black/20 p-4 md:p-5">
                        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                          <div>
                            <div className="section-kicker">
                              {adminLanguage === "bg" ? "Отворена секция" : "Open section"}
                            </div>
                            <h3 className="mt-2 text-2xl font-semibold text-[#fff4df]">
                              {selectedCategoryData.label}
                            </h3>
                          </div>
                          <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-stone-300">
                            {selectedCategoryData.count} {adminLanguage === "bg" ? "позиции" : "items"}
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {selectedCategoryItems.map((item) => (
                      <div key={item.id || item.Id} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                        {(item.imageUrl || item.ImageUrl) && (
                          <div className="-mx-1 mb-4 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                            <img
                              src={restaurantAssetUrl(item.imageUrl || item.ImageUrl, branding.assetBaseUrl)}
                              alt={item.nameBg || item.NameBg || ""}
                              loading="lazy"
                              className="h-40 w-full object-cover"
                            />
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-lg font-semibold">{item.nameBg || item.NameBg}</div>
                            <div className="mt-1 text-sm text-stone-400">{item.nameEn || item.NameEn || "—"}</div>
                            <div className="mt-1 text-sm text-stone-500">{item.nameRu || item.NameRu || "—"}</div>
                          </div>
                          <div className="rounded-full bg-amber-400 px-3 py-1 text-sm font-semibold text-black">
                            €{Number(item.price || item.Price || 0).toFixed(2)}
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full border border-[#c9a56a]/20 bg-[#c9a56a]/10 px-3 py-1 text-[#f2d39a]">
                            {getDepartmentLabel(item.department || item.Department, adminLanguage)}
                          </span>
                          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-stone-300">
                            {item.category || item.Category || "Main"}
                          </span>
                          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-stone-300">
                            {item.weight || item.Weight || "—"}
                          </span>
                          <span className={`rounded-full border px-3 py-1 ${
                            (item.isActive ?? item.IsActive ?? true)
                              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                              : "border-red-400/25 bg-red-400/10 text-red-200"
                          }`}>
                            {(item.isActive ?? item.IsActive ?? true) ? "Active" : "Hidden"}
                          </span>
                        </div>

                        <p className="mt-4 text-sm leading-6 text-stone-300">
                          {item.descriptionBg || item.DescriptionBg || "—"}
                        </p>
                        <p className="mt-3 text-sm leading-6 text-stone-500">
                          {item.descriptionEn || item.DescriptionEn || "—"}
                        </p>
                        <p className="mt-3 text-sm leading-6 text-stone-500">
                          {item.descriptionRu || item.DescriptionRu || "—"}
                        </p>

                        <div className="mt-5 flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const department = normalizeDepartment(item.department || item.Department);
                              setSelectedMenuDepartment(department);
                              setEditingMenuId(item.id || item.Id);
                              setMenuForm({
                                nameBg: item.nameBg || item.NameBg || "",
                                nameEn: item.nameEn || item.NameEn || "",
                                nameRu: item.nameRu || item.NameRu || "",
                                descriptionBg: item.descriptionBg || item.DescriptionBg || "",
                                descriptionEn: item.descriptionEn || item.DescriptionEn || "",
                                descriptionRu: item.descriptionRu || item.DescriptionRu || "",
                                imageUrl: item.imageUrl || item.ImageUrl || "",
                                weight: item.weight || item.Weight || "",
                                price: item.price || item.Price || "",
                                department,
                                category: item.category || item.Category || "Main",
                                isActive: item.isActive ?? item.IsActive ?? true,
                                notifySubscribers: false,
                              });
                              setMenuMode("form");
                            }}
                            className="ghost-button rounded-xl px-4 py-2 text-sm"
                          >
                            {a.menu.edit}
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteMenuItem(item.id || item.Id)}
                            className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white"
                          >
                            {a.menu.delete}
                          </button>
                        </div>
                      </div>
                    ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Panel>
            )}

            {activeTab === "events" && (
              <Panel
                title={a.events.title}
                subtitle={a.events.subtitle}
                right={
                  <div className="flex rounded-full border border-white/10 bg-black/20 p-1">
                    {[
                      ["list", a.events.list],
                      ["form", editingEventId ? a.events.edit : a.events.add],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          if (key === "form" && eventMode !== "form") {
                            setEditingEventId(null);
                            setEventForm(emptyEventItem);
                          }
                          setEventMode(key);
                        }}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                          eventMode === key ? "luxury-button" : "text-white/70 hover:text-white"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                }
              >
                {eventMode === "form" ? (
                  <form onSubmit={saveEventItem} className="space-y-5">
                    <div className="rounded-[26px] border border-white/10 bg-black/20 p-5 md:p-6">
                      <div className="mb-5">
                        <div className="section-kicker">
                          {editingEventId
                            ? adminLanguage === "bg" ? "Редакция на събитие" : "Edit event"
                            : adminLanguage === "bg" ? "Ново събитие" : "New event"}
                        </div>
                        <h3 className="mt-2 text-2xl font-semibold text-[#fff4df]">
                          {editingEventId ? a.events.editTitle : a.events.addTitle}
                        </h3>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm text-stone-400">{a.events.titleBg}</label>
                          <input name="event.titleBg"
                            value={eventForm.titleBg}
                            onChange={(e) => setEventForm((prev) => ({ ...prev, titleBg: e.target.value }))}
                            required
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm text-stone-400">{a.events.titleEn}</label>
                          <input name="event.titleEn"
                            value={eventForm.titleEn}
                            onChange={(e) => setEventForm((prev) => ({ ...prev, titleEn: e.target.value }))}
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="mb-2 block text-sm text-stone-400">{a.events.badge}</label>
                          <input name="event.badge"
                            value={eventForm.badge}
                            onChange={(e) => setEventForm((prev) => ({ ...prev, badge: e.target.value }))}
                            placeholder={adminLanguage === "bg" ? "напр. 14.02 GIVEAWAY" : "e.g. 14.02 GIVEAWAY"}
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="mb-2 block text-sm text-stone-400">{a.events.activeUntil}</label>
                          <input name="event.activeUntilLocal"
                            type="datetime-local"
                            value={eventForm.activeUntilLocal}
                            onChange={(e) => setEventForm((prev) => ({ ...prev, activeUntilLocal: e.target.value }))}
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                          />
                          <p className="mt-2 text-xs leading-5 text-stone-500">{a.events.activeUntilHelp}</p>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm text-stone-400">{a.events.textBg}</label>
                          <textarea name="event.textBg"
                            value={eventForm.textBg}
                            onChange={(e) => setEventForm((prev) => ({ ...prev, textBg: e.target.value }))}
                            rows={7}
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm text-stone-400">{a.events.textEn}</label>
                          <textarea name="event.textEn"
                            value={eventForm.textEn}
                            onChange={(e) => setEventForm((prev) => ({ ...prev, textEn: e.target.value }))}
                            rows={7}
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-5 md:p-6">
                      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div>
                          <div className="section-kicker">{a.events.photos}</div>
                          <h4 className="mt-2 text-xl font-semibold text-[#fff4df]">
                            {adminLanguage === "bg" ? "Галерия на събитието" : "Event gallery"}
                          </h4>
                        </div>

                        <label className="ghost-button cursor-pointer rounded-2xl px-4 py-3 text-sm font-semibold">
                          <input name="event.imageUploads"
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleEventImageFileChange}
                            className="sr-only"
                          />
                          {a.events.uploadPhotos}
                        </label>
                      </div>

                      <p className="mb-4 text-sm leading-6 text-stone-500">{a.events.photoHelp}</p>

                      {(eventForm.imageUrls || []).length > 0 ? (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                          {eventForm.imageUrls.map((imageUrl, index) => (
                            <div key={`${imageUrl}-${index}`} className="overflow-hidden rounded-3xl border border-white/10 bg-black/20">
                              <img
                                src={restaurantAssetUrl(imageUrl, branding.assetBaseUrl)}
                                alt={`${eventForm.titleBg || a.events.photos} ${index + 1}`}
                                className="h-44 w-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => removeEventImage(index)}
                                className="w-full border-t border-white/10 px-4 py-3 text-sm font-semibold text-red-100 hover:bg-red-500/10"
                              >
                                {a.events.removePhoto}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-3xl border border-dashed border-white/15 bg-black/20 p-8 text-center text-sm text-stone-500">
                          {adminLanguage === "bg" ? "Качете една или няколко снимки за събитието." : "Upload one or more event photos."}
                        </div>
                      )}
                    </div>

                    <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-stone-300">
                      <input name="event.isActive"
                        type="checkbox"
                        checked={eventForm.isActive}
                        onChange={(e) => setEventForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                      />
                      {a.events.active}
                    </label>

                    <div className="flex flex-col gap-3 md:flex-row">
                      <button className="luxury-button rounded-2xl px-6 py-4 font-semibold">
                        {editingEventId ? a.events.saveEdit : a.events.saveAdd}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingEventId(null);
                          setEventForm(emptyEventItem);
                          setEventMode("list");
                        }}
                        className="ghost-button rounded-2xl px-6 py-4 font-semibold"
                      >
                        {a.events.cancelEdit}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-5">
                    {eventItems.length === 0 && (
                      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-stone-400">
                        {a.events.empty}
                      </div>
                    )}

                    <div className="grid gap-5 lg:grid-cols-2">
                      {eventItems.map((item) => {
                        const id = getValue(item, "id");
                        const photos = getValue(item, "imageUrls") || [];
                        const title = getValue(item, "titleBg") || getValue(item, "titleEn") || "Event";
                        const subtitle = getValue(item, "textBg") || getValue(item, "textEn") || "";
                        const active = getValue(item, "isActive") ?? true;
                        const activeUntilUtc = getValue(item, "activeUntilUtc");
                        const isExpired = activeUntilUtc ? new Date(activeUntilUtc).getTime() <= Date.now() : false;
                        const activeUntilLabel = activeUntilUtc
                          ? new Date(activeUntilUtc).toLocaleString(adminLanguage === "bg" ? "bg-BG" : "en-US", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : "";

                        return (
                          <div key={id} className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04]">
                            <div className="grid gap-0 md:grid-cols-[220px_1fr]">
                              <div className="relative min-h-[210px] bg-black/25">
                                {photos[0] ? (
                                  <img
                                    src={restaurantAssetUrl(photos[0], branding.assetBaseUrl)}
                                    alt={title}
                                    loading="lazy"
                                    className="absolute inset-0 h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-[0.35em] text-[#f2d39a]">
                                    {isCasaTenant ? "Casa" : branding.name}
                                  </div>
                                )}
                                <div className="absolute left-4 top-4 rounded-full border border-white/10 bg-black/55 px-3 py-1 text-xs font-semibold text-white">
                                  {photos.length} {adminLanguage === "bg" ? "снимки" : "photos"}
                                </div>
                              </div>

                              <div className="p-5">
                                <div className="mb-4 flex flex-wrap items-center gap-2">
                                  {getValue(item, "badge") && (
                                    <span className="rounded-full border border-[#c9a56a]/30 bg-[#c9a56a]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#f2d39a]">
                                      {getValue(item, "badge")}
                                    </span>
                                  )}
                                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                                    active && !isExpired
                                      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                                      : "border-red-400/25 bg-red-400/10 text-red-200"
                                  }`}>
                                    {isExpired
                                      ? adminLanguage === "bg" ? "Изтекло" : "Expired"
                                      : active ? (adminLanguage === "bg" ? "Активно" : "Active") : (adminLanguage === "bg" ? "Скрито" : "Hidden")}
                                  </span>
                                </div>

                                <h3 className="text-xl font-semibold text-[#fff4df]">{title}</h3>
                                {activeUntilLabel && (
                                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#f2d39a]/75">
                                    {adminLanguage === "bg" ? "Активно до " : "Active until "}
                                    {activeUntilLabel}
                                  </p>
                                )}
                                <p className="mt-3 line-clamp-3 text-sm leading-6 text-stone-400">
                                  {subtitle || "—"}
                                </p>

                                <div className="mt-5 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => startEditingEventItem(item)}
                                    className="ghost-button rounded-xl px-4 py-2 text-sm"
                                  >
                                    {a.events.edit}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => deleteEventItem(id)}
                                    className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white"
                                  >
                                    {a.events.delete}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Panel>
            )}

            {activeTab === "layout" && (
              <div>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={reloadTableLayout} disabled={layoutSync.busy} className="ghost-button rounded-full px-4 py-2 text-sm disabled:opacity-40">
                    {adminLocalText(adminLanguage, "Зареди актуалната карта", "Reload current map", "Загрузить актуальную карту")}
                  </button>
                  {layoutSync.requiresReload && <p role="alert" className="text-sm text-amber-100">
                    {adminLocalText(adminLanguage, "Черновата е запазена. Заредете актуалната карта преди нов запис.", "Draft retained. Reload the current map before saving again.", "Черновик сохранён. Загрузите актуальную карту перед повторным сохранением.")}
                  </p>}
                </div>
                <fieldset disabled={layoutSync.busy || !layoutSync.loaded} className="min-w-0 border-0 p-0" aria-busy={layoutSync.busy}>
              {/* Casa's public client still exposes its three legacy areas.
                  Enable hall editing there when that client adopts floor-plan. */}
              {layoutSync.plan && !isCasaTenant && <FloorPlanZonesEditor
                plan={layoutSync.plan}
                language={adminLanguage}
                selectedArea={layoutArea}
                onSelect={setLayoutArea}
                onChange={layoutSession.updatePlan}
              />}
              <TableLayoutEditor
                zones={layoutZones}
                language={adminLanguage}
                text={a.layout}
                layout={tableLayout}
                selectedArea={layoutArea}
                mapViewMode={adminMapViewMode}
                onMapViewModeChange={changeAdminMapViewMode}
                onAreaChange={setLayoutArea}
                onUpdate={updateTableLayoutItem}
                onAdd={addTableLayoutItem}
                onRemove={removeTableLayoutItem}
                onSave={saveTableLayout}
                saveDisabled={layoutSync.requiresReload}
              />
                </fieldset>
              </div>
            )}

            {activeTab === "blacklist" && (
              <Panel
                title="Blacklist"
                subtitle={adminLocalText(
                  adminLanguage,
                  "No-show клиенти и проблемни резервации.",
                  "No-show guests and problematic reservations.",
                  "No-show гости и проблемные резервации."
                )}
                right={
                  <div className="flex rounded-full border border-white/10 bg-black/20 p-1">
                    {[
                      ["list", adminLocalText(adminLanguage, "Списък", "List", "Список")],
                      ["form", adminLocalText(adminLanguage, "Добави ръчно", "Add manually", "Добавить вручную")],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setBlacklistMode(key)}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                          blacklistMode === key ? "luxury-button" : "text-white/70 hover:text-white"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                }
              >
                {blacklistMode === "form" ? (
                  <form onSubmit={saveBlacklistEntry} className="grid gap-4 md:grid-cols-3">
                    {[
                      ["guestName", adminLocalText(adminLanguage, "Име", "Guest name", "Имя гостя")],
                      ["phone", adminLocalText(adminLanguage, "Телефон", "Phone", "Телефон")],
                      ["email", "Email"],
                      ["reason", adminLocalText(adminLanguage, "Причина", "Reason", "Причина")],
                    ].map(([key, label]) => (
                      <div key={key}>
                        <label className="mb-2 block text-sm text-stone-400">{label}</label>
                        <input name={`blacklist.${key}`}
                          value={blacklistForm[key]}
                          onChange={(e) =>
                            setBlacklistForm((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                          required={["guestName", "phone", "reason"].includes(key)}
                          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                        />
                      </div>
                    ))}

                    <div className="md:col-span-3">
                      <label className="mb-2 block text-sm text-stone-400">
                        {adminLocalText(adminLanguage, "Бележки", "Notes", "Заметки")}
                      </label>
                      <textarea name="blacklist.notes"
                        value={blacklistForm.notes}
                        onChange={(e) =>
                          setBlacklistForm((prev) => ({
                            ...prev,
                            notes: e.target.value,
                          }))
                        }
                        rows={4}
                        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                      />
                    </div>

                    <div className="flex flex-col gap-3 md:col-span-3 md:flex-row">
                      <button className="rounded-2xl bg-yellow-400 px-6 py-4 font-semibold text-black">
                        {adminLocalText(adminLanguage, "Добави в blacklist", "Add to blacklist", "Добавить в blacklist")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setBlacklistMode("list")}
                        className="ghost-button rounded-2xl px-6 py-4 font-semibold"
                      >
                        {adminLocalText(adminLanguage, "Назад към списъка", "Back to list", "Назад к списку")}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4">
                    {blacklist.length === 0 && (
                      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-stone-400">
                        {adminLocalText(adminLanguage, "Blacklist е празен.", "Blacklist is empty.", "Blacklist пуст.")}
                      </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {blacklist.map((item) => (
                        <div key={item.id || item.Id} className="rounded-3xl border border-yellow-400/20 bg-yellow-400/10 p-5">
                          <div className="font-semibold">{item.guestName || item.GuestName || "—"}</div>
                          <div className="mt-2 text-sm text-yellow-100/80">{item.phone || item.Phone}</div>
                          <div className="mt-1 text-sm text-yellow-100/80">{item.email || item.Email || "—"}</div>
                          <div className="mt-4 rounded-2xl border border-yellow-300/15 bg-black/15 p-3 text-sm">
                            {item.reason || item.Reason}
                          </div>
                          <div className="mt-2 text-sm text-yellow-100/60">{item.notes || item.Notes}</div>

                          <button
                            type="button"
                            onClick={() => deleteBlacklistEntry(item.id || item.Id)}
                            className="mt-5 rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Panel>
            )}

            {activeTab === "reports" && (
              <Panel
                title={adminLanguage === "bg" ? "Отчети" : "Reports"}
                subtitle={
                  adminLanguage === "bg"
                    ? "Бърз оперативен отчет за резервации, онлайн поръчки и гости."
                    : "Quick operating report for reservations, online orders, and guests."
                }
                right={
                  <div className="min-w-[220px]">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
                      {adminLocalText(adminLanguage, "Период на отчета", "Report period", "Период отчёта")}
                    </label>
                    <select name="reportsPeriod"
                      value={reportsPeriod}
                      onChange={(event) => setReportsPeriod(event.target.value)}
                      className="min-h-[46px] w-full rounded-2xl border border-[#c9a56a]/25 bg-black/25 px-4 py-3 text-sm font-semibold text-[#fff4df] outline-none focus:border-[#f2d39a]/60"
                    >
                      <option value="all">
                        {adminLocalText(adminLanguage, "Общо за всички периоди", "All time", "За всё время")}
                      </option>
                      {reportMonthOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                }
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  {reportMetrics.map((metric) => (
                    <div key={metric.label} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                      <div className="text-xs uppercase tracking-[0.22em] text-[#f2d39a]/70">{metric.label}</div>
                      <div className="mt-3 text-4xl font-semibold text-[#fff4df]">{metric.value}</div>
                      <div className="mt-2 text-sm text-white/45">{metric.detail}</div>
                    </div>
                  ))}
                </div>

                <div className={`mt-6 grid gap-4 ${isProVersion ? "xl:grid-cols-2" : ""}`}>
                  <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                    <div className="section-kicker">
                      {adminLanguage === "bg" ? "Резервации по източник" : "Reservations by source"}
                    </div>
                    <div className="mt-4 space-y-3 text-sm text-white/70">
                      <div className="flex justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <span>{adminLanguage === "bg" ? "През сайта" : "Website"}</span>
                        <strong className="text-[#fff4df]">{siteReservations.length}</strong>
                      </div>
                      <div className="flex justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <span>{adminLanguage === "bg" ? "От админ" : "Admin created"}</span>
                        <strong className="text-[#fff4df]">{adminReservations.length}</strong>
                      </div>
                      <div className="flex justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <span>{adminLanguage === "bg" ? "Без резервация" : "Walk-ins"}</span>
                        <strong className="text-[#fff4df]">{walkInReservations.length}</strong>
                      </div>
                    </div>
                  </div>

                  {isProVersion && (
                    <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                      <div className="section-kicker">
                        {adminLanguage === "bg" ? "Оборот по сервитьори" : "Revenue by waiter"}
                      </div>
                      <div className="mt-4 space-y-3">
                        {waiterReportRows.map((row) => (
                          <div key={row.key} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <span className="min-w-0 truncate font-semibold text-[#fff4df]">{row.waiterName}</span>
                              <span className="shrink-0 text-[#f2d39a]">{formatEuroAmount(row.revenue)}</span>
                            </div>
                            <div className="mt-1 text-xs text-white/45">
                              {row.orders} {adminLanguage === "bg" ? "поръчки" : "orders"} · {row.tableCount} {adminLanguage === "bg" ? "маси" : "tables"}
                            </div>
                          </div>
                        ))}
                        {waiterReportRows.length === 0 && (
                          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/45">
                            {adminLanguage === "bg" ? "Няма поръчки за периода." : "No orders for the period."}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {isProVersion && (
                  <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-5">
                    <div className="section-kicker">
                      {adminLanguage === "bg" ? "Продадени артикули" : "Sold items"}
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {soldItemRows.slice(0, 12).map((row) => (
                        <div key={row.name} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate font-semibold text-[#fff4df]">{row.name}</span>
                            <span className="shrink-0 rounded-full border border-[#f2d39a]/20 bg-[#c9a56a]/10 px-2.5 py-1 text-xs font-semibold text-[#f2d39a]">
                              {row.quantity}x
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-white/45">{formatEuroAmount(row.revenue)}</div>
                        </div>
                      ))}
                      {soldItemRows.length === 0 && (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/45">
                          {adminLanguage === "bg" ? "Няма продадени артикули за периода." : "No sold items for the period."}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Panel>
            )}

            {activeTab === "inventory" && isProVersion && !isWaiterRole && !isProductionRole && (
              <InventoryModule
                adminLanguage={adminLanguage}
                adminFetch={adminFetch}
                menuItems={menuItems}
                loadMenuItems={loadMenuItems}
              />
            )}

            {canUseMaintenance && (activeTab === "maintenance" || (activeTab === "dev" && isDeveloperRole && developerSection === "maintenance")) && (
              <>
                <MaintenanceModule
                  adminLanguage={adminLanguage}
                  adminFetch={adminFetch}
                  loadReservations={loadReservations}
                  loadDiningOrders={loadDiningOrders}
                  isProVersion={isProVersion}
                />
                {activeTab === "dev" && isDeveloperRole && (
                  <DeveloperDataTools language={adminLanguage} onClearData={clearReservationsAndOrders} />
                )}
              </>
            )}

            {activeTab === "feedback" && canViewFeedback && (
              <Panel
                title={adminLocalText(adminLanguage, "Обратна връзка", "Customer feedback", "Обратная связь")}
                subtitle={
                  adminLocalText(
                    adminLanguage,
                    "Кратки клиентски впечатления за атмосфера, храна, обслужване и дигиталната система.",
                    "Guest impressions about atmosphere, food, service, and the digital system.",
                    "Короткие впечатления гостей об атмосфере, еде, обслуживании и цифровой системе."
                  )
                }
                right={
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input name="feedbackSearch"
                      value={feedbackSearch}
                      onChange={(event) => setFeedbackSearch(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") loadFeedbackEntries();
                      }}
                      placeholder={adminLocalText(adminLanguage, "Промокод, име, email...", "Promo code, name, email...", "Промокод, имя, email...")}
                      className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-white/35 focus:border-amber-300"
                    />
                    <button type="button" onClick={loadFeedbackEntries} className="ghost-button rounded-2xl px-4 py-3 text-sm font-semibold">
                      {adminLocalText(adminLanguage, "Търси / обнови", "Search / refresh", "Искать / обновить")}
                    </button>
                  </div>
                }
              >
                <section className="mb-6 rounded-3xl border border-white/10 bg-black/20 p-4 md:p-5" aria-labelledby="feedback-email-history">
                  <h3 id="feedback-email-history" className="text-lg font-semibold text-[#fff4df]">{adminLocalText(adminLanguage, "Писма след посещение", "Post-visit emails", "Письма после посещения")}</h3>
                  <p className="mt-1 text-sm text-white/55">{adminLocalText(adminLanguage, "История от активирането на проследяването. „Изпратено“ означава, че Resend е приел писмото.", "History since tracking was enabled. Sent means Resend accepted the email.", "История с момента включения отслеживания. «Отправлено» означает, что Resend принял письмо.")}</p>
                  <form onSubmit={sendFeedbackTest} className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-white/65">{adminLocalText(adminLanguage, "Тестов email", "Test email", "Email для теста")}
                      <input name="feedbackTestEmail" type="email" required value={feedbackTestEmail} onChange={(event) => setFeedbackTestEmail(event.target.value)} className="min-h-[44px] rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white" />
                    </label>
                    <button disabled={feedbackTestBusy} type="submit" className="ghost-button min-h-[44px] self-end rounded-2xl px-4 py-3 text-sm disabled:opacity-50">{feedbackTestBusy ? "…" : adminLocalText(adminLanguage, "Изпрати тестово писмо", "Send test email", "Отправить тестовое письмо")}</button>
                  </form>
                  <div className="mt-4 max-h-[420px] overflow-auto">
                    {feedbackEmails.length === 0 ? <p className="text-sm text-white/55">{adminLocalText(adminLanguage, "Все още няма писма в историята.", "No emails recorded yet.", "В истории пока нет писем.")}</p> : <div className="grid gap-3">{feedbackEmails.map((item) => <article key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><div className="font-semibold text-white">{item.guestName}</div><div className="break-all text-white/60">{item.email}</div></div><span className={item.sentAtUtc ? "text-emerald-200" : "text-amber-200"}>{item.sentAtUtc ? adminLocalText(adminLanguage, "Изпратено", "Sent", "Отправлено") : adminLocalText(adminLanguage, "В опашката", "Queued", "В очереди")}</span></div>
                      <div className="mt-2 text-xs text-white/55">#{item.reservationId} · {item.isFirstVisitInvitation ? adminLocalText(adminLanguage, "Първо посещение · анкета", "First visit · survey", "Первый визит · анкета") : adminLocalText(adminLanguage, "Повторно посещение", "Return visit", "Повторный визит")} · {new Date(item.sentAtUtc || item.createdAtUtc).toLocaleString(adminLanguage === "en" ? "en-GB" : adminLanguage === "ru" ? "ru-RU" : "bg-BG", { timeZone: "Europe/Sofia" })}</div>
                      {!item.sentAtUtc && <div className="mt-2 text-xs text-amber-200/80">{adminLocalText(adminLanguage, "Опити", "Attempts", "Попыток")}: {item.attempts} · {adminLocalText(adminLanguage, "Следващ опит", "Next attempt", "Следующая попытка")}: {new Date(item.nextAttemptAtUtc).toLocaleString(adminLanguage === "ru" ? "ru-RU" : "bg-BG", { timeZone: "Europe/Sofia" })}</div>}
                    </article>)}</div>}
                  </div>
                </section>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-3xl border border-[#c9a56a]/20 bg-[#c9a56a]/10 p-5">
                    <div className="section-kicker">{adminLocalText(adminLanguage, "Получени", "Received", "Получено")}</div>
                    <div className="mt-3 text-4xl font-semibold text-[#fff4df]">{feedbackEntries.length}</div>
                  </div>
                  <div className="rounded-3xl border border-emerald-300/20 bg-emerald-500/10 p-5">
                    <div className="section-kicker">{adminLocalText(adminLanguage, "Средна оценка", "Average rating", "Средняя оценка")}</div>
                    <div className="mt-3 text-4xl font-semibold text-emerald-100">
                      {feedbackEntries.length
                        ? (
                            feedbackEntries.reduce((total, item) => {
                              const ratings = [
                                item.atmosphereRating,
                                item.foodRating,
                                item.serviceRating,
                                item.onlineReservationRating,
                                item.softwareRating,
                              ].map(Number).filter(Boolean);
                              return total + (ratings.reduce((sum, value) => sum + value, 0) / Math.max(1, ratings.length));
                            }, 0) / feedbackEntries.length
                          ).toFixed(1)
                        : "—"}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                    <div className="section-kicker">Google</div>
                    <div className="mt-3 text-4xl font-semibold text-[#fff4df]">
                      {feedbackEntries.filter((item) => item.googleReviewClicked).length}
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 xl:grid-cols-2">
                  {feedbackEntries.map((item) => {
                    const ratings = [
                      ["Атмосфера", item.atmosphereRating],
                      ["Храна", item.foodRating],
                      ["Обслужване", item.serviceRating],
                      ["Онлайн", item.onlineReservationRating],
                      ["Карта", item.tableMapRating],
                      ["Полезност", item.tableMapUsefulnessRating],
                      ["Софтуер", item.softwareRating],
                    ];
                    const analytics = [
                      ["Процес резервация", item.onlineReservationEase],
                      ["Пак избор на маса", item.tableMapReuseIntent],
                      ["Важност маса", item.tableChoiceImportance],
                      ["Най-полезна функция", item.mostUsefulDigitalFeature],
                      ["Повторно посещение", item.returnLikelihood ? `${item.returnLikelihood}/10` : ""],
                      ["Препоръка", item.recommendLikelihood || item.recommendLikelihood === 0 ? `${item.recommendLikelihood}/10` : ""],
                    ].filter(([, value]) => String(value ?? "").trim());
                    const texts = [
                      ["Атмосфера - приятно", item.atmosphereImpression],
                      ["Атмосфера - промяна", item.atmosphereChange],
                      ["Храна - приятно", item.foodImpression],
                      ["Храна - промяна", item.foodChange],
                      ["Обслужване - приятно", item.serviceImpression],
                      ["Обслужване - промяна", item.serviceChange],
                      ["Онлайн резервация", item.onlineReservationFeedback],
                      ["Интерактивна карта", item.tableMapFavoriteFeature],
                      ["Софтуер", item.softwareFeedback],
                      ["Отношение към клиенти", item.clientCareFeedback],
                      ["Малки детайли", item.smallDetailsFeedback],
                      ["Едно нещо за промяна", item.oneThingToChange],
                    ].filter(([, value]) => String(value || "").trim());

                    return (
                      <div key={item.id} className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-lg font-semibold text-[#fff4df]">{item.guestName || "—"}</div>
                            <div className="mt-1 text-sm text-white/45">{item.email || "—"} · #{item.reservationId || "—"}</div>
                          </div>
                          <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                            item.discountCodeUsed
                              ? "border-emerald-300/25 bg-emerald-400/12 text-emerald-100"
                              : "border-[#f2d39a]/25 bg-[#c9a56a]/12 text-[#f2d39a]"
                          }`}>
                            {item.discountCode || "5%"} {item.discountCodeUsed ? "· използван" : ""}
                          </div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                          {ratings.map(([label, rating]) => (
                            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-center">
                              <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">{label}</div>
                              <div className="mt-1 text-lg font-semibold text-[#f2d39a]">{rating || "—"}</div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {analytics.map(([label, value]) => (
                            <span key={label} className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs text-white/62">
                              <span className="text-[#f2d39a]/70">{label}:</span> {value}
                            </span>
                          ))}
                        </div>
                        <div className="mt-4 space-y-2">
                          {texts.length === 0 && (
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/45">
                              {adminLocalText(adminLanguage, "Няма текстови бележки.", "No text notes.", "Текстовых заметок нет.")}
                            </div>
                          )}
                          {texts.map(([label, value]) => (
                            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
                              <div className="text-[10px] uppercase tracking-[0.16em] text-[#f2d39a]/70">{label}</div>
                              <div className="mt-1 leading-6 text-white/70">{value}</div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 text-xs text-white/35">
                          {new Date(item.createdAtUtc).toLocaleString()}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {!item.discountCodeUsed && (
                            <button
                              type="button"
                              onClick={() => markFeedbackDiscountUsed(item.id)}
                              className="rounded-2xl border border-emerald-300/25 bg-emerald-500/12 px-4 py-2 text-xs font-semibold text-emerald-100"
                            >
                              {adminLocalText(adminLanguage, "Маркирай кода използван", "Mark code used", "Отметить код использованным")}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteFeedbackEntry(item.id)}
                            className="rounded-2xl border border-red-300/25 bg-red-500/12 px-4 py-2 text-xs font-semibold text-red-100"
                          >
                            {adminLocalText(adminLanguage, "Изтрий", "Delete", "Удалить")}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {feedbackEntries.length === 0 && (
                    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-stone-400">
                      {adminLocalText(adminLanguage, "Все още няма обратна връзка.", "No feedback yet.", "Обратной связи пока нет.")}
                    </div>
                  )}
                </div>
              </Panel>
            )}

            {activeTab === "marketing" && canManageMarketing && (
              <MarketingModule
                adminLanguage={adminLanguage}
                adminFetch={adminFetch}
              />
            )}

            {activeTab === "customers" && (
              <Panel
                title={adminLocalText(adminLanguage, "Клиенти", "Customers", "Клиенты")}
                subtitle={
                  adminLocalText(
                    adminLanguage,
                    "Контакти, посещения и рождени дни — всичко за Вашите гости.",
                    "Contacts, visits and birthdays — everything about your guests.",
                    "Контакты, посещения и дни рождения ваших гостей."
                  )
                }
                right={
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {customersMode !== "blacklist" && (
                      <button
                        type="button"
                        onClick={() => setShowManualCustomerForm((value) => !value)}
                        className="luxury-button rounded-full px-4 py-2 text-sm font-semibold"
                      >
                        {showManualCustomerForm
                          ? adminLocalText(adminLanguage, "Скрий формата", "Hide form", "Скрыть форму")
                          : adminLocalText(adminLanguage, "Добави клиент", "Add customer", "Добавить клиента")}
                      </button>
                    )}
                    <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-black/20 p-1 sm:grid-cols-4" role="group" aria-label={adminLocalText(adminLanguage, "Групи клиенти", "Customer groups", "Группы клиентов")}>
                      {[
                        ["customers", adminLocalText(adminLanguage, "Клиенти", "Customers", "Клиенты")],
                        ["website", adminLocalText(adminLanguage, "От сайта", "From website", "С сайта")],
                        ["birthdays", adminLocalText(adminLanguage, "Рождени дати", "Birthdays", "Дни рождения")],
                        ["blacklist", "Blacklist"],
                      ].map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={customersMode === key}
                          onClick={() => {
                            setCustomersMode(key);
                            setCustomerSort(key === "birthdays" ? "birthday" : "visits");
                            setExpandedCustomerKey(null);
                          }}
                          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                            customersMode === key ? "luxury-button" : "text-white/70 hover:text-white"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                }
              >
                <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center">
                  <label className="min-w-0 flex-1 text-xs font-semibold text-white/60">
                    {adminLocalText(adminLanguage, "Търсене на клиент", "Find a customer", "Найти клиента")}
                    <input name="customerSearch" type="search" value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder={adminLocalText(adminLanguage, "Име, телефон или имейл…", "Name, phone or email…", "Имя, телефон или email…")} className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-[#f2d39a]/60" />
                  </label>
                  <p className="shrink-0 text-sm text-[#f2d39a]" role="status">
                    {customersMode === "blacklist" ? searchedBlacklist.length : sortedCustomers.length} {adminLocalText(adminLanguage, "резултата", "results", "результатов")}
                  </p>
                </div>
                {customersMode === "birthdays" && (
                  <div className="mb-5 rounded-2xl border border-[#f2d39a]/25 bg-[#c9a56a]/10 p-4 text-sm leading-6 text-[#fff4df]">
                    {adminLocalText(adminLanguage, "Само гости с попълнена рождена дата. Подредете по предстоящ празник или намерете конкретен контакт.", "Guests with a saved birthday. Sort by their next birthday or find a specific contact.", "Только гости с заполненной датой рождения. Сортируйте по ближайшему празднику или найдите нужный контакт.")}
                  </div>
                )}
                {customersMode === "blacklist" ? (
                  <div className="space-y-5">
                    <div className="flex justify-end">
                      <div className="flex rounded-full border border-white/10 bg-black/20 p-1">
                        {[
                          ["list", adminLocalText(adminLanguage, "Списък", "List", "Список")],
                          ["form", adminLocalText(adminLanguage, "Добави ръчно", "Add manually", "Добавить вручную")],
                        ].map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setBlacklistMode(key)}
                            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                              blacklistMode === key ? "luxury-button" : "text-white/70 hover:text-white"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {blacklistMode === "form" ? (
                      <form onSubmit={saveBlacklistEntry} className="grid gap-4 md:grid-cols-3">
                        {[
                          ["guestName", adminLocalText(adminLanguage, "Име", "Guest name", "Имя гостя")],
                          ["phone", adminLocalText(adminLanguage, "Телефон", "Phone", "Телефон")],
                          ["email", "Email"],
                          ["reason", adminLocalText(adminLanguage, "Причина", "Reason", "Причина")],
                        ].map(([key, label]) => (
                          <div key={key}>
                            <label className="mb-2 block text-sm text-stone-400">{label}</label>
                            <input name={`customerBlacklist.${key}`}
                              value={blacklistForm[key]}
                              onChange={(e) =>
                                setBlacklistForm((prev) => ({
                                  ...prev,
                                  [key]: e.target.value,
                                }))
                              }
                              required={["guestName", "phone", "reason"].includes(key)}
                              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                            />
                          </div>
                        ))}

                        <div className="md:col-span-3">
                          <label className="mb-2 block text-sm text-stone-400">
                            {adminLocalText(adminLanguage, "Бележки", "Notes", "Заметки")}
                          </label>
                          <textarea name="customerBlacklist.notes"
                            value={blacklistForm.notes}
                            onChange={(e) =>
                              setBlacklistForm((prev) => ({
                                ...prev,
                                notes: e.target.value,
                              }))
                            }
                            rows={4}
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300"
                          />
                        </div>

                        <div className="flex flex-col gap-3 md:col-span-3 md:flex-row">
                          <button className="luxury-button rounded-2xl px-6 py-4 font-semibold">
                            {adminLocalText(adminLanguage, "Добави в blacklist", "Add to blacklist", "Добавить в blacklist")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setBlacklistMode("list")}
                            className="ghost-button rounded-2xl px-6 py-4 font-semibold"
                          >
                            {adminLocalText(adminLanguage, "Назад към списъка", "Back to list", "Назад к списку")}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="space-y-4">
                        {searchedBlacklist.length === 0 && (
                          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-stone-400">
                            {adminLocalText(adminLanguage, "Blacklist е празен.", "Blacklist is empty.", "Blacklist пуст.")}
                          </div>
                        )}

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {searchedBlacklist.map((item) => (
                            <div key={item.id || item.Id} className="rounded-3xl border border-red-300/20 bg-red-500/10 p-5">
                              <div className="font-semibold text-[#fff4df]">{item.guestName || item.GuestName || "—"}</div>
                              <div className="mt-2 text-sm text-red-100/80">{item.phone || item.Phone}</div>
                              <div className="mt-1 text-sm text-red-100/70">{item.email || item.Email || "—"}</div>
                              <div className="mt-4 rounded-2xl border border-red-300/15 bg-black/15 p-3 text-sm text-red-50/90">
                                {item.reason || item.Reason}
                              </div>
                              <div className="mt-2 text-sm text-red-100/60">{item.notes || item.Notes}</div>

                              <button
                                type="button"
                                onClick={() => deleteBlacklistEntry(item.id || item.Id)}
                                className="mt-5 rounded-xl border border-red-300/25 bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-100"
                              >
                                {adminLocalText(adminLanguage, "Премахни", "Remove", "Убрать")}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {showManualCustomerForm && (
                      <form onSubmit={saveManualCustomer} className="rounded-[28px] border border-[#c9a56a]/18 bg-[#c9a56a]/10 p-4 md:p-5">
                        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                          <div>
                            <div className="section-kicker">
                              {adminLocalText(adminLanguage, "Ръчен клиент", "Manual customer", "Ручной клиент")}
                            </div>
                            <p className="mt-2 text-sm text-white/50">
                              {adminLocalText(
                                adminLanguage,
                                "Добави контакт без резервация. Ако телефонът или имейлът вече съществува, профилът ще се обнови.",
                                "Add a contact without a reservation. Existing phone or email will update the profile.",
                                "Добавьте контакт без резервации. Если телефон или email уже существует, профиль обновится."
                              )}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setManualCustomerForm(emptyManualCustomer);
                              setShowManualCustomerForm(false);
                            }}
                            className="ghost-button rounded-full px-4 py-2 text-sm font-semibold"
                          >
                            {adminLocalText(adminLanguage, "Откажи", "Cancel", "Отмена")}
                          </button>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <label className="block text-sm text-white/60 xl:col-span-2">
                            {adminLocalText(adminLanguage, "Име", "Name", "Имя")}
                            <input name="customer.guestName"
                              value={manualCustomerForm.guestName}
                              onChange={(event) => setManualCustomerForm((prev) => ({ ...prev, guestName: event.target.value }))}
                              required
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-[#f2d39a]/50"
                            />
                          </label>
                          <label className="block text-sm text-white/60">
                            {adminLocalText(adminLanguage, "Телефон", "Phone", "Телефон")}
                            <input name="customer.phone"
                              value={manualCustomerForm.phone}
                              onChange={(event) => setManualCustomerForm((prev) => ({ ...prev, phone: event.target.value }))}
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-[#f2d39a]/50"
                            />
                          </label>
                          <label className="block text-sm text-white/60">
                            Email
                            <input name="customer.email"
                              type="email"
                              value={manualCustomerForm.email}
                              onChange={(event) => setManualCustomerForm((prev) => ({ ...prev, email: event.target.value }))}
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-[#f2d39a]/50"
                            />
                          </label>
                          <label className="block text-sm text-white/60">
                            {adminLocalText(adminLanguage, "Рожден ден", "Birthday", "День рождения")}
                            <input name="customer.birthDate"
                              type="date"
                              value={manualCustomerForm.birthDate}
                              onChange={(event) => setManualCustomerForm((prev) => ({ ...prev, birthDate: event.target.value }))}
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-[#f2d39a]/50"
                            />
                          </label>
                          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70 xl:col-span-2">
                            <input name="customer.marketingConsent"
                              type="checkbox"
                              checked={manualCustomerForm.marketingConsent}
                              onChange={(event) => setManualCustomerForm((prev) => ({ ...prev, marketingConsent: event.target.checked }))}
                            />
                            {adminLocalText(adminLanguage, "Съгласие за маркетинг имейли", "Marketing email consent", "Согласие на маркетинговые email")}
                          </label>
                          <button type="submit" className="luxury-button rounded-2xl px-5 py-3 text-sm font-semibold xl:col-span-1">
                            {adminLocalText(adminLanguage, "Запази клиент", "Save customer", "Сохранить клиента")}
                          </button>
                        </div>
                      </form>
                    )}

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-3xl border border-[#c9a56a]/18 bg-[#c9a56a]/10 p-5">
                        <div className="text-xs uppercase tracking-[0.22em] text-[#f2d39a]/70">
                          {adminLocalText(adminLanguage, "Клиенти", "Customers", "Клиенты")}
                        </div>
                        <div className="mt-2 text-3xl font-semibold text-[#fff4df]">{visibleCustomersForPeriod.length}</div>
                      </div>
                      <div className="rounded-3xl border border-emerald-300/18 bg-emerald-400/10 p-5">
                        <div className="text-xs uppercase tracking-[0.22em] text-emerald-100/70">
                          {adminLocalText(adminLanguage, "Нови клиенти", "New customers", "Новые клиенты")}
                        </div>
                        <div className="mt-2 text-3xl font-semibold text-emerald-100">{visibleNewCustomersCount}</div>
                      </div>
                      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                        <div className="text-xs uppercase tracking-[0.22em] text-stone-500">
                          {adminLocalText(adminLanguage, "Посещения", "Visits", "Посещения")}
                        </div>
                        <div className="mt-2 text-3xl font-semibold text-[#fff4df]">{totalCustomerVisits}</div>
                      </div>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-2">
                      <div className={`rounded-3xl border border-white/10 bg-black/20 p-4 ${customersMode === "birthdays" ? "hidden" : ""}`}>
                        <div className="mb-3 text-xs uppercase tracking-[0.22em] text-stone-500">
                          {adminLocalText(adminLanguage, "Период", "Period", "Период")}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {[
                            ["today", adminLocalText(adminLanguage, "Днес", "Today", "Сегодня")],
                            ["week", adminLocalText(adminLanguage, "Седмица", "Week", "Неделя")],
                            ["month", adminLocalText(adminLanguage, "Месец", "Month", "Месяц")],
                            ["all", adminLocalText(adminLanguage, "Цялото време", "All time", "Всё время")],
                          ].map(([key, label]) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setCustomerPeriod(key)}
                              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                                customerPeriod === key ? "luxury-button" : "ghost-button text-white/75"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                        <div className="mb-3 text-xs uppercase tracking-[0.22em] text-stone-500">
                          {adminLocalText(adminLanguage, "Сортиране", "Sort", "Сортировка")}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {[
                            ...(customersMode === "birthdays" ? [["birthday", adminLocalText(adminLanguage, "Предстоящи", "Upcoming birthdays", "Ближайшие")]] : []),
                            ["visits", adminLocalText(adminLanguage, "Най-чести", "Top visits", "Чаще всего")],
                            ["new", adminLocalText(adminLanguage, "Най-нови", "Newest", "Новые")],
                            ["recent", adminLocalText(adminLanguage, "Последно дошли", "Recent", "Недавние")],
                            ["name", adminLocalText(adminLanguage, "Име", "Name", "Имя")],
                          ].map(([key, label]) => (
                            <button
                              key={key}
                              type="button"
                              aria-pressed={customerSort === key}
                              onClick={() => setCustomerSort(key)}
                              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                                customerSort === key ? "border border-[#f2d39a]/35 bg-[#c9a56a]/18 text-[#f2d39a]" : "border border-white/10 bg-white/[0.03] text-white/65"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {sortedCustomers.length === 0 && (
                      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-stone-400">
                        {adminLocalText(adminLanguage, "Няма клиенти с тези филтри. Променете търсенето или периода.", "No matching customers. Change your search or period.", "Нет подходящих клиентов. Измените поиск или период.")}
                      </div>
                    )}

                    {sortedCustomers.map((c, index) => {
                      const expanded = expandedCustomerKey === c.key;
                      const birthdayEmailState = birthdayEmailStates[c.profileId];
                      const birthdayEmailBusy = birthdayEmailState?.status === "sending";
                      const birthdayEmailSentAt = formatBirthdayEmailSentAt(c.birthdayEmailLastSentAtUtc, adminLanguage);
                      const visitsLabel = adminLocalText(adminLanguage, "посещения", "visits", "посещений");
                      const customerReservationsToShow = c.periodReservations?.length ? c.periodReservations : c.reservations;

                      return (
                        <div key={c.key} className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 md:p-5">
                          <button
                            type="button"
                            aria-expanded={expanded}
                            onClick={() => setExpandedCustomerKey(expanded ? null : c.key)}
                            className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#c9a56a]/25 bg-[#c9a56a]/12 text-sm font-bold text-[#f2d39a]">
                                #{index + 1}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-lg font-semibold text-[#fff4df]">{c.guestName}</div>
                                <div className="mt-1 text-sm text-stone-400">
                                  {c.count === 0
                                    ? adminLocalText(adminLanguage, "ръчен контакт", "manual contact", "ручной контакт")
                                    : `${c.periodCount} ${visitsLabel}`}
                                  {customerPeriod !== "all" ? ` · ${c.count} ${adminLocalText(adminLanguage, "общо", "total", "всего")}` : ""}
                                </div>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {c.isRegularCustomer && (
                                <span className="hidden rounded-full bg-emerald-400/15 px-3 py-1 text-xs text-emerald-300 sm:inline-flex">
                                  {adminLocalText(adminLanguage, "Редовен", "Regular", "Постоянный")}
                                </span>
                              )}
                              {c.isBlacklisted && (
                                <span className="rounded-full bg-red-400/15 px-3 py-1 text-xs text-red-300">
                                  Blacklist
                                </span>
                              )}
                              <span className="ghost-button rounded-full px-3 py-1 text-xs">
                                {expanded
                                  ? adminLocalText(adminLanguage, "Скрий", "Hide", "Скрыть")
                                  : adminLocalText(adminLanguage, "Детайли", "Details", "Детали")}
                              </span>
                            </div>
                          </button>

                          {getCustomerBirthDate(c) && (
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                              <span className="rounded-full border border-[#f2d39a]/25 bg-[#c9a56a]/10 px-3 py-1.5 text-[#f2d39a]">
                                {adminLocalText(adminLanguage, "Рожден ден", "Birthday", "День рождения")}: {formatBirthday(c.birthDate, adminLanguage)}
                              </span>
                              {customersMode === "birthdays" && Number.isFinite(daysUntilBirthday(c.birthDate, customerToday)) && (
                                <span className="text-xs text-white/60">
                                  {daysUntilBirthday(c.birthDate, customerToday) === 0
                                    ? adminLocalText(adminLanguage, "Днес!", "Today!", "Сегодня!")
                                    : `${daysUntilBirthday(c.birthDate, customerToday)} ${adminLocalText(adminLanguage, "дни до празника", "days to go", "дней до праздника")}`}
                                </span>
                              )}
                            </div>
                          )}
                          {customersMode === "birthdays" && (
                            <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0 space-y-1 text-xs text-white/60">
                                <p className="break-all">{c.email || adminLocalText(adminLanguage, "Няма добавен имейл", "No email saved", "Email не указан")}</p>
                                {!c.marketingConsent && (
                                  <p className="text-amber-200">{adminLocalText(adminLanguage, "Няма съгласие за маркетингови имейли", "No marketing email consent", "Нет согласия на маркетинговые письма")}</p>
                                )}
                                <p>{adminLocalText(adminLanguage, "Последно изпратен", "Last sent", "Последняя отправка")}: {birthdayEmailSentAt || adminLocalText(adminLanguage, "Все още не е изпращан", "Not sent yet", "Ещё не отправлялось")}</p>
                                {birthdayEmailState?.message && (
                                  <p role={birthdayEmailState.status === "error" ? "alert" : "status"} className={birthdayEmailState.status === "error" ? "text-red-200" : "text-emerald-200"}>
                                    {birthdayEmailState.message}
                                  </p>
                                )}
                              </div>
                              {canManageMarketing && (
                                <button
                                  type="button"
                                  onClick={() => sendCustomerBirthdayEmail(c)}
                                  disabled={birthdayEmailBusy || !c.profileId || !c.marketingConsent || !String(c.email || "").trim()}
                                  aria-busy={birthdayEmailBusy}
                                  className="luxury-button shrink-0 rounded-xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 sm:max-w-[240px]"
                                >
                                  {birthdayEmailBusy
                                    ? adminLocalText(adminLanguage, "Изпращане…", "Sending…", "Отправка…")
                                    : adminLocalText(adminLanguage, "Изпрати имейл за рожден ден", "Send birthday email", "Отправить письмо ко дню рождения")}
                                </button>
                              )}
                            </div>
                          )}
                          {expanded && (
                            <div className="mt-5 grid gap-4 border-t border-white/10 pt-5 lg:grid-cols-[0.8fr_1.2fr]">
                              <div className="space-y-3 text-sm text-stone-300">
                                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                  <div className="text-xs uppercase tracking-[0.2em] text-stone-500">
                                    {adminLocalText(adminLanguage, "Контакт", "Contact", "Контакт")}
                                  </div>
                                  <div className="mt-3">{c.phone || "—"}</div>
                                  <div className="mt-2">{c.email || "—"}</div>
                                  <div className="mt-2 text-stone-500">
                                    {adminLocalText(adminLanguage, "Последна резервация", "Last reservation", "Последняя резервация")}: {c.lastReservation || "—"}
                                  </div>
                                  <div className="mt-2 text-stone-500">
                                    {adminLocalText(adminLanguage, "Първа резервация", "First reservation", "Первая резервация")}: {c.firstReservation || "—"}
                                  </div>
                                </div>
                                <div className="grid gap-2">
                                  <button
                                    type="button"
                                    onClick={() => addCustomerToBlacklist(c)}
                                    disabled={c.isBlacklisted}
                                    className="w-full rounded-2xl border border-red-300/25 bg-red-500/12 px-4 py-3 text-sm font-semibold text-red-100 disabled:opacity-40"
                                  >
                                    {c.isBlacklisted
                                      ? adminLocalText(adminLanguage, "В blacklist", "Blacklisted", "В blacklist")
                                      : adminLocalText(adminLanguage, "Добави в blacklist", "Add to blacklist", "Добавить в blacklist")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteCustomerProfile(c)}
                                    className="w-full rounded-2xl border border-red-300/35 bg-red-500/20 px-4 py-3 text-sm font-semibold text-red-50"
                                  >
                                    {adminLocalText(adminLanguage, "Изтрий клиент", "Delete customer", "Удалить клиента")}
                                  </button>
                                </div>
                              </div>

                              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <div className="text-xs uppercase tracking-[0.2em] text-stone-500">
                                  {adminLocalText(adminLanguage, "Посещения", "Visits", "Посещения")}
                                </div>
                                <div className="mt-3 space-y-2">
                                  {customerReservationsToShow.map((reservation) => {
                                    const reservationOrders = ordersByReservationId.get(Number(reservation.id)) || [];
                                    const firstOrder = reservationOrders[0];

                                    return (
                                      <div key={reservation.id} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                          <span className="text-[#fff4df]">{reservation.reservedDate} · {reservation.reservedTime}</span>
                                          <span className="ml-2 text-stone-400">{reservation.tableIds.join(", ")}</span>
                                        </div>
                                        {firstOrder && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setExpandedOrderId(firstOrder.id);
                                              setActiveTab("orders");
                                            }}
                                            className="rounded-full border border-[#c9a56a]/25 bg-[#c9a56a]/12 px-3 py-1 text-xs font-semibold text-[#f2d39a] transition hover:bg-[#c9a56a]/20"
                                          >
                                            {adminLocalText(adminLanguage, "Виж поръчката", "View order", "Посмотреть заказ")} · {formatEuroAmount(firstOrder.totalPrice)}
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {customerReservationsToShow.length === 0 && (
                                    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-stone-400">
                                      {adminLocalText(adminLanguage, "Няма заредени посещения.", "No loaded visits.", "Нет загруженных посещений.")}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            )}

            {canManageAdmins && (activeTab === "admins" || (activeTab === "dev" && isDeveloperRole && developerSection === "access")) && (
              <Panel
                title={adminLanguage === "bg" ? "Админи и audit" : "Admins and audit"}
                subtitle={adminLanguage === "bg" ? "Управление на достъпа, бърз вход и история на важните промени." : "Access management, quick login, and history of important changes."}
                right={
                  <button
                    type="button"
                    onClick={enableQuickLogin}
                    className="luxury-button rounded-2xl px-5 py-3 text-sm font-semibold"
                  >
                    Face ID / Touch ID
                  </button>
                }
              >
                {currentAdminRole === "Owner" && <TenantBrandingSettings key={JSON.stringify(branding)} adminFetch={adminFetch} />}
                <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                  <div className="space-y-4">
                    <form onSubmit={createAdminUser} className="rounded-3xl border border-white/10 bg-black/20 p-5">
                      <div className="section-kicker">{adminLanguage === "bg" ? "Нов админ" : "New admin"}</div>
                      <div className="mt-4 grid gap-3">
                        {[
                          ["name", adminLanguage === "bg" ? "Име" : "Name", "text"],
                          ["email", "Email", "email"],
                          ["password", adminLanguage === "bg" ? "Парола" : "Password", "password"],
                        ].map(([key, label, type]) => (
                          <label key={key} className="block text-sm text-white/60">
                            {label}
                            <input name={`adminCreate.${key}`}
                              type={type}
                              autoComplete={key === "password" ? "new-password" : key === "email" ? "username" : undefined}
                              value={adminUserForm[key]}
                              onChange={(event) => setAdminUserForm((prev) => ({ ...prev, [key]: event.target.value }))}
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-[#f2d39a]/50"
                            />
                          </label>
                        ))}
                        <label className="block text-sm text-white/60">
                          {adminLanguage === "bg" ? "Роля" : "Role"}
                          <select name="adminCreate.role"
                            value={adminUserForm.role}
                            onChange={(event) => setAdminUserForm((prev) => ({ ...prev, role: event.target.value }))}
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-[#f2d39a]/50"
                          >
                            {availableAdminRoleOptions.map((role) => (
                              <option key={role.value} value={role.value}>
                                {role.labels[adminLanguage]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button type="submit" className="luxury-button rounded-2xl px-5 py-3 text-sm font-semibold">
                          {adminLanguage === "bg" ? "Създай админ" : "Create admin"}
                        </button>
                      </div>
                    </form>

                    <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                      <div className="section-kicker">{adminLanguage === "bg" ? "Админ профили" : "Admin users"}</div>
                      <div className="mt-4 space-y-2">
                        {adminUsers.map((user) => (
                          <div key={getAdminUserId(user)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            {editingAdminId === getAdminUserId(user) && canActorManageAdminUser(currentAdminRole, user.role) ? (
                              <div className="grid gap-3">
                                <input name={`adminProfiles[${getAdminUserId(user)}].name`}
                                  value={adminEditForm.name}
                                  onChange={(event) => setAdminEditForm((prev) => ({ ...prev, name: event.target.value }))}
                                  placeholder={adminLanguage === "bg" ? "Име" : "Name"}
                                  className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-[#f2d39a]/50"
                                />
                                <input name={`adminProfiles[${getAdminUserId(user)}].email`} autoComplete="username"
                                  type="email"
                                  value={adminEditForm.email}
                                  onChange={(event) => setAdminEditForm((prev) => ({ ...prev, email: event.target.value }))}
                                  placeholder="Email"
                                  className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-[#f2d39a]/50"
                                />
                                <input name={`adminProfiles[${getAdminUserId(user)}].password`} autoComplete="new-password"
                                  type="password"
                                  value={adminEditForm.password}
                                  onChange={(event) => setAdminEditForm((prev) => ({ ...prev, password: event.target.value }))}
                                  placeholder={adminLanguage === "bg" ? "Нова парола, ако искаш промяна" : "New password, only if changing"}
                                  className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-[#f2d39a]/50"
                                />
                                <p className="-mt-1 text-xs leading-5 text-white/40">
                                  {adminLanguage === "bg"
                                    ? "Сегашната парола не се показва от съображения за сигурност. Въведи тук нова, за да я смениш."
                                    : "The current password is not shown for security. Enter a new one here to replace it."}
                                </p>
                                <select name={`adminProfiles[${getAdminUserId(user)}].role`}
                                  value={adminEditForm.role}
                                  onChange={(event) => setAdminEditForm((prev) => ({ ...prev, role: event.target.value }))}
                                  className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-[#f2d39a]/50"
                                >
                                  {availableAdminRoleOptions.map((role) => (
                                    <option key={role.value} value={role.value}>
                                      {role.labels[adminLanguage]}
                                    </option>
                                  ))}
                                </select>
                                <label className="flex items-center gap-2 text-sm text-white/70">
                                  <input name={`adminProfiles[${getAdminUserId(user)}].isActive`}
                                    type="checkbox"
                                    checked={adminEditForm.isActive}
                                    onChange={(event) => setAdminEditForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                                  />
                                  {adminLanguage === "bg" ? "Активен акаунт" : "Active account"}
                                </label>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => saveAdminUser(getAdminUserId(user))}
                                    className="luxury-button rounded-xl px-4 py-2 text-xs font-semibold"
                                  >
                                    {adminLanguage === "bg" ? "Запази" : "Save"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingAdminId(null)}
                                    className="ghost-button rounded-xl px-4 py-2 text-xs font-semibold"
                                  >
                                    {adminLanguage === "bg" ? "Откажи" : "Cancel"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="font-semibold text-[#fff4df]">{user.name}</div>
                                <div className="mt-1 text-sm text-white/50">
                                  {user.email} · {getAdminRoleLabel(user.role, adminLanguage)}
                                </div>
                                <div className="mt-1 text-xs text-white/35">
                                  {adminLanguage === "bg" ? "Последен вход" : "Last login"}: {user.lastLoginAtUtc || "—"}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {canActorManageAdminUser(currentAdminRole, user.role) && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => startEditingAdminUser(user)}
                                        className="ghost-button rounded-xl px-3 py-2 text-xs font-semibold"
                                      >
                                        {adminLanguage === "bg" ? "Редактирай" : "Edit"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => deleteAdminUser(user)}
                                        className="rounded-xl border border-red-300/25 bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-100"
                                      >
                                        {adminLanguage === "bg" ? "Изтрий" : "Delete"}
                                      </button>
                                    </>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                    <div className="section-kicker">Audit log</div>
                    <div className="mt-4 max-h-[680px] space-y-2 overflow-auto pr-1">
                      {auditLogs.map((log) => (
                        <div key={log.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-[#fff4df]">{log.action} · {log.entity}</span>
                            <span className="text-xs text-white/40">{log.createdAtUtc}</span>
                          </div>
                          <div className="mt-1 text-sm text-white/50">
                            {log.adminName || "System"} · #{log.entityId}
                          </div>
                          {(log.beforeJson || log.afterJson) && (
                            <details className="mt-3 text-xs text-white/45">
                              <summary className="cursor-pointer text-[#f2d39a]">JSON</summary>
                              <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-black/35 p-3">
                                {log.afterJson || log.beforeJson}
                              </pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Panel>
            )}
          </>
        ) : null}
      </div>
      {renderReservationTrash()}
    </div>
  );
}
