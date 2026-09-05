export function findPublicTableHold(holds, reservedDate, tableIds) {
  if (!tableIds.length) return null;
  return holds.find((hold) => {
    const holdDate = hold.reservedDate || hold.ReservedDate;
    const heldIds = hold.tableIds || hold.TableIds || [];
    return holdDate === reservedDate && tableIds.every((id) => heldIds.includes(id));
  }) || null;
}
