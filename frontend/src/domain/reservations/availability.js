import { isWithinReservationBuffer } from "./dateTimeRules.js";

export function getUnavailableTableIdsForSlot(
  reservations,
  reservedDate,
  reservedTime,
  excludeReservationId = null
) {
  if (!reservedDate || !reservedTime) return new Set();

  return new Set(
    reservations
      .filter((reservation) => {
        if (reservation.status !== "Approved") return false;
        if (excludeReservationId && reservation.id === excludeReservationId) return false;
        if (!Array.isArray(reservation.tableIds) || reservation.tableIds.length === 0) return false;

        return (
          String(reservation.reservedDate) === String(reservedDate) &&
          isWithinReservationBuffer(reservation.reservedTime, reservedTime)
        );
      })
      .flatMap((reservation) => reservation.tableIds)
  );
}

export function getUnavailableSelectedTableIds(selectedTableIds, unavailableTableIds) {
  return [...new Set(selectedTableIds)].filter((tableId) => unavailableTableIds.has(tableId));
}
