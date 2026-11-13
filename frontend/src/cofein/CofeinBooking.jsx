import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { BookingError, bookingErrorMessage, bookingTimes, createCofeinBookingApi, restaurantClock, validBookingSearch } from './bookingApi.js';
import { CONTACT_LIMITS, validateBookingContact } from './bookingForm.js';
import { cofeinContact } from './contact.js';
import { getAttempt, startAttempt, clearAttempt, isDefinitiveBookingFailure } from './bookingAttempt.js';
import CofeinMapExplorer from '../components/floorplan/CofeinMapExplorer.jsx';
import { getCofeinMapGeometry, cofeinZoneViewId } from '../domain/floorPlans/cofeinGeometry.js';
import './cofein-booking.css';

const choiceLabel = option => `${option.tableIds.length === 1 ? 'Маса' : 'Маси'} ${option.tableIds.join(' + ')}`;
const dateLabel = date => date.split('-').reverse().join('.');
const guestsLabel = guests => `${guests} ${guests === 1 ? 'гост' : 'гости'}`;
const EMPTY_CONTACT = { guestName: '', phone: '', email: '', notes: '', privacyConsent: false };
const STAGES = [{ id: 'visit', label: 'Посещение' }, { id: 'table', label: 'Маса' }, { id: 'contact', label: 'Вашите данни' }];
const nextDate = date => { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + 1); return value.toISOString().slice(0, 10); };

function BookingIcon({ kind = 'table' }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {kind === 'check' ? <path d="m5 12 4 4L19 6" /> : kind === 'calendar' ? <><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4m8-4v4M4 10h16m-11 4h2m3 0h2" /></> : kind === 'phone' ? <path d="m7 3 3 5-3 2c1 4 3 6 7 7l2-3 5 3c0 3-2 5-5 4C9 19 5 15 3 8 2 5 4 3 7 3Z" /> : <><rect x="6" y="7" width="12" height="10" rx="3" /><path d="M10 3h4m-4 18h4M2 10v4m20-4v4" /></>}
  </g></svg>;
}

export default function CofeinBooking({ onClose, onBusyChange }) {
  const [api] = useState(() => createCofeinBookingApi());
  const [setup, setSetup] = useState({ status: api.enabled ? 'loading' : 'disabled', data: null, error: null });
  const [setupAttempt, setSetupAttempt] = useState(0);
  const [search, setSearch] = useState({ date: '', time: '', guests: 2 });
  const [refresh, setRefresh] = useState(0);
  const [availability, setAvailability] = useState({ status: 'idle', key: '', data: null, error: null });
  const [area, setArea] = useState('');
  const [mapView, setMapView] = useState('all');
  const [selectedKey, setSelectedKey] = useState('');
  const [step, setStep] = useState('visit');
  const [displayMode, setDisplayMode] = useState('map');
  const [contact, setContact] = useState(EMPTY_CONTACT);
  const [fieldErrors, setFieldErrors] = useState({});
  const [showNotes, setShowNotes] = useState(false);
  const [checkedWithTeam, setCheckedWithTeam] = useState(false);
  const [submission, setSubmission] = useState(() => ({ status: getAttempt() ? 'unknown' : 'idle', error: '', result: null }));
  const [now, setNow] = useState(() => new Date());
  const requestId = useRef(0);
  const submitLock = useRef(false);
  const mounted = useRef(false);
  const submitController = useRef(null);
  const headingRef = useRef(null);
  const bodyRef = useRef(null);
  const contactFormRef = useRef(null);
  const id = useId();
  const submitting = submission.status === 'sending';
  const finished = submission.status === 'success' || submission.status === 'unknown';

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; submitController.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!api.enabled) return;
    const controller = new AbortController();
    api.loadSetup(controller.signal).then(data => {
      if (!controller.signal.aborted) setSetup({ status: 'ready', data, error: null });
    }).catch(error => {
      if (!controller.signal.aborted) setSetup({ status: 'error', data: null, error });
    });
    return () => controller.abort();
  }, [api, setupAttempt]);

  useEffect(() => {
    if (!api.enabled || finished) return;
    const tick = () => { if (!document.hidden) setNow(new Date()); };
    const update = () => { if (!document.hidden) { tick(); setRefresh(value => value + 1); } };
    const clockTimer = setInterval(tick, 5000);
    const refreshTimer = setInterval(update, 30000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(clockTimer); clearInterval(refreshTimer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, [api, finished]);

  const policy = setup.data?.policy;
  const plan = setup.data?.plan;
  const clock = useMemo(() => policy ? restaurantClock(policy, now) : null, [policy, now]);
  const date = search.date || clock?.today || '';
  const { time, guests } = search;
  const searchKey = `${date}/${time}/${guests}`;
  const times = useMemo(() => policy ? bookingTimes(policy, date, now) : [], [policy, date, now]);
  const isSearchValid = Boolean(policy && plan && validBookingSearch({ date, time, guests }, policy, plan, now));

  useEffect(() => {
    if (!isSearchValid || submitting || finished) return;
    const sequence = ++requestId.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setAvailability(previous => ({ status: 'loading', key: searchKey, data: previous.key === searchKey ? previous.data : null, error: null }));
      try {
        const data = await api.loadAvailability({ date, time, guests }, controller.signal);
        if (!controller.signal.aborted && sequence === requestId.current) {
          setAvailability({ status: 'ready', key: searchKey, data, error: null });
          setSetup({ status: 'ready', data: { policy: data.policy, plan: data.plan }, error: null });
          setSelectedKey(key => data.options.some(option => option.key === key) ? key : '');
        }
      } catch (error) {
        if (!controller.signal.aborted && sequence === requestId.current) {
          if (error.setup) {
            setSetup({ status: 'ready', data: error.setup, error: null });
            setSelectedKey('');
            setStep('visit');
            setSubmission({ status: 'idle', error: bookingErrorMessage(error), result: null });
          }
          // Keep the chosen option for context; it cannot be submitted until a new check succeeds.
          setAvailability(previous => ({ status: 'error', key: searchKey, data: previous.key === searchKey ? previous.data : null, error }));
        }
      }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [api, date, time, guests, searchKey, isSearchValid, refresh, submitting, finished]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    if (step !== 'visit' || finished) headingRef.current?.focus({ preventScroll: true });
  }, [step, finished]);

  const current = availability.key === searchKey && isSearchValid ? availability.data : null;
  // A background refresh doesn't erase still-valid data; a failed or expired check does.
  const fresh = Boolean(current && availability.status !== 'error' && Date.now() - current.checkedAt < 45000);
  const selected = current?.options.find(option => option.key === selectedKey);
  const displayPlan = current?.plan || plan;
  const zones = useMemo(() => displayPlan?.zones.filter(zone => zone.isActive) || [], [displayPlan]);
  const openZones = current ? current.zones : zones;
  const activeArea = zones.some(zone => zone.id === area) ? area : '';
  const mapGeometry = useMemo(() => getCofeinMapGeometry(displayPlan?.zones || [], displayPlan?.tables || []), [displayPlan]);
  const mapTables = useMemo(() => {
    const zoneIds = new Set(zones.map(zone => zone.id));
    return displayPlan?.tables.filter(table => table.isActive && zoneIds.has(table.area)) || [];
  }, [displayPlan, zones]);
  const zoneName = areaId => zones.find(zone => zone.id === areaId)?.names?.bg || zones.find(zone => zone.id === areaId)?.name || '';
  const options = useMemo(() => fresh ? current.options.filter(option => !activeArea || option.area === activeArea) : [], [fresh, current, activeArea]);
  const tableStates = useMemo(() => {
    const singles = new Set(current?.options.filter(option => option.tableIds.length === 1).map(option => option.tableIds[0]) || []);
    const occupied = new Set(current?.unavailable || []);
    const open = new Set(current?.zones.map(zone => zone.id) || []);
    return Object.fromEntries(mapTables.map(table => {
      const closed = fresh && (current.closed || !open.has(table.area));
      const unavailable = occupied.has(table.id.toLowerCase());
      const suitable = singles.has(table.id);
      return [table.id, { status: !fresh ? 'unknown' : closed || unavailable || !suitable ? 'unavailable' : 'available', selectable: fresh && suitable && !submitting,
        label: !fresh ? 'Очаква проверка' : closed ? 'Залата е затворена' : unavailable ? 'Заета' : !suitable ? 'Не е подходяща за избрания брой гости' : 'Свободна' }];
    }));
  }, [mapTables, current, fresh, submitting]);
  const canContinue = Boolean(selected && fresh && isSearchValid);
  const stepIndex = STAGES.findIndex(stage => stage.id === step);
  const telephone = policy?.phone?.replace(/[^+\d]/g, '') || cofeinContact.telephone;
  const phoneLabel = policy?.phone || cofeinContact.phone;

  const goTo = useCallback(value => { if (!submitLock.current) setStep(value); }, []);
  function chooseArea(value) {
    setArea(value);
    const firstDetail = mapGeometry.detailViews.find(key => mapGeometry.views[key]?.zoneId === value);
    setMapView(value ? firstDetail || cofeinZoneViewId(value) : 'all');
    if (selected && value && selected.area !== value) setSelectedKey('');
  }
  function changeMapView(value) {
    const zoneId = mapGeometry.views[value]?.zoneId || '';
    setMapView(value);
    setArea(zoneId);
    if (zoneId && selected && selected.area !== zoneId) setSelectedKey('');
  }
  function changeSearch(field, value) {
    setSearch(previous => ({ ...previous, [field]: value, ...(field === 'date' && value !== date ? { time: '' } : {}) }));
    setSelectedKey('');
    setSubmission({ status: 'idle', error: '', result: null });
    setAvailability({ status: 'idle', key: '', data: null, error: null });
  }
  function selectOption(option) {
    if (!fresh || Date.now() - current.checkedAt >= 45000 || submitting || !option) return;
    setSelectedKey(option.key);
    setArea(option.area);
    setSubmission({ status: 'idle', error: '', result: null });
  }
  function showTables(event) {
    event?.preventDefault();
    if (!isSearchValid) return;
    chooseArea(activeArea);
    goTo('table');
  }
  function showContact(event) {
    // React may replace a button with a submit button in this click's render.
    // Cancel the original default action so entering the form never submits it.
    event.preventDefault();
    if (!canContinue || Date.now() - current.checkedAt >= 45000) {
      setRefresh(value => value + 1);
      return;
    }
    goTo('contact');
  }
  function updateContact(field, value) {
    setContact(previous => ({ ...previous, [field]: value }));
    setFieldErrors(previous => ({ ...previous, [field]: undefined }));
    if (submission.error) setSubmission(previous => ({ ...previous, error: '' }));
  }
  function blurContact(field) { setFieldErrors(previous => ({ ...previous, [field]: validateBookingContact(contact)[field] })); }
  function retrySetup() { setSetup({ status: 'loading', data: null, error: null }); setSetupAttempt(value => value + 1); }

  async function submit(event) {
    event.preventDefault();
    if (submitLock.current) return;
    const errors = validateBookingContact(contact);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      contactFormRef.current?.elements.namedItem(Object.keys(errors)[0])?.focus();
      return;
    }
    if (!canContinue || Date.now() - current.checkedAt >= 45000) {
      setRefresh(value => value + 1);
      return;
    }
    submitLock.current = true;
    onBusyChange?.(true);
    const controller = new AbortController();
    submitController.current = controller;
    ++requestId.current;
    setSubmission({ status: 'sending', error: '', result: null });
    let postStarted = false;
    try {
      const data = await api.loadAvailability({ date, time, guests }, controller.signal);
      if (!mounted.current) return;
      setSetup({ status: 'ready', data: { policy: data.policy, plan: data.plan }, error: null });
      setAvailability({ status: 'ready', key: searchKey, data, error: null });
      const option = data.options.find(item => item.key === selectedKey);
      if (!option) throw new BookingError('http', 409);
      const payload = { guestName: contact.guestName.trim(), phone: contact.phone.trim(), email: contact.email.trim(), notes: contact.notes.trim(),
        reservedDate: date, reservedTime: time, guestCount: guests, area: option.area, tableIds: option.tableIds, privacyConsent: true, marketingConsent: false };
      startAttempt();
      postStarted = true;
      const result = await api.create(payload, controller.signal);
      clearAttempt();
      if (mounted.current) setSubmission({ status: 'success', error: '', result: { ...result, zoneName: data.zones.find(zone => zone.id === option.area)?.names?.bg || data.zones.find(zone => zone.id === option.area)?.name || '' } });
    } catch (error) {
      const uncertain = postStarted && !isDefinitiveBookingFailure(error);
      if (postStarted && !uncertain) clearAttempt();
      if (!mounted.current || controller.signal.aborted) return;
      if (uncertain) setSubmission({ status: 'unknown', error: '', result: null });
      else {
        setSubmission({ status: 'idle', error: bookingErrorMessage(error), result: null });
        if (error.setup) {
          setSetup({ status: 'ready', data: error.setup, error: null });
          setSelectedKey('');
          setStep('visit');
          setAvailability({ status: 'error', key: searchKey, data: null, error });
        } else if (error.status === 409) {
          setSelectedKey('');
          setAvailability({ status: 'error', key: searchKey, data: null, error });
          setStep('table');
          setRefresh(value => value + 1);
        } else if (!postStarted) setAvailability(previous => ({ ...previous, status: 'error', error }));
      }
    } finally {
      submitLock.current = false;
      submitController.current = null;
      onBusyChange?.(false);
    }
  }

  const title = finished ? submission.status === 'unknown' ? 'Нека проверим резервацията.' : submission.result?.status === 'Approved' ? 'Масата Ви очаква.' : 'Още една стъпка по имейл.'
    : step === 'visit' ? 'Резервирайте своето място.' : step === 'table' ? 'Коя маса избирате?' : 'На чие име да запазим?';
  const description = step === 'visit' ? 'Изберете кога ще ни посетите. После намерете своята маса.' : step === 'table' ? 'Изберете свободна маса на картата или от списъка.' : 'Оставете контакт, за да можем да се свържем с Вас.';
  const inputProps = field => ({ id: `${id}-${field}`, name: field, value: contact[field], onChange: event => updateContact(field, event.target.value), onBlur: () => blurContact(field), 'aria-labelledby': `${id}-${field}-label`, 'aria-invalid': Boolean(fieldErrors[field]), 'aria-describedby': fieldErrors[field] ? `${id}-${field}-error` : undefined });
  const fieldError = field => fieldErrors[field] && <span className="cofein-field-error" id={`${id}-${field}-error`}>{fieldErrors[field]}</span>;
  const summaryArea = step === 'contact' && selected ? selected.area : activeArea;
  const selectionSummary = <><span>{date && dateLabel(date)} · {time || 'Изберете час'}</span><span>{guestsLabel(guests)}{summaryArea ? ` · ${zoneName(summaryArea)}` : ' · Всички зали'}</span></>;
  const loading = setup.status === 'loading';
  const blockedSetup = !api.enabled || setup.status === 'error';

  return <section className="cofein-booking" data-step={finished ? 'result' : loading || blockedSetup ? 'notice' : step} aria-busy={submitting || loading}>
    <div className="cofein-booking-body" ref={bodyRef}>
      <header className="cofein-booking-heading">
        {!finished && setup.status === 'ready' && <ol className="cofein-booking-steps" aria-label="Стъпки за резервация">
          {STAGES.map((stage, index) => <li key={stage.id} aria-current={stage.id === step ? 'step' : undefined}>
            <button type="button" disabled={submitting || index > stepIndex} onClick={() => goTo(stage.id)}><span>{index < stepIndex ? <BookingIcon kind="check" /> : index + 1}</span>{stage.label}</button>
          </li>)}
        </ol>}
        <h2 id="dialog-title" ref={headingRef} tabIndex={-1}>{title}</h2>
        <p id="dialog-description">{finished ? 'COFEIN · Вашата резервация' : description}</p>
      </header>

      {loading && !finished && <div className="cofein-booking-loading" role="status"><span className="cofein-booking-spinner" />Подготвяме свободните места…</div>}
      {blockedSetup && !finished && <div className="cofein-booking-empty" role="status"><BookingIcon kind="phone" /><h3>{!api.enabled || setup.error?.kind === 'configuration' ? 'Резервация по телефона' : 'Връзката се забави'}</h3>
        <p>{!api.enabled || setup.error?.kind === 'configuration' ? 'Онлайн резервациите предстоят. За маса се свържете с екипа на Cofein.' : bookingErrorMessage(setup.error)}</p>
        <a className="cofein-booking-primary" href={`tel:${telephone}`}><BookingIcon kind="phone" />{phoneLabel}</a>
        {api.enabled && <button className="cofein-booking-secondary" type="button" onClick={retrySetup}>Опитай отново</button>}
      </div>}

      {finished && <div className="cofein-booking-result">
        <div className="cofein-booking-result-icon"><BookingIcon kind={submission.status === 'unknown' ? 'phone' : 'check'} /></div>
        <p role="status">{submission.status === 'unknown' ? 'Не получихме потвърждение от системата. Възможно е резервацията да е записана. Свържете се с Cofein, преди да изпратите нова.' : submission.result?.status === 'Approved' ? 'Резервацията Ви е потвърдена.' : 'Изпратихме линк на посочения имейл. Отворете го, за да потвърдите резервацията. Проверете и папката „Спам“.'}</p>
        {submission.result && <><p className="cofein-booking-reference">Резервация №{submission.result.id}</p><dl className="cofein-booking-receipt">
          <div><dt>Кога</dt><dd>{dateLabel(submission.result.reservedDate)} · {submission.result.reservedTime}</dd></div>
          <div><dt>Гости</dt><dd>{guestsLabel(submission.result.guestCount)}</dd></div>
          <div><dt>Къде</dt><dd>{submission.result.zoneName}<br />Маса {submission.result.tableIds.join(' + ')}</dd></div>
        </dl></>}
        {submission.status === 'unknown' && <>
          {telephone && <a className="cofein-booking-primary" href={`tel:${telephone}`}><BookingIcon kind="phone" />{phoneLabel}</a>}
          <label className="cofein-booking-consent cofein-unknown-consent"><input type="checkbox" checked={checkedWithTeam} onChange={event => setCheckedWithTeam(event.target.checked)} /><span>Проверих с екипа и трябва да направя нова резервация.</span></label>
          <button type="button" className="cofein-booking-secondary" disabled={!checkedWithTeam} onClick={() => { clearAttempt(); setCheckedWithTeam(false); setSubmission({ status: 'idle', error: '', result: null }); setSelectedKey(''); setStep('visit'); setRefresh(value => value + 1); }}>Нова резервация след проверка</button>
        </>}
        {onClose && <button className={submission.status === 'unknown' ? 'cofein-booking-text-button' : 'cofein-booking-primary'} type="button" onClick={onClose}>Готово</button>}
      </div>}

      {!finished && setup.status === 'ready' && <>
        {step === 'visit' && <form id={`${id}-visit-form`} className="cofein-booking-visit" onSubmit={showTables}>
          <fieldset className="cofein-booking-search">
            <legend className="cofein-booking-sr">Дата, час и брой гости</legend>
            <div><label htmlFor={`${id}-date`}>Дата<input id={`${id}-date`} type="date" min={clock.today} max={clock.lastDate} value={date} onChange={event => changeSearch('date', event.target.value)} required /></label>
              <span className="cofein-booking-quick-dates">{[[clock.today, 'Днес'], [nextDate(clock.today), 'Утре']].map(([value, label]) => <button type="button" key={value} aria-pressed={date === value} disabled={value > clock.lastDate || bookingTimes(policy, value, now).length === 0} onClick={() => changeSearch('date', value)}>{label}</button>)}</span>
            </div>
            <div className="cofein-booking-search-row">
              <label htmlFor={`${id}-time`}><span id={`${id}-time-label`}>Час</span><select aria-labelledby={`${id}-time-label`} id={`${id}-time`} value={time} onChange={event => changeSearch('time', event.target.value)} required><option value="">Изберете час</option>{time && !times.includes(time) && <option value={time} disabled>{time} · недостъпно</option>}{times.map(slot => <option key={slot} value={slot}>{slot}</option>)}</select></label>
              <label htmlFor={`${id}-guests`}><span id={`${id}-guests-label`}>Брой гости</span><select aria-labelledby={`${id}-guests-label`} id={`${id}-guests`} value={guests} onChange={event => changeSearch('guests', Number(event.target.value))}>{guests > plan.publicMaxGuests && <option value={guests} disabled>{guestsLabel(guests)} · недостъпно</option>}{Array.from({ length: plan.publicMaxGuests }, (_, index) => <option key={index + 1} value={index + 1}>{guestsLabel(index + 1)}</option>)}</select></label>
            </div>
          </fieldset>
          {!times.length && <p className="cofein-booking-status" role="status">За тази дата няма оставащи часове. Изберете утре или друга дата.</p>}
          {time && !isSearchValid && <p className="cofein-booking-status" role="alert">Избраният час или брой гости вече не е достъпен. Проверете избора си.</p>}
          <fieldset className="cofein-booking-halls"><legend>Къде Ви се сяда?</legend><div className="cofein-booking-hall-options">
            <button type="button" aria-pressed={!activeArea} onClick={() => chooseArea('')}><BookingIcon /><span>Без предпочитание<small>Всички зали</small></span></button>
            {zones.map(zone => <button type="button" key={zone.id} aria-pressed={activeArea === zone.id} onClick={() => chooseArea(zone.id)}><BookingIcon /><span>{zone.names?.bg || zone.name}<small>{current && !openZones.some(item => item.id === zone.id) ? 'Временно затворена' : 'Избор на маса на карта'}</small></span></button>)}
          </div></fieldset>
          <p className="cofein-booking-help">Онлайн до {policy.maxDays} дни напред{policy.leadMinutes ? ` · поне ${policy.leadMinutes} мин. преди посещението` : ''}.</p>
          {telephone && <p className="cofein-booking-phone-help">За по-голяма компания <a href={`tel:${telephone}`}>обадете ни се</a>.</p>}
        </form>}

        {step === 'table' && <div className="cofein-booking-visit-summary"><BookingIcon kind="calendar" /><div>{selectionSummary}</div><button type="button" onClick={() => goTo('visit')} disabled={submitting}>Промени</button></div>}
        {(step === 'table' || (step === 'contact' && !fresh)) && <div className="cofein-booking-feedback">
          <p className="cofein-booking-live" role="status">{availability.status === 'loading' ? fresh ? 'Обновяваме свободните места…' : 'Проверяваме свободните места…' : fresh ? current.closed ? 'За тази дата заведението е затворено.' : !current.options.length ? 'Няма подходяща свободна маса за този час и брой гости.' : `${current.options.length} ${current.options.length === 1 ? 'възможност' : 'възможности'} за Вашата компания` : availability.status === 'error' ? bookingErrorMessage(availability.error) : 'Изборът трябва да бъде проверен отново.'}</p>
          <button className="cofein-booking-refresh" type="button" disabled={submitting || availability.status === 'loading'} onClick={() => { setNow(new Date()); setRefresh(value => value + 1); }} aria-label="Обнови наличността">↻ <span>Обнови</span></button>
        </div>}
        {submission.error && <p className="cofein-booking-status" role="alert">{submission.error}</p>}

        {step === 'table' && <div className="cofein-booking-map-layout">
          <div className="cofein-booking-map-column">
            <div className="cofein-booking-map-heading"><h3>Свободните маси</h3><div className="cofein-booking-mode" role="group" aria-label="Начин на избор"><button type="button" aria-pressed={displayMode === 'map'} onClick={() => setDisplayMode('map')}>Карта</button><button type="button" aria-pressed={displayMode === 'list'} onClick={() => setDisplayMode('list')}>Списък</button></div></div>
            {displayMode === 'map' ? <>
              <CofeinMapExplorer zones={displayPlan.zones} geometryTables={displayPlan.tables} tables={mapTables} states={tableStates} selectedIds={fresh ? selected?.tableIds || [] : []} viewId={mapView} onViewChange={changeMapView}
                onTableSelect={table => selectOption(current?.options.find(option => option.tableIds.length === 1 && option.tableIds[0] === table.id))} />
              <div className="cofein-booking-legend" aria-label="Легенда"><span>Свободна</span><span>Избрана</span><span>Недостъпна</span></div>
              {fresh && current.options.some(option => option.tableIds.length > 1) && <button className="cofein-booking-text-button" type="button" onClick={() => setDisplayMode('list')}>Виж и комбинациите от маси в списъка →</button>}
            </> : <div className="cofein-booking-list">
              <label className="cofein-booking-zone" htmlFor={`${id}-zone`}><span id={`${id}-zone-label`}>Зала</span><select aria-labelledby={`${id}-zone-label`} id={`${id}-zone`} value={activeArea} onChange={event => chooseArea(event.target.value)}><option value="">Всички зали</option>{zones.map(zone => <option key={zone.id} value={zone.id}>{zone.names?.bg || zone.name}</option>)}</select></label>
              <div className="cofein-booking-options" role="group" aria-label="Свободни маси и комбинации">{options.map(option => <button type="button" key={option.key} aria-pressed={selectedKey === option.key} onClick={() => selectOption(option)}><BookingIcon /><span><strong>{choiceLabel(option)}</strong><small>{zoneName(option.area)}</small></span><span>{option.seats} места{selectedKey === option.key && <BookingIcon kind="check" />}</span></button>)}</div>
              {!options.length && <p className="cofein-booking-status">{!fresh ? 'Изчакваме проверката на свободните места.' : 'В тази зала няма подходяща свободна маса. Изберете друга зала или променете часа.'}</p>}
            </div>}
            {fresh && !current.options.length && <div className="cofein-booking-empty"><p>Опитайте друг час или дата. За съдействие сме на разположение.</p><button type="button" className="cofein-booking-secondary" onClick={() => goTo('visit')}>Промени посещението</button>{telephone && <a href={`tel:${telephone}`}>Обадете ни се</a>}</div>}
          </div>
          <aside className="cofein-booking-choice" aria-label="Вашият избор"><p className="cofein-booking-kicker">ВАШИЯТ ИЗБОР</p><BookingIcon />
            <h3>{selected ? choiceLabel(selected) : 'Изберете маса'}</h3><p>{selected ? `${zoneName(selected.area)} · ${selected.seats} места` : 'Разгледайте залите и докоснете подходяща маса.'}</p>
            <dl><div><dt>Посещение</dt><dd>{dateLabel(date)} · {time}</dd></div><div><dt>Компания</dt><dd>{guestsLabel(guests)}</dd></div></dl>
            <p className="cofein-booking-help">На следващата стъпка ще добавите име и контакт.</p>
          </aside>
        </div>}

        {step === 'contact' && <form id={`${id}-contact-form`} ref={contactFormRef} className="cofein-booking-contact" onSubmit={submit} noValidate>
          <div className="cofein-booking-selection"><BookingIcon /><div><strong>{selected ? choiceLabel(selected) : 'Нужен е нов избор на маса'}</strong><span>{dateLabel(date)} · {time} · {guestsLabel(guests)}</span><span>{selected ? `${zoneName(selected.area)} · ${selected.seats} места` : 'Данните Ви са запазени. Изберете друга свободна маса.'}</span></div><button type="button" onClick={() => goTo('table')} disabled={submitting}>Промени</button></div>
          {!canContinue && <p className="cofein-booking-status" role="alert">{selected ? 'Изчакваме актуална проверка на масата. Можете да продължите да попълвате данните.' : 'Тази маса вече не е свободна. Върнете се към масите, за да изберете друга.'}</p>}
          <fieldset disabled={submitting}>
            <legend className="cofein-booking-sr">Данни за контакт</legend>
            <label htmlFor={`${id}-guestName`}><span id={`${id}-guestName-label`}>Име и фамилия</span><input {...inputProps('guestName')} autoComplete="name" placeholder="Напр. Георги Иванов" maxLength={CONTACT_LIMITS.guestName} required />{fieldError('guestName')}</label>
            <div className="cofein-booking-contact-grid"><label htmlFor={`${id}-phone`}><span id={`${id}-phone-label`}>Телефон</span><input {...inputProps('phone')} type="tel" inputMode="tel" autoComplete="tel" placeholder="08… или +359…" maxLength={CONTACT_LIMITS.phone} required />{fieldError('phone')}</label><label htmlFor={`${id}-email`}><span id={`${id}-email-label`}>Имейл</span><input {...inputProps('email')} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="name@example.com" maxLength={CONTACT_LIMITS.email} required />{fieldError('email')}</label></div>
            {!showNotes ? <button className="cofein-booking-note-toggle" type="button" onClick={() => setShowNotes(true)}>＋ Добавете бележка <span>по желание</span></button> : <label htmlFor={`${id}-notes`}><span id={`${id}-notes-label`}>Бележка</span> <span className="cofein-booking-optional">по желание</span><textarea {...inputProps('notes')} rows={2} maxLength={CONTACT_LIMITS.notes} placeholder="Например: ще бъдем с детска количка" />{fieldError('notes')}</label>}
            <label className="cofein-booking-consent" htmlFor={`${id}-privacyConsent`}><input id={`${id}-privacyConsent`} type="checkbox" name="privacyConsent" checked={contact.privacyConsent} required onChange={event => updateContact('privacyConsent', event.target.checked)} aria-labelledby={`${id}-privacyConsent-label`} aria-invalid={Boolean(fieldErrors.privacyConsent)} aria-describedby={fieldErrors.privacyConsent ? `${id}-privacyConsent-error` : undefined} /><span><span id={`${id}-privacyConsent-label`}>Съгласен/съгласна съм Cofein да използва данните ми за тази резервация.</span>{fieldError('privacyConsent')}</span></label>
          </fieldset>
          <p className="cofein-booking-help">Ще видите потвърждение след изпращането. Ако е нужна проверка по имейл, ще Ви покажем следващата стъпка.</p>
        </form>}
      </>}
    </div>
    {!finished && setup.status === 'ready' && <footer className="cofein-booking-footer">
      <div className="cofein-booking-footer-summary" aria-live="polite"><strong>{step === 'visit' ? guestsLabel(guests) : selected ? choiceLabel(selected) : 'Изберете свободна маса'}</strong><span>{step === 'visit' ? `${dateLabel(date)}${time ? ` · ${time}` : ''}` : `${guestsLabel(guests)} · ${time}`}</span></div>
      {step === 'visit' ? <button key="visit" type="submit" form={`${id}-visit-form`} className="cofein-booking-primary" disabled={!isSearchValid}>Покажи масите <span aria-hidden="true">→</span></button>
        : step === 'table' ? <button key="table" type="button" className="cofein-booking-primary" disabled={!canContinue} onClick={showContact}>Продължи <span aria-hidden="true">→</span></button>
          : <button key="contact" type="submit" form={`${id}-contact-form`} className="cofein-booking-primary" disabled={submitting || !canContinue}>{submitting ? <><span className="cofein-booking-spinner" />Изпращаме…</> : <>Резервирай маса <span aria-hidden="true">→</span></>}</button>}
    </footer>}
  </section>;
}
