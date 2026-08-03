function getLocalDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMinutesAfterReservation(reservation, now) {
  const [hours, minutes] = String(reservation?.reservedTime || "").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  const reservationTime = new Date(now);
  reservationTime.setHours(hours, minutes, 0, 0);
  return Math.floor((now.getTime() - reservationTime.getTime()) / 60000);
}

export function getRestaurantOccupancy(layoutTables, reservations, now = new Date()) {
  const totalSeats = (layoutTables || [])
    .filter((table) => table?.isActive !== false)
    .reduce((sum, table) => sum + Math.max(0, Number(table?.seats || 0)), 0);

  const today = getLocalDateValue(now);
  const todayReservations = (reservations || []).filter((reservation) =>
    reservation?.reservedDate === today &&
    !reservation?.isNoShow &&
    !["Cancelled", "Released"].includes(reservation?.status)
  );

  const currentVisitors = todayReservations
    .filter((reservation) =>
      reservation?.isArrived
    )
    .reduce((sum, reservation) => sum + Math.max(0, Number(reservation?.guestCount || 0)), 0);

  const delayedVisitors = todayReservations
    .filter((reservation) => {
      if (reservation?.isArrived) return false;
      if (!["Pending", "Approved"].includes(reservation?.status)) return false;
      const minutesLate = getMinutesAfterReservation(reservation, now);
      return minutesLate !== null && minutesLate > 15;
    })
    .reduce((sum, reservation) => sum + Math.max(0, Number(reservation?.guestCount || 0)), 0);

  return {
    currentVisitors,
    delayedVisitors,
    freeSeats: Math.max(0, totalSeats - currentVisitors - delayedVisitors),
    totalSeats,
  };
}
