/**
 * Anti-corruption boundary for legacy restaurant API shapes.
 * Pages consume camelCase view models; accepting PascalCase here preserves older responses.
 * These defaults are display fallbacks, never permission or booking validation decisions.
 */
import { getValue } from './wireValue.js';

export function normalizeReservation(r) {
  const tables = getValue(r, "tableIds") || getValue(r, "tables") || [];

  return {
    id: getValue(r, "id"),
    guestName: getValue(r, "guestName") || "—",
    phone: getValue(r, "phone") || "—",
    email: getValue(r, "email") || "",
    guestCount: getValue(r, "guestCount") || 0,
    area: getValue(r, "area") || "—",
    reservedDate: getValue(r, "reservedDate") || "—",
    reservedTime: getValue(r, "reservedTime") || "—",
    notes: getValue(r, "notes") || "",
    internalNote: getValue(r, "internalNote") || "",
    status: getValue(r, "status") || "Pending",
    createdAtUtc: getValue(r, "createdAtUtc"),
    birthDate: getValue(r, "birthDate"),
    marketingConsent: Boolean(getValue(r, "marketingConsent")),
    privacyConsent: Boolean(getValue(r, "privacyConsent")),
    isBlacklisted: Boolean(getValue(r, "isBlacklisted")),
    isRegularCustomer: Boolean(getValue(r, "isRegularCustomer")),
    isArrived: Boolean(getValue(r, "isArrived")),
    isNoShow: Boolean(getValue(r, "isNoShow")),
    createdByAdmin: Boolean(getValue(r, "createdByAdmin")),
    createdByAdminUserId: getValue(r, "createdByAdminUserId"),
    createdByAdminName: getValue(r, "createdByAdminName") || "",
    isWalkIn: Boolean(getValue(r, "isWalkIn")),
    tableIds: Array.isArray(tables)
      ? tables.map((x) => (typeof x === "string" ? x : x.tableCode || x.TableCode)).filter(Boolean)
      : [],
  };
}

export function normalizeDiningOrder(order) {
  const reservation = getValue(order, "reservation") || {};
  const items = getValue(order, "items") || [];

  return {
    id: getValue(order, "id"),
    reservationId: getValue(order, "reservationId"),
    guestName: getValue(order, "guestName") || "—",
    tableLabel: getValue(order, "tableLabel") || "—",
    status: getValue(order, "status") || "New",
    source: getValue(order, "source") || "GuestOnline",
    assignedWaiterId: getValue(order, "assignedWaiterId"),
    assignedWaiterName: getValue(order, "assignedWaiterName") || "",
    claimedAtUtc: getValue(order, "claimedAtUtc"),
    totalPrice: Number(getValue(order, "totalPrice") || 0),
    notes: getValue(order, "notes") || "",
    createdAtUtc: getValue(order, "createdAtUtc"),
    reservation: {
      phone: getValue(reservation, "phone") || "",
      email: getValue(reservation, "email") || "",
      reservedDate: getValue(reservation, "reservedDate") || "",
      reservedTime: getValue(reservation, "reservedTime") || "",
      isWalkIn: Boolean(getValue(reservation, "isWalkIn")),
      tableIds: getValue(reservation, "tableIds") || [],
    },
    items: Array.isArray(items)
      ? items.map((item) => ({
          id: getValue(item, "id"),
          name: getValue(item, "name") || "—",
          unitPrice: Number(getValue(item, "unitPrice") || 0),
          quantity: Number(getValue(item, "quantity") || 0),
          notes: getValue(item, "notes") || "",
          status: getValue(item, "status") || "New",
          source: getValue(item, "source") || getValue(order, "source") || "GuestOnline",
          kind: getValue(item, "kind") || "Dish",
          waiterSeenAtUtc: getValue(item, "waiterSeenAtUtc"),
        }))
      : [],
  };
}

export function normalizeCustomerHistoryReservation(reservation) {
  const tableIds = reservation.tableIds ?? reservation.TableIds ?? [];

  return {
    id: reservation.id ?? reservation.Id,
    guestName: reservation.guestName ?? reservation.GuestName ?? "",
    phone: reservation.phone ?? reservation.Phone ?? "",
    email: reservation.email ?? reservation.Email ?? "",
    guestCount: Number(reservation.guestCount ?? reservation.GuestCount ?? 0),
    area: reservation.area ?? reservation.Area ?? "",
    reservedDate: String(reservation.reservedDate ?? reservation.ReservedDate ?? "").slice(0, 10),
    reservedTime: reservation.reservedTime ?? reservation.ReservedTime ?? "",
    status: reservation.status ?? reservation.Status ?? "",
    createdByAdmin: Boolean(reservation.createdByAdmin ?? reservation.CreatedByAdmin),
    marketingConsent: Boolean(reservation.marketingConsent ?? reservation.MarketingConsent),
    isRegularCustomer: Boolean(reservation.isRegularCustomer ?? reservation.IsRegularCustomer),
    tableIds: Array.isArray(tableIds) ? tableIds.map(String) : [],
  };
}

export function normalizeLayoutItem(item) {
  return {
    ...item,
    id: String(item.id || item.Id || "").trim(),
    area: item.area || item.Area || "",
    x: Number(item.x ?? item.X ?? 50),
    y: Number(item.y ?? item.Y ?? 50),
    seats: Number(item.seats ?? item.Seats ?? 4),
    special: Boolean(item.special ?? item.Special),
    wide: Boolean(item.wide ?? item.Wide),
    isActive: item.isActive ?? item.IsActive ?? true,
  };
}

