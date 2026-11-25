import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../config/api';

export default function WaitlistPanel({ adminFetch, language }) {
  const bg = language === 'bg';
  const [data, setData] = useState(null), [date, setDate] = useState('');
  const [error, setError] = useState(''), [loadError, setLoadError] = useState(''), [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(''), [closing, setClosing] = useState(null);
  const [minutes, setMinutes] = useState(5), [now, setNow] = useState(Date.now());
  const [staff, setStaff] = useState({ email: '', date: '', time: '19:00', guests: 2, area: '', consent: false });
  const epoch = useRef(0), minutesDirty = useRef(false), clockOffset = useRef(0);
  const request = useCallback(async (path = '', options) => {
    const response = await adminFetch(`${API_BASE_URL}/api/waitlist${path}`, options);
    if (!response.ok) throw new Error(bg ? 'Операцията не е завършена. Проверете връзката и правата си.' : 'The operation did not complete. Check your connection and permissions.');
    return response.json();
  }, [adminFetch, bg]);
  const load = useCallback(async () => {
    const generation = ++epoch.current;
    try {
      const next = await request(date ? `?date=${date}` : '');
      if (generation !== epoch.current) return;
      setData(next); setLoadError('');
      const serverTime = Date.parse(next.serverTimeUtc);
      clockOffset.current = Number.isFinite(serverTime) ? serverTime - Date.now() : 0;
      setNow(Date.now());
      if (!minutesDirty.current) setMinutes(next.settings.offerMinutes);
    } catch (e) { if (generation === epoch.current) setLoadError(e.message); }
  }, [request, date]);
  useEffect(() => { load(); const timer = setInterval(() => { if (!document.hidden) load(); }, 15000); return () => { clearInterval(timer); }; }, [load]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  async function saveSettings(enabled, offerMinutes = Number(minutes)) {
    setBusy(true); setError('');
    try { await request('/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, offerMinutes }) }); minutesDirty.current = false; await load(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function close(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await request(`/${closing}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }); setClosing(null); setReason(''); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function staffJoin(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await request('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: staff.email, guestRequested: staff.consent, request: { date: staff.date, guests: Number(staff.guests), area: staff.area, times: [staff.time] } }) });
      setStaff(v => ({ ...v, email: '', consent: false })); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const labels = bg ? { waiting: 'В очакване', offered: 'Изпратено предложение', paused: 'На пауза', booked: 'Резервирано', cancelled: 'Отказано', expired: 'Изтекло' } : { waiting: 'Waiting', offered: 'Offer sent', paused: 'Paused', booked: 'Booked', cancelled: 'Cancelled', expired: 'Expired' };
  const field = 'rounded-xl border border-white/20 bg-stone-950 px-3 py-2';
  return <details className="mb-6 rounded-2xl border border-purple-300/30 bg-purple-300/5 p-5">
    <summary className="cursor-pointer text-lg font-semibold">{bg ? 'Лист на чакащи' : 'Waitlist'}{data && ` · ${data.metrics.waiting} / ${data.metrics.offered}`}</summary>
    <p className="my-3 text-sm text-white/60">{bg ? 'Първият подходящ гост получава лично предложение. Масата се задържа до потвърждение или изтичане. Пауза спира новите предложения; текущите остават валидни.' : 'The earliest matching guest gets a personal offer. The table is held until confirmation or expiry. Pausing stops new offers; existing offers remain valid.'}</p>
    {(error || loadError) && <p role="alert" className="my-3 text-orange-300">{error || loadError} <button type="button" onClick={load}>{bg ? 'Опитай пак' : 'Retry'}</button></p>}
    {data && <>
      <div className="my-4 flex flex-wrap items-end gap-4">
        <label>{bg ? 'Дата' : 'Date'}<input className={`ml-2 ${field}`} type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label>{bg ? 'Минути за потвърждение' : 'Minutes to confirm'}<input className={`ml-2 w-20 ${field}`} type="number" min="3" max="10" value={minutes} onChange={e => { minutesDirty.current = true; setMinutes(e.target.value); }} /></label>
        <button type="button" className={field} disabled={busy || !Number.isInteger(Number(minutes)) || Number(minutes) < 3 || Number(minutes) > 10} onClick={() => saveSettings(data.settings.enabled)}>{bg ? 'Запази срока' : 'Save duration'}</button>
        <button type="button" className={field} disabled={busy} onClick={() => saveSettings(!data.settings.enabled, data.settings.offerMinutes)}>{data.settings.enabled ? (bg ? 'Спри предложенията' : 'Pause offers') : (bg ? 'Включи предложенията' : 'Enable offers')}</button>
      </div>
      <details className="my-4 rounded-xl border border-white/10 p-4"><summary className="cursor-pointer">{bg ? 'Добави заявка от гост' : 'Add a guest request'}</summary>
        <p className="my-3 text-sm text-white/60">{bg ? 'Гостът трябва да има SeatMap акаунт с потвърден имейл и телефон в профила.' : 'The guest needs a SeatMap account with a verified email and a phone in their profile.'}</p>
        <form className="flex flex-wrap items-end gap-3" onSubmit={staffJoin}>
          <label>Email<input className={`block ${field}`} type="email" required value={staff.email} onChange={e => setStaff(v => ({ ...v, email: e.target.value }))} /></label>
          <label>{bg ? 'Дата' : 'Date'}<input className={`block ${field}`} type="date" required value={staff.date} onChange={e => setStaff(v => ({ ...v, date: e.target.value }))} /></label>
          <label>{bg ? 'Час' : 'Time'}<input className={`block ${field}`} type="time" step="900" required value={staff.time} onChange={e => setStaff(v => ({ ...v, time: e.target.value }))} /></label>
          <label>{bg ? 'Гости' : 'Guests'}<input className={`block w-20 ${field}`} type="number" min="1" max="30" required value={staff.guests} onChange={e => setStaff(v => ({ ...v, guests: e.target.value }))} /></label>
          <label>{bg ? 'Зона' : 'Zone'}<select required className={`block ${field}`} value={staff.area} onChange={e => setStaff(v => ({ ...v, area: e.target.value }))}><option value="">—</option>{data.zones.filter(z => z.isActive).map(z => <option value={z.id} key={z.id}>{z.name}</option>)}</select></label>
          <label><input type="checkbox" required checked={staff.consent} onChange={e => setStaff(v => ({ ...v, consent: e.target.checked }))} /> {bg ? 'По искане на госта' : 'Requested by the guest'}</label>
          <button className={field} disabled={busy}>{bg ? 'Добави' : 'Add'}</button>
        </form>
      </details>
      <p className="my-4 text-purple-200">{bg ? 'Показани заявки / резервации / дошли гости' : 'Displayed requests / bookings / arrived parties'}: {data.metrics.requests} / {data.metrics.booked} / {data.metrics.arrived}</p>
      <div className="grid gap-3 lg:grid-cols-2">{data.entries.map(({ entry: e, guestName, phone, email, notificationAttempts }) => {
        const seconds = Math.max(0, Math.floor((Date.parse(e.expiresAtUtc) - (now + clockOffset.current)) / 1000));
        return <article key={e.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex justify-between gap-3"><strong>{guestName}</strong><span className="text-purple-200">{labels[e.status] || e.status}</span></div>
          <p className="mt-2">{e.date} · {e.guests} {bg ? 'гости' : 'guests'} · {e.area}</p>
          <p>{e.tableIds?.length > 0 && e.status === 'offered' ? e.tableIds.join(' + ') + ' · ' : ''}{e.status === 'offered' ? e.offerTime : e.times.join(' · ')}</p>
          <p className="my-2 text-sm"><a href={`tel:${phone}`}>{phone}</a> · {email}</p>
          {e.status === 'offered' && <p className="text-purple-200">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} · {e.emailSentAtUtc ? (bg ? 'Имейлът е изпратен' : 'Email sent') : (notificationAttempts >= 5 ? (bg ? 'Имейлът не е изпратен — лимитът за опити е достигнат' : 'Email not sent — retry limit reached') : (bg ? `Изпращане на имейл · опит ${notificationAttempts}` : `Sending email · attempt ${notificationAttempts}`))}</p>}
          {e.reservationId && <p>#{e.reservationId}</p>}
          {['waiting', 'offered', 'paused'].includes(e.status) && <button type="button" className="mt-3 text-orange-200" onClick={() => { setClosing(e.id); setReason(''); }}>{bg ? 'Затвори заявката' : 'Close request'}</button>}
        </article>;
      })}</div>
      {data.entries.length === 0 && <p>{bg ? 'Няма заявки за този период.' : 'No requests for this period.'}</p>}
      {closing && <form className="mt-5 rounded-xl border border-orange-300/30 p-4" onSubmit={close}>
        <label className="block">{bg ? 'Причина — запазва се в журнала' : 'Reason — recorded in the audit log'}<input className={`mt-2 block w-full ${field}`} required maxLength={300} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <button disabled={busy} className={`mt-3 ${field}`}>{bg ? 'Потвърди затварянето' : 'Confirm closure'}</button>
        <button type="button" disabled={busy} className="ml-4" onClick={() => setClosing(null)}>{bg ? 'Назад' : 'Back'}</button>
      </form>}
    </>}
  </details>;
}
