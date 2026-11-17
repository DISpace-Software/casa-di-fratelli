import { useEffect, useState } from 'react';
import { API_BASE_URL, apiFetch } from '../../config/api';
import { tenantContext } from '../../config/tenantRuntime';
import { isLocalReservationDictationEnabled } from '../../domain/reservations/reservationDictationPolicy';

export function useReservationDictationPolicy() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!tenantContext.valid) return;
    let disposed = false;
    let active = null;
    let deadline;
    async function reload() {
      active?.abort();
      clearTimeout(deadline);
      const controller = new AbortController();
      active = controller;
      deadline = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await apiFetch(`${API_BASE_URL}/api/admin/context`, {
          cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) throw new Error('Restaurant policy unavailable');
        const context = await response.json();
        if (!disposed && active === controller) setEnabled(isLocalReservationDictationEnabled(context, tenantContext.tenantId));
      } catch {
        if (!disposed && active === controller) setEnabled(false);
      } finally {
        if (active === controller) clearTimeout(deadline);
      }
    }
    const refreshVisible = () => { if (!document.hidden) reload(); };
    reload();
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      disposed = true;
      clearTimeout(deadline);
      active?.abort();
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, []);
  return enabled;
}
