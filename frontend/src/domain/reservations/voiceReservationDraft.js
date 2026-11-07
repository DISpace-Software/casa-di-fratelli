// Apply against React's latest draft, including updates queued before this one.
// Retract a now-ambiguous voice value only if staff have not edited it by hand.
export function applyVoiceReservationDraft(draft, patch, { clearIfMatches = {}, resetTables = false } = {}) {
  const updates = { ...patch };
  for (const [key, value] of Object.entries(clearIfMatches)) {
    if (draft[key] === value && !Object.hasOwn(updates, key)) updates[key] = '';
  }
  const slotChanged = Object.hasOwn(updates, 'reservedDate') || Object.hasOwn(updates, 'reservedTime');
  return { ...draft, ...updates, ...(resetTables && slotChanged ? { tableIds: '' } : {}) };
}
