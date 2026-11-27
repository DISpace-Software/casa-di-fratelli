import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createWaitlistApi } from './waitlistApi';

const REFRESH_INTERVAL_MS = 15_000;
const INITIAL_STAFF_REQUEST = {
  email: '', date: '', time: '19:00', guests: 2, area: '', consent: false,
};

/** Application orchestration: refresh, edits and commands; no rendering or allocation logic. */
export function useAdminWaitlist(adminFetch, language) {
  const [data, setData] = useState(null);
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [closing, setClosing] = useState(null);
  const [minutes, setMinutes] = useState(5);
  const [now, setNow] = useState(Date.now());
  const [staff, setStaff] = useState(INITIAL_STAFF_REQUEST);
  const epoch = useRef(0);
  const minutesDirty = useRef(false);
  const clockOffset = useRef(0);
  const errorMessage = language === 'bg'
    ? 'Операцията не е завършена. Проверете връзката и правата си.'
    : 'The operation did not complete. Check your connection and permissions.';
  const api = useMemo(() => createWaitlistApi(adminFetch, errorMessage), [adminFetch, errorMessage]);

  const load = useCallback(async () => {
    // A slower previous filter request must never overwrite the currently selected date.
    const generation = ++epoch.current;
    try {
      const next = await api.list(date);
      if (generation !== epoch.current) return;
      setData(next);
      setLoadError('');
      const serverTime = Date.parse(next.serverTimeUtc);
      clockOffset.current = Number.isFinite(serverTime) ? serverTime - Date.now() : 0;
      setNow(Date.now());
      // Polling refreshes server data without erasing an administrator's unsaved input.
      if (!minutesDirty.current) setMinutes(next.settings.offerMinutes);
    } catch (cause) {
      if (generation === epoch.current) setLoadError(cause.message);
    }
  }, [api, date]);

  useEffect(() => {
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      epoch.current += 1;
    };
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function runCommand(command, onSuccess) {
    setBusy(true);
    setError('');
    try {
      await command();
      onSuccess?.();
      await load();
    } catch (cause) {
      // A successful subsequent poll must not hide a failed user command.
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  function saveSettings(enabled, offerMinutes = Number(minutes)) {
    return runCommand(
      () => api.saveSettings(enabled, offerMinutes),
      () => { minutesDirty.current = false; },
    );
  }

  function close(event) {
    event.preventDefault();
    return runCommand(() => api.close(closing, reason), () => {
      setClosing(null);
      setReason('');
    });
  }

  function staffJoin(event) {
    event.preventDefault();
    return runCommand(() => api.join(staff), () => {
      setStaff(current => ({ ...current, email: '', consent: false }));
    });
  }

  function editMinutes(value) {
    minutesDirty.current = true;
    setMinutes(value);
  }

  function beginClosing(id) {
    setClosing(id);
    setReason('');
  }

  return {
    data, date, setDate, error, loadError, busy, reason, setReason,
    closing, setClosing, minutes, editMinutes, now, serverClockOffset: clockOffset.current,
    staff, setStaff, load, saveSettings, close, staffJoin, beginClosing,
  };
}
