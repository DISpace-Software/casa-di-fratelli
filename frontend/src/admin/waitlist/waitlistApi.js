import { API_BASE_URL } from '../../config/api';

/**
 * Tenant identity and authorization belong to the injected adminFetch adapter.
 * This adapter owns only the waitlist wire contract; UI components never build URLs.
 */
export function createWaitlistApi(adminFetch, errorMessage) {
  async function request(path = '', options) {
    const response = await adminFetch(`${API_BASE_URL}/api/waitlist${path}`, options);
    if (!response.ok) throw new Error(errorMessage);
    return response.json();
  }

  function write(path, method, body) {
    return request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  return {
    list: (date) => request(date ? `?date=${encodeURIComponent(date)}` : ''),
    saveSettings: (enabled, offerMinutes) => write('/settings', 'PUT', { enabled, offerMinutes }),
    close: (id, reason) => write(`/${encodeURIComponent(id)}/cancel`, 'POST', { reason }),
    join: (staff) => write('', 'POST', {
      email: staff.email,
      guestRequested: staff.consent,
      request: {
        date: staff.date,
        guests: Number(staff.guests),
        area: staff.area,
        times: [staff.time],
      },
    }),
  };
}
