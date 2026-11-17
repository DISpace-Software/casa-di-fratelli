// Shared API policy: any resolved restaurant can use the same local recognizer.
// A missing/newer contract must never fall back to uploading audio elsewhere.
export function isLocalReservationDictationEnabled(context, tenantId) {
  if (!tenantId || context?.tenantId !== tenantId) return false;
  const policy = context.reservationDictation;
  return policy?.enabled === true && policy.mode === 'on-device'
    && Array.isArray(policy.languages) && policy.languages.includes('bg')
    && Array.isArray(policy.fields) && policy.fields.length === 2
    && policy.fields.includes('guestName') && policy.fields.includes('phone');
}
