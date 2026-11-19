// One bit for this restaurant and browser tab. Never persist contact details,
// table IDs, dates, tokens or a timestamp that could silently expire protection.
export const BOOKING_ATTEMPT_KEY = 'cofein:booking:pending:v1';

export function createBookingAttemptStore(storage = () => globalThis.sessionStorage) {
  let pending = false;
  let resolved = false;
  const currentStorage = () => typeof storage === 'function' ? storage() : storage;
  return {
    getAttempt() {
      if (resolved) return false;
      try {
        // Any stored value is treated conservatively, including a malformed
        // marker. A missing item must not erase a failed-write memory fallback.
        if (currentStorage()?.getItem(BOOKING_ATTEMPT_KEY) != null) pending = true;
      } catch { /* Storage can be unavailable; keep the current module state. */ }
      return pending;
    },
    startAttempt() {
      pending = true;
      resolved = false;
      try {
        const target = currentStorage();
        if (!target) return { persistent: false };
        target.setItem(BOOKING_ATTEMPT_KEY, '1');
        return { persistent: true };
      } catch { return { persistent: false }; }
    },
    // Call only after a validated success or a definitive rejection. Network
    // errors, invalid responses, 408 and 5xx must keep the pending marker.
    clearAttempt() {
      pending = false;
      resolved = true;
      try {
        const target = currentStorage();
        if (!target) return { persistent: false };
        target.removeItem(BOOKING_ATTEMPT_KEY);
        return { persistent: true };
      } catch { return { persistent: false }; }
    },
  };
}

export function isDefinitiveBookingFailure(error) {
  return error?.kind === 'http' && Number.isInteger(error.status) && error.status >= 400 && error.status < 500 && error.status !== 408;
}

const attempts = createBookingAttemptStore();
export const getAttempt = () => attempts.getAttempt();
export const startAttempt = () => attempts.startAttempt();
export const clearAttempt = () => attempts.clearAttempt();
