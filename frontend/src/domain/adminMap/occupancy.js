export function getRestaurantOccupancy(layoutTables, reservations) {
  const totalSeats = (layoutTables || [])
    .filter((table) => table?.isActive !== false)
    .reduce((sum, table) => sum + Math.max(0, Number(table?.seats || 0)), 0);

  const currentVisitors = (reservations || [])
    .filter((reservation) =>
      reservation?.isArrived &&
      !reservation?.isNoShow &&
      !["Cancelled", "Released"].includes(reservation?.status)
    )
    .reduce((sum, reservation) => sum + Math.max(0, Number(reservation?.guestCount || 0)), 0);

  return {
    currentVisitors,
    freeSeats: Math.max(0, totalSeats - currentVisitors),
    totalSeats,
  };
}
