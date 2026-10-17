import { isWithinReservationBuffer, timeToMinutes } from "./dateTimeRules.js";

export function isWithinHallBlock(range, time) {
  const minute = timeToMinutes(time);
  if (minute === null) return false;
  return String(range || "").split(",").some((part) => {
    const bounds = part.trim().split(" - ");
    const start = timeToMinutes(bounds[0]);
    const end = timeToMinutes(bounds[1] ?? bounds[0]);
    if (start === null || end === null) return false;
    return start <= end ? minute >= start && minute <= end : minute >= start || minute <= end;
  });
}

function isHallBlock(reservation) {
  return reservation?.isHallBlock ?? reservation?.IsHallBlock ??
    (reservation?.createdByAdmin && reservation?.phone === "admin" && reservation?.guestName === "Admin block");
}

export function isBlockedSlotForSelection(slot, reservedDate, reservedTime) {
  const slotDate = slot?.reservedDate || slot?.ReservedDate;
  const slotTime = slot?.reservedTime || slot?.ReservedTime;
  const isPublicHold = slot?.isPublicHold ?? slot?.IsPublicHold ?? false;
  return slotDate === reservedDate && (isPublicHold || (isHallBlock(slot) ? isWithinHallBlock(slotTime, reservedTime) : isWithinReservationBuffer(slotTime, reservedTime)));
}

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
          (isHallBlock(reservation) ? isWithinHallBlock(reservation.reservedTime, reservedTime) : isWithinReservationBuffer(reservation.reservedTime, reservedTime))
        );
      })
      .flatMap((reservation) => reservation.tableIds)
  );
}

export function getUnavailableSelectedTableIds(selectedTableIds, unavailableTableIds) {
  return [...new Set(selectedTableIds)].filter((tableId) => unavailableTableIds.has(tableId));
}
