import { isHallBlock } from "../reservations/hallBlockRules.js";
export function getReservationMinutesFromNow(reservation, now = new Date()) {
  if (!reservation?.reservedDate || !reservation?.reservedTime) return null;

  const [hours, minutes] = String(reservation.reservedTime).split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  const [year, month, day] = String(reservation.reservedDate).split("-").map(Number);
  const target = Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? new Date(year, month - 1, day, hours, minutes, 0, 0)
    : new Date(now);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    target.setHours(hours, minutes, 0, 0);
  }

  const candidates = [target];
  if (hours <= 3) {
    const nextServiceDayTarget = new Date(target);
    nextServiceDayTarget.setDate(nextServiceDayTarget.getDate() + 1);
    candidates.push(nextServiceDayTarget);
  }

  const closestTarget = candidates.reduce((closest, candidate) => {
    const closestDistance = Math.abs(closest.getTime() - now.getTime());
    const candidateDistance = Math.abs(candidate.getTime() - now.getTime());
    return candidateDistance < closestDistance ? candidate : closest;
  }, candidates[0]);

  return Math.round((closestTarget.getTime() - now.getTime()) / 60000);
}

export function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLiveReservationCandidates(reservations, now = new Date()) {
  const today = formatLocalDate(now);

  return reservations
    .filter((reservation) => {
      if (isHallBlock(reservation) || !["Pending", "Approved"].includes(reservation.status) || reservation.isNoShow) return false;
      if (reservation.reservedDate !== today) return false;

      const minutes = getReservationMinutesFromNow(reservation, now);
      return minutes !== null;
    })
    .sort((first, second) => {
      if (first.isArrived !== second.isArrived) {
        return first.isArrived ? -1 : 1;
      }

      const firstMinutes = getReservationMinutesFromNow(first, now) ?? 9999;
      const secondMinutes = getReservationMinutesFromNow(second, now) ?? 9999;

      const firstIsPast = firstMinutes < 0;
      const secondIsPast = secondMinutes < 0;

      if (firstIsPast !== secondIsPast) {
        return firstIsPast ? 1 : -1;
      }

      return Math.abs(firstMinutes) - Math.abs(secondMinutes);
    });
}


export function buildReservationsByTableForDate(reservations, selectedDate) {
  const byTable = new Map();

  reservations
    .filter((reservation) => {
      if (isHallBlock(reservation) || !["Pending", "Approved"].includes(reservation.status) || reservation.isNoShow) return false;
      if (reservation.reservedDate !== selectedDate) return false;
      if (["Cancelled", "Released"].includes(reservation.status)) return false;
      return true;
    })
    .sort((first, second) => String(first.reservedTime).localeCompare(String(second.reservedTime)))
    .forEach((reservation) => {
      reservation.tableIds.forEach((tableId) => {
        if (!byTable.has(tableId)) {
          byTable.set(tableId, reservation);
        }
      });
    });

  return byTable;
}

