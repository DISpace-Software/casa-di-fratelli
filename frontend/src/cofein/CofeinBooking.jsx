import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import CofeinBrand from './CofeinBrand.jsx';
import { BookingError, bookingErrorMessage, bookingTimes, createCofeinBookingApi, restaurantClock, validBookingSearch } from './bookingApi.js';
import { CONTACT_LIMITS, validateBookingContact } from './bookingForm.js';
import { cofeinContact } from './contact.js';
import { getAttempt, startAttempt, clearAttempt, isDefinitiveBookingFailure } from './bookingAttempt.js';
import { getMapSelectionOptions, getMapSelectionOption } from './bookingMapSelection.js';
import CofeinMapExplorer from '../components/floorplan/CofeinMapExplorer.jsx';
import CofeinMapPreview from '../components/floorplan/CofeinMapPreview.jsx';
import CofeinVisitControls from './CofeinVisitControls.jsx';
import { getCofeinMapGeometry, getCofeinBookingViews, cofeinViewLabel } from '../domain/floorPlans/cofeinGeometry.js';
import './cofein-booking.css';

const choiceLabel = option => option.tableIds.length === 1 ? `Маса ${option.tableIds[0]}` : `${option.tableIds.length} маси заедно`;
const dateLabel = date => date.split('-').reverse().join('.');
const guestsLabel = guests => `${guests} ${guests === 1 ? 'гост' : 'гости'}`;
const EMPTY_CONTACT = { guestName: '', phone: '', email: '', notes: '', privacyConsent: false };

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
  const [mapView, setMapView] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [step, setStep] = useState('workspace');
  const [editingVisit, setEditingVisit] = useState(true);
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
  const mapHeadingRef = useRef(null);
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
            setStep('workspace'); setEditingVisit(true);
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
    if (step === 'workspace' && !editingVisit && !finished) mapHeadingRef.current?.focus({ preventScroll: true });
    else if (step === 'contact' || finished) headingRef.current?.focus({ preventScroll: true });
  }, [step, finished, editingVisit]);

  const current = availability.key === searchKey && isSearchValid ? availability.data : null;
  // A background refresh doesn't erase still-valid data; a failed or expired check does.
  const fresh = Boolean(current && availability.status !== 'error' && Date.now() - current.checkedAt < 45000);
  const selected = current?.options.find(option => option.key === selectedKey);
  const displayPlan = current?.plan || plan;
  const zones = useMemo(() => displayPlan?.zones.filter(zone => zone.isActive) || [], [displayPlan]);
  const openZones = current ? current.closed ? [] : current.zones : zones;
  const activeArea = zones.some(zone => zone.id === area) ? area : openZones[0]?.id || zones[0]?.id || '';
  const mapGeometry = useMemo(() => getCofeinMapGeometry(displayPlan?.zones || [], displayPlan?.tables || []), [displayPlan]);
  const mapTables = useMemo(() => {
    const zoneIds = new Set(zones.map(zone => zone.id));
    return displayPlan?.tables.filter(table => table.isActive && zoneIds.has(table.area)) || [];
  }, [displayPlan, zones]);
  const zoneName = areaId => zones.find(zone => zone.id === areaId)?.names?.bg || zones.find(zone => zone.id === areaId)?.name || '';
  const options = useMemo(() => fresh ? current.options.filter(option => option.area === activeArea) : [], [fresh, current, activeArea]);
  const mapOptions = useMemo(() => getMapSelectionOptions(options, activeArea), [options, activeArea]);
  const views = useMemo(() => getCofeinBookingViews(mapGeometry, activeArea, mapTables), [mapGeometry, activeArea, mapTables]);
  const activeView = views.find(view => view.id === mapView) || views[0];
  const zoneCounts = useMemo(() => fresh ? Object.fromEntries(zones.map(zone => [zone.id, current.options.filter(option => option.area === zone.id).length])) : null, [fresh, current, zones]);
  const tableStates = useMemo(() => {
    const occupied = new Set(current?.unavailable || []);
    const open = new Set(current?.zones.map(zone => zone.id) || []);
    return Object.fromEntries(mapTables.map(table => {
      const closed = fresh && (current.closed || !open.has(table.area));
      const unavailable = occupied.has(table.id.toLowerCase());
      const option = getMapSelectionOption(mapOptions, table.id, selectedKey);
      const suitable = Boolean(option);
      return [table.id, { status: !fresh ? 'unknown' : closed || unavailable || !suitable ? 'unavailable' : 'available', selectable: fresh && suitable && !closed && !unavailable && !submitting,
        label: !fresh ? 'Очаква проверка' : closed ? 'Залата е затворена' : unavailable ? 'Заета' : !suitable ? 'Не е подходяща за избрания брой гости' : option.tableIds.length > 1 ? `Свободна в комбинация от ${option.tableIds.length} маси` : 'Свободна' }];
    }));
  }, [mapTables, mapOptions, selectedKey, current, fresh, submitting]);
  const canContinue = Boolean(selected && selected.area === activeArea && fresh && isSearchValid);
  const canExplore = Boolean(isSearchValid && activeArea && (!fresh || (!current.closed && openZones.some(zone => zone.id === activeArea))));
  const telephone = policy?.phone?.replace(/[^+\d]/g, '') || cofeinContact.telephone;
  const phoneLabel = policy?.phone || cofeinContact.phone;

  const goTo = useCallback(value => {
    if (submitLock.current) return;
    setStep(value);
    if (value === 'workspace') setEditingVisit(false);
  }, []);
  function chooseArea(value) {
    if (value === activeArea) return;
    setArea(value);
    setMapView('');
    setSelectedKey('');
    setSubmission({ status: 'idle', error: '', result: null });
  }
  function changeMapView(value) { if (views.some(view => view.id === value)) setMapView(value); }
  function changeSearch(field, value) {
    setSearch(previous => ({ ...previous, [field]: value, ...(field === 'date' && value !== date ? { time: '' } : {}) }));
    setSelectedKey('');
    setSubmission({ status: 'idle', error: '', result: null });
    setAvailability({ status: 'idle', key: '', data: null, error: null });
  }
  function selectOption(option) {
    if (!fresh || Date.now() - current.checkedAt >= 45000 || submitting || !option || option.area !== activeArea) return;
    setSelectedKey(option.key);
    setSubmission({ status: 'idle', error: '', result: null });
  }
  function showTables(event) {
    event?.preventDefault();
    if (!canExplore) return;
    setEditingVisit(false);
    bodyRef.current?.scrollTo({ top: 0 });
  }
  function editVisit() { setEditingVisit(true); bodyRef.current?.scrollTo({ top: 0 }); }
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
      const option = data.options.find(item => item.key === selectedKey && item.area === activeArea);
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
          setStep('workspace'); setEditingVisit(true);
          setAvailability({ status: 'error', key: searchKey, data: null, error });
        } else if (error.status === 409) {
          setSelectedKey('');
          setAvailability({ status: 'error', key: searchKey, data: null, error });
          setStep('workspace'); setEditingVisit(false);
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
    : step === 'workspace' ? 'Резервирайте маса' : 'На чие име да запазим?';
  const inputProps = field => ({ id: `${id}-${field}`, name: field, value: contact[field], onChange: event => updateContact(field, event.target.value), onBlur: () => blurContact(field), 'aria-labelledby': `${id}-${field}-label`, 'aria-invalid': Boolean(fieldErrors[field]), 'aria-describedby': fieldErrors[field] ? `${id}-${field}-error` : undefined });
  const fieldError = field => fieldErrors[field] && <span className="cofein-field-error" id={`${id}-${field}-error`}>{fieldErrors[field]}</span>;
  const loading = setup.status === 'loading';
  const blockedSetup = !api.enabled || setup.status === 'error';
  const areaTitle = zoneName(activeArea);
  const visitSummary = `${dateLabel(date)}${time ? ` · ${time}` : ''} · ${guestsLabel(guests)}`;
  const availabilityText = !isSearchValid ? 'Изберете час и брой гости' : availability.status === 'error' ? 'Проверката се забави' : !fresh ? 'Проверяваме местата…' : current.closed ? 'Заведението е затворено за тази дата' : !openZones.some(zone => zone.id === activeArea) ? 'Залата е затворена' : `${options.length} ${options.length === 1 ? 'свободен вариант' : 'свободни варианта'}`;
  const retryAvailability = () => { setNow(new Date()); setRefresh(value => value + 1); };

  return <section className="cofein-booking" data-step={finished ? 'result' : loading || blockedSetup ? 'notice' : step} data-editing-visit={editingVisit} aria-busy={submitting || loading}>
    <div className="cofein-booking-body" ref={bodyRef}>
      <header className="cofein-booking-heading">
        <h2 id="dialog-title" ref={headingRef} tabIndex={-1}>{title}</h2>
        {!finished && setup.status === 'ready' && <ol className="cofein-booking-progress" aria-label="Стъпки за резервация">
          <li aria-current={step === 'workspace' ? 'step' : undefined}><span>1</span> Маса</li><li aria-current={step === 'contact' ? 'step' : undefined}><span>2</span> Вашите данни</li>
        </ol>}
        <p id="dialog-description" className="cofein-booking-sr">{finished ? 'COFEIN · Вашата резервация' : step === 'workspace' ? 'Изберете посещение и зала, след това маса. Всяка част от картата принадлежи на избраната зала.' : 'Добавете име и контакт, за да завършите резервацията.'}</p>
      </header>
      {loading && !finished && <div className="cofein-booking-loading" role="status"><span className="cofein-booking-spinner" />Подготвяме свободните места…</div>}
      {blockedSetup && !finished && <div className="cofein-booking-empty" role="status"><BookingIcon kind="phone" /><h3>{!api.enabled || setup.error?.kind === 'configuration' ? 'Резервация по телефона' : 'Връзката се забави'}</h3>
        <p>{!api.enabled || setup.error?.kind === 'configuration' ? <>Онлайн резервациите предстоят. За маса се свържете с екипа на <CofeinBrand compact />.</> : bookingErrorMessage(setup.error)}</p>
        <a className="cofein-booking-primary" href={`tel:${telephone}`}><BookingIcon kind="phone" />{phoneLabel}</a>
        {api.enabled && <button className="cofein-booking-secondary" type="button" onClick={retrySetup}>Опитай отново</button>}
      </div>}
      {finished && <div className="cofein-booking-result">
        <div className="cofein-booking-result-icon"><BookingIcon kind={submission.status === 'unknown' ? 'phone' : 'check'} /></div>
        <p role="status">{submission.status === 'unknown' ? <>Не получихме потвърждение от системата. Възможно е резервацията да е записана. Свържете се с <CofeinBrand compact />, преди да изпратите нова.</> : submission.result?.status === 'Approved' ? 'Резервацията Ви е потвърдена.' : 'Изпратихме линк на посочения имейл. Отворете го, за да потвърдите резервацията. Проверете и папката „Спам“.'}</p>
        {submission.result && <><p className="cofein-booking-reference">Резервация №{submission.result.id}</p><dl className="cofein-booking-receipt">
          <div><dt>Кога</dt><dd>{dateLabel(submission.result.reservedDate)} · {submission.result.reservedTime}</dd></div>
          <div><dt>Гости</dt><dd>{guestsLabel(submission.result.guestCount)}</dd></div>
          <div><dt>Къде</dt><dd>{submission.result.zoneName}<br />Маса {submission.result.tableIds.join(' + ')}</dd></div>
        </dl></>}
        {submission.status === 'unknown' && <>
          {telephone && <a className="cofein-booking-primary" href={`tel:${telephone}`}><BookingIcon kind="phone" />{phoneLabel}</a>}
          <label className="cofein-booking-consent cofein-unknown-consent"><input name="checkedWithTeam" type="checkbox" checked={checkedWithTeam} onChange={event => setCheckedWithTeam(event.target.checked)} /><span>Проверих с екипа и трябва да направя нова резервация.</span></label>
          <button type="button" className="cofein-booking-secondary" disabled={!checkedWithTeam} onClick={() => { clearAttempt(); setCheckedWithTeam(false); setSubmission({ status: 'idle', error: '', result: null }); setSelectedKey(''); setStep('workspace'); setEditingVisit(true); setRefresh(value => value + 1); }}>Нова резервация след проверка</button>
        </>}
        {onClose && <button className={submission.status === 'unknown' ? 'cofein-booking-text-button' : 'cofein-booking-primary'} type="button" onClick={onClose}>Готово</button>}
      </div>}


      {!finished && setup.status === 'ready' && <>
        {submission.error && <p className="cofein-booking-status" role="alert">{submission.error}</p>}
        {step === 'workspace' && <>
          <button type="button" className="cofein-booking-mobile-summary" onClick={editVisit} aria-label="Промени посещението и залата"><BookingIcon kind="calendar" /><span><strong>{areaTitle}</strong><small>{visitSummary}</small></span><span>Промени</span></button>
          <div className="cofein-booking-workspace">
            <div className="cofein-booking-map-column">
              <div className="cofein-booking-map-header"><div><h3 ref={mapHeadingRef} tabIndex={-1}>{areaTitle || 'Вашата маса'}</h3><p role="status">{availabilityText}</p></div>
              </div>
              {!isSearchValid ? <div className="cofein-booking-map-placeholder">
                {activeView && <CofeinMapPreview geometry={mapGeometry} view={activeView} tables={mapTables} />}
                <div><BookingIcon kind="calendar" /><h3>Кога ще ни посетите?</h3><p>Изберете дата, час и гости, за да видите свободните маси в {areaTitle || 'залата'}.</p></div>
              </div> : <>
                {availability.status === 'error' && <div className="cofein-booking-status" role="alert"><p>{bookingErrorMessage(availability.error)}</p><button className="cofein-booking-text-button" type="button" onClick={retryAvailability}>Опитай отново</button></div>}
                  {views.length > 1 && <div className="cofein-booking-sections" role="group" aria-label={`Части на ${areaTitle}`}>
                    {views.map(view => <button type="button" key={view.id} aria-pressed={activeView?.id === view.id} onClick={() => changeMapView(view.id)}>
                      <span className="cofein-booking-section-preview"><CofeinMapPreview geometry={mapGeometry} view={view} tables={mapTables} /></span>
                      <span><strong>{cofeinViewLabel(view, 'bg')}</strong><small>{view.tableIds.length} маси</small></span><span className="cofein-booking-section-check" aria-hidden="true">{activeView?.id === view.id ? '✓' : ''}</span>
                    </button>)}
                  </div>}
                  {activeView ? <CofeinMapExplorer zones={displayPlan.zones} geometryTables={displayPlan.tables} tables={mapTables} states={tableStates} selectedIds={fresh ? selected?.tableIds || [] : []} scopeZoneId={activeArea} hideNavigation viewId={activeView.id} onViewChange={changeMapView}
                    onTableSelect={table => selectOption(getMapSelectionOption(mapOptions, table.id, selectedKey))} /> : <div className="cofein-booking-empty"><p>В тази зала още няма маси за онлайн резервация.</p></div>}
                  <div className="cofein-booking-map-caption"><div className="cofein-booking-legend" aria-label="Легенда"><span>Свободна</span><span>Избрана</span><span>Недостъпна</span></div><span>Увеличете за по-близък изглед</span></div>
                {fresh && !options.length && <div className="cofein-booking-empty"><p>{current.closed ? 'Изберете друга дата за Вашето посещение.' : 'Няма подходяща свободна маса тук. Променете часа или залата.'}</p><button type="button" className="cofein-booking-text-button cofein-booking-mobile-edit" onClick={editVisit}>Промени посещението</button><a href={`tel:${telephone}`}>Обадете ни се</a></div>}
              </>}
            </div>
            <aside className="cofein-booking-visit-panel" aria-label="Данни за посещението"><form onSubmit={showTables}>
              <CofeinVisitControls id={id} date={date} time={time} guests={guests} clock={clock} times={times} now={now} policy={policy} plan={plan} zones={zones} openZones={openZones} area={activeArea} onSearchChange={changeSearch} onAreaChange={chooseArea} telephone={telephone} zoneCounts={zoneCounts} searchValid={isSearchValid} />
            </form></aside>
          </div>
        </>}
        {step === 'contact' && availability.status === 'error' && <div className="cofein-booking-status" role="alert"><p>{bookingErrorMessage(availability.error)}</p><button type="button" className="cofein-booking-text-button" onClick={retryAvailability} disabled={submitting}>Провери отново</button></div>}
        {step === 'contact' && <form id={`${id}-contact-form`} ref={contactFormRef} className="cofein-booking-contact" onSubmit={submit} noValidate>
          <div className="cofein-booking-selection"><BookingIcon /><div><strong>{selected ? choiceLabel(selected) : 'Нужен е нов избор на маса'}</strong><span>{dateLabel(date)} · {time} · {guestsLabel(guests)}</span><span>{selected ? `${zoneName(selected.area)} · ${selected.seats} места` : 'Данните Ви са запазени. Изберете друга свободна маса.'}</span></div><button type="button" onClick={() => goTo('workspace')} disabled={submitting}>Промени</button></div>
          {!canContinue && <p className="cofein-booking-status" role="alert">{selected ? 'Изчакваме актуална проверка на масата. Можете да продължите да попълвате данните.' : 'Тази маса вече не е свободна. Върнете се към масите, за да изберете друга.'}</p>}
          <fieldset disabled={submitting}>
            <legend className="cofein-booking-sr">Данни за контакт</legend>
            <label htmlFor={`${id}-guestName`}><span id={`${id}-guestName-label`}>Име и фамилия</span><input {...inputProps('guestName')} autoComplete="name" placeholder="Напр. Георги Иванов" maxLength={CONTACT_LIMITS.guestName} required />{fieldError('guestName')}</label>
            <div className="cofein-booking-contact-grid"><label htmlFor={`${id}-phone`}><span id={`${id}-phone-label`}>Телефон</span><input {...inputProps('phone')} type="tel" inputMode="tel" autoComplete="tel" placeholder="08… или +359…" maxLength={CONTACT_LIMITS.phone} required />{fieldError('phone')}</label><label htmlFor={`${id}-email`}><span id={`${id}-email-label`}>Имейл</span><input {...inputProps('email')} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="name@example.com" maxLength={CONTACT_LIMITS.email} required />{fieldError('email')}</label></div>
            {!showNotes ? <button className="cofein-booking-note-toggle" type="button" onClick={() => setShowNotes(true)}>＋ Добавете бележка <span>по желание</span></button> : <label htmlFor={`${id}-notes`}><span id={`${id}-notes-label`}>Бележка</span> <span className="cofein-booking-optional">по желание</span><textarea {...inputProps('notes')} rows={2} maxLength={CONTACT_LIMITS.notes} placeholder="Например: ще бъдем с детска количка" />{fieldError('notes')}</label>}
            <label className="cofein-booking-consent" htmlFor={`${id}-privacyConsent`}><input id={`${id}-privacyConsent`} type="checkbox" name="privacyConsent" checked={contact.privacyConsent} required onChange={event => updateContact('privacyConsent', event.target.checked)} aria-labelledby={`${id}-privacyConsent-label`} aria-invalid={Boolean(fieldErrors.privacyConsent)} aria-describedby={fieldErrors.privacyConsent ? `${id}-privacyConsent-error` : undefined} /><span><span id={`${id}-privacyConsent-label`}>Съгласен/съгласна съм <CofeinBrand compact /> да използва данните ми за тази резервация.</span>{fieldError('privacyConsent')}</span></label>
          </fieldset>
          <p className="cofein-booking-help">Ще видите потвърждение след изпращането. Ако е нужна проверка по имейл, ще Ви покажем следващата стъпка.</p>
        </form>}
      </>}
    </div>
    {!finished && setup.status === 'ready' && <footer className="cofein-booking-footer">
      <div className="cofein-booking-footer-summary" aria-live="polite"><strong>{selected ? choiceLabel(selected) : areaTitle || 'Вашето посещение'}</strong><span>{selected ? `${zoneName(selected.area)} · ${guestsLabel(guests)}` : visitSummary}</span></div>
      {step === 'workspace' ? <>
        <button key="mobile-map" type="button" className="cofein-booking-primary cofein-booking-mobile-next" disabled={!canExplore} onClick={showTables}>Виж масите</button>
        <button key="workspace-contact" type="button" className="cofein-booking-primary cofein-booking-continue" disabled={!canContinue} onClick={showContact}>{!isSearchValid ? 'Изберете час' : selected ? 'Вашите данни' : 'Изберете маса'}</button>
      </> : <button key="contact-submit" type="submit" form={`${id}-contact-form`} className="cofein-booking-primary" disabled={submitting || !canContinue}>{submitting ? <><span className="cofein-booking-spinner" />Изпращаме…</> : 'Резервирай маса'}</button>}
    </footer>}
  </section>;
}
