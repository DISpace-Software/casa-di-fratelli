import { useEffect, useId, useRef, useState } from 'react';
import { BookingError, bookingErrorMessage, bookingTimes, createCofeinBookingApi, restaurantClock, validBookingSearch } from './bookingApi.js';
import CofeinMapExplorer from '../components/floorplan/CofeinMapExplorer.jsx';
import { getCofeinMapGeometry, cofeinZoneViewId } from '../domain/floorPlans/cofeinGeometry.js';
import './cofein-booking.css';

const choiceLabel = (option) => `${option.tableIds.length === 1 ? 'Маса' : 'Маси'} ${option.tableIds.join(' + ')}`;
const dateLabel = (date) => date.split('-').reverse().join('.');

export default function CofeinBooking({ onClose }) {
  const [api] = useState(() => createCofeinBookingApi());
  const [setup, setSetup] = useState({ status: api.enabled ? 'loading' : 'disabled', data: null, error: null });
  const [setupAttempt, setSetupAttempt] = useState(0);
  const [search, setSearch] = useState({ date: '', time: '', guests: 2 });
  const [refresh, setRefresh] = useState(0);
  const [availability, setAvailability] = useState({ status: 'idle', key: '', data: null, error: null });
  const [area, setArea] = useState('');
  const [mapView, setMapView] = useState('all');
  const [selectedKey, setSelectedKey] = useState('');
  const [details, setDetails] = useState(false);
  const [contact, setContact] = useState({ guestName: '', phone: '', email: '', notes: '', privacyConsent: false });
  const [submission, setSubmission] = useState({ status: 'idle', error: '', result: null });
  const [now, setNow] = useState(() => new Date());
  const requestId = useRef(0);
  const submitLock = useRef(false);
  const mounted = useRef(false);
  const submitController = useRef(null);
  const contactHeading = useRef(null);
  const resultHeading = useRef(null);
  const id = useId();

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; submitController.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!api.enabled) return;
    const controller = new AbortController();
    api.loadSetup(controller.signal).then((data) => {
      if (!controller.signal.aborted) setSetup({ status: 'ready', data, error: null });
    }).catch((error) => {
      if (!controller.signal.aborted) setSetup({ status: 'error', data: null, error });
    });
    return () => controller.abort();
  }, [api, setupAttempt]);

  useEffect(() => {
    if (!api.enabled) return;
    const update = () => { setNow(new Date()); setRefresh((value) => value + 1); };
    const timer = setInterval(update, 30000);
    window.addEventListener('focus', update);
    return () => { clearInterval(timer); window.removeEventListener('focus', update); };
  }, [api]);

  const policy = setup.data?.policy;
  const plan = setup.data?.plan;
  const clock = policy ? restaurantClock(policy, now) : null;
  const date = search.date || clock?.today || '';
  const time = search.time;
  const guests = search.guests;
  const searchKey = `${date}/${time}/${guests}`;
  const isSearchValid = Boolean(policy && plan && validBookingSearch({ date, time, guests }, policy, plan, now));
  const submitting = submission.status === 'sending';
  const finished = submission.status === 'success' || submission.status === 'unknown';

  useEffect(() => {
    if (!isSearchValid || submitting || finished) return;
    const sequence = ++requestId.current;
    const controller = new AbortController();
    // An asynchronous request owns this state; its generation and signal gate every response.
    Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setAvailability((previous) => ({ status: 'loading', key: searchKey, data: previous.key === searchKey ? previous.data : null, error: null }));
      try {
        const data = await api.loadAvailability({ date, time, guests }, controller.signal);
        if (!controller.signal.aborted && sequence === requestId.current) {
          setAvailability({ status: 'ready', key: searchKey, data, error: null });
          setSelectedKey((key) => data.options.some((option) => option.key === key) ? key : '');
        }
      } catch (error) {
        if (!controller.signal.aborted && sequence === requestId.current) {
          setAvailability({ status: 'error', key: searchKey, data: null, error });
          setSelectedKey('');
        }
      }
    });
    return () => controller.abort();
  }, [api, date, time, guests, searchKey, isSearchValid, refresh, submitting, finished]);

  useEffect(() => { if (details) contactHeading.current?.focus(); }, [details]);
  useEffect(() => { if (finished) resultHeading.current?.focus(); }, [finished]);

  const current = availability.key === searchKey && isSearchValid ? availability.data : null;
  const fresh = Boolean(current && availability.status === 'ready' && Date.now() - current.checkedAt < 45000);
  const selected = current?.options.find((option) => option.key === selectedKey);
  const displayPlan = current?.plan || plan;
  const mapZones = displayPlan?.zones.filter((zone) => zone.isActive) || [];
  const mapGeometry = getCofeinMapGeometry(displayPlan?.zones || [], displayPlan?.tables || []);
  const activeArea = mapZones.some((zone) => zone.id === area) ? area : '';
  const mapTables = displayPlan?.tables.filter((table) => table.isActive && mapZones.some((zone) => zone.id === table.area)) || [];
  const zoneName = (areaId) => mapZones.find((zone) => zone.id === areaId)?.names?.bg || mapZones.find((zone) => zone.id === areaId)?.name || '';
  const options = fresh ? current.options.filter((option) => !activeArea || option.area === activeArea) : [];
  const tableStates = Object.fromEntries(mapTables.map((table) => {
    const option = fresh && current.options.find((item) => item.tableIds.length === 1 && item.tableIds[0] === table.id);
    const occupied = fresh && current.unavailable.includes(table.id.toLowerCase());
    const closed = fresh && (current.closed || !current.zones.some((zone) => zone.id === table.area));
    return [table.id, {
      status: !fresh ? 'unknown' : occupied || closed || !option ? 'unavailable' : 'available',
      selectable: Boolean(option) && !submitting,
      label: !fresh ? 'Изберете дата и час за проверка' : closed ? 'Не приема резервации за този час' : occupied ? 'Заета' : !option ? 'Не е подходяща самостоятелно за тази компания' : 'Свободна',
    }];
  }));

  function selectOption(option) {
    if (!fresh || submitting || !option) return;
    setSelectedKey(option.key);
    setSubmission({ status: 'idle', error: '', result: null });
  }

  function changeMapView(value) {
    setMapView(value);
    setArea(mapGeometry.views[value]?.zoneId || '');
  }

  function changeSearch(field, value) {
    setSearch((previous) => ({ ...previous, [field]: value, ...(field === 'date' ? { time: '' } : {}) }));
    setSelectedKey('');
    setDetails(false);
    setSubmission({ status: 'idle', error: '', result: null });
    setAvailability({ status: 'idle', key: '', data: null, error: null });
  }

  function retrySetup() {
    setSetup({ status: 'loading', data: null, error: null });
    setSetupAttempt((value) => value + 1);
  }

  async function submit(event) {
    event.preventDefault();
    if (submitLock.current || !selected || !fresh || !isSearchValid) return;
    if (contact.guestName.trim().length < 2 || contact.phone.replace(/\D/g, '').length < 6 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) || !contact.privacyConsent) {
      setSubmission({ status: 'idle', error: 'Попълнете име, валиден телефон и имейл и потвърдете съгласието си.', result: null });
      return;
    }
    submitLock.current = true;
    const controller = new AbortController();
    submitController.current = controller;
    ++requestId.current;
    setSubmission({ status: 'sending', error: '', result: null });
    let postStarted = false;
    try {
      const data = await api.loadAvailability({ date, time, guests }, controller.signal);
      const option = data.options.find((item) => item.key === selectedKey);
      if (!option) throw new BookingError('http', 409);
      if (!mounted.current) return;
      setAvailability({ status: 'ready', key: searchKey, data, error: null });
      const payload = {
        guestName: contact.guestName.trim(), phone: contact.phone.trim(), email: contact.email.trim(), notes: contact.notes.trim(),
        reservedDate: date, reservedTime: time, guestCount: guests, area: option.area, tableIds: option.tableIds,
        privacyConsent: true, marketingConsent: false,
      };
      postStarted = true;
      const result = await api.create(payload, controller.signal);
      if (mounted.current) setSubmission({ status: 'success', error: '', result: { ...result, zoneName: data.zones.find((zone) => zone.id === option.area)?.names?.bg || data.zones.find((zone) => zone.id === option.area)?.name || '' } });
    } catch (error) {
      if (!mounted.current || controller.signal.aborted) return;
      // Without server idempotency, a lost POST response must never encourage a duplicate booking.
      if (postStarted && (error.kind !== 'http' || error.status >= 500 || error.status === 408)) {
        setSubmission({ status: 'unknown', error: '', result: null });
      } else {
        setSubmission({ status: 'idle', error: bookingErrorMessage(error), result: null });
        setAvailability({ status: 'error', key: searchKey, data: null, error });
        setSelectedKey('');
        setDetails(false);
      }
    } finally {
      submitLock.current = false;
      submitController.current = null;
    }
  }

  const closeButton = onClose && <button className="cofein-booking-primary" type="button" onClick={onClose}>Разбрах</button>;

  if (!api.enabled || (setup.status === 'error' && setup.error?.kind === 'configuration')) {
    return <section className="cofein-booking cofein-booking-notice">
      <p className="cofein-booking-kicker">COFEIN · РЕЗЕРВАЦИИ</p>
      <h2 id="dialog-title">Онлайн резервации.<br /><span>Предстои.</span></h2>
      <p id="dialog-description">Подготвяме възможността да изберете своята маса онлайн. В момента през сайта не се приемат резервации.</p>
      {api.enabled && <button className="cofein-booking-secondary" type="button" onClick={retrySetup}>Провери отново</button>}
      {closeButton}
    </section>;
  }

  if (finished) {
    const result = submission.result;
    const approved = result?.status === 'Approved';
    return <section className="cofein-booking cofein-booking-notice">
      <p className="cofein-booking-kicker">COFEIN · {result ? `РЕЗЕРВАЦИЯ №${result.id}` : 'СТАТУС НА РЕЗЕРВАЦИЯТА'}</p>
      <h2 id="dialog-title" ref={resultHeading} tabIndex={-1}>{submission.status === 'unknown' ? 'Нужна е проверка.' : approved ? 'Масата Ви очаква.' : 'Потвърдете по имейл.'}</h2>
      <p id="dialog-description" role="status">{submission.status === 'unknown'
        ? 'Връзката прекъсна при изпращането. Не можем да потвърдим дали резервацията е записана. Свържете се с Cofein, преди да изпратите нова резервация.'
        : approved ? 'Резервацията Ви е потвърдена.' : 'Резервацията очаква потвърждение. Проверете имейла, който посочихте, и следвайте изпратения линк.'}</p>
      {result && <dl className="cofein-booking-receipt">
        <div><dt>Дата и час</dt><dd>{dateLabel(result.reservedDate)} · {result.reservedTime}</dd></div>
        <div><dt>Гости</dt><dd>{result.guestCount}</dd></div>
        <div><dt>Място</dt><dd>{result.zoneName} · {result.tableIds.join(' + ')}</dd></div>
      </dl>}
      {submission.status === 'unknown' && policy?.phone && <a className="cofein-booking-secondary" href={`tel:${policy.phone.replace(/[^+\d]/g, '')}`}>{policy.phone}</a>}
      {closeButton}
    </section>;
  }

  return <section className="cofein-booking" aria-busy={submitting || setup.status === 'loading'}>
    <header className="cofein-booking-heading">
      <p className="cofein-booking-kicker">COFEIN · РЕЗЕРВАЦИИ</p>
      <h2 id="dialog-title">Вашето място.<br /><span>Вашият момент.</span></h2>
      <p id="dialog-description">Изберете дата, час и свободна маса.</p>
    </header>
    {setup.status === 'loading' && <p className="cofein-booking-status" role="status">Зареждаме информацията за резервации…</p>}
    {setup.status === 'error' && <div className="cofein-booking-status" role="alert"><p>{bookingErrorMessage(setup.error)}</p><button className="cofein-booking-secondary" type="button" onClick={retrySetup}>Опитай отново</button></div>}
    {setup.status === 'ready' && <>
      <ol className="cofein-booking-steps" aria-label="Стъпки за резервация">
        <li aria-current={!isSearchValid ? 'step' : undefined}><span>01</span> Кога</li>
        <li aria-current={isSearchValid && !details ? 'step' : undefined}><span>02</span> Маса</li>
        <li aria-current={details ? 'step' : undefined}><span>03</span> Вашите данни</li>
      </ol>
      <fieldset className="cofein-booking-search" disabled={submitting}>
        <legend className="cofein-booking-sr">Дата, час и брой гости</legend>
        <label htmlFor={`${id}-date`}>Дата<input id={`${id}-date`} type="date" min={clock.today} max={clock.lastDate} value={date} onChange={(event) => changeSearch('date', event.target.value)} required /></label>
        <label htmlFor={`${id}-time`}>Час<select id={`${id}-time`} value={time} onChange={(event) => changeSearch('time', event.target.value)} required>
          <option value="">Изберете час</option>{bookingTimes(policy, date, now).map((slot) => <option key={slot} value={slot}>{slot}</option>)}
        </select></label>
        <label htmlFor={`${id}-guests`}>Гости<select id={`${id}-guests`} value={guests} onChange={(event) => changeSearch('guests', Number(event.target.value))}>
          {Array.from({ length: plan.publicMaxGuests }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1} {index === 0 ? 'гост' : 'гости'}</option>)}
        </select></label>
      </fieldset>
      <p className="cofein-booking-help">До {policy.maxDays} дни напред · поне {policy.leadMinutes} минути преди часа · местно време за заведението.</p>
      {bookingTimes(policy, date, now).length === 0 && <p className="cofein-booking-status" role="status">За тази дата няма оставащи часове за онлайн резервация. Изберете друга дата.</p>}
      {time && !isSearchValid && <p className="cofein-booking-status" role="alert">Избраният час вече не е достъпен. Изберете отново дата и час.</p>}
      <div className="cofein-booking-live" aria-live="polite" aria-atomic="true">
        {isSearchValid && availability.status === 'loading' && 'Проверяваме актуалната наличност…'}
        {isSearchValid && availability.status === 'error' && bookingErrorMessage(availability.error)}
        {fresh && !current.options.length && (current.closed ? 'За тази дата заведението не приема резервации.' : 'Няма свободна маса за избрания час и брой гости. Опитайте друг час или дата.')}
        {fresh && current.options.length > 0 && `${current.options.length} възможности за Вашата компания.`}
      </div>
      {isSearchValid && <button className="cofein-booking-refresh" type="button" disabled={submitting || availability.status === 'loading'} onClick={() => setRefresh((value) => value + 1)}>Обнови наличността ↻</button>}
      {!details && <div className="cofein-booking-tables">
        <div className="cofein-booking-map-heading"><div><p className="cofein-booking-kicker">ПРОСТРАНСТВАТА НА COFEIN</p><h3>Изберете своята маса</h3></div><span>{mapZones.length} {mapZones.length === 1 ? 'пространство' : 'пространства'}</span></div>
        <div className="cofein-booking-map-layout">
          <div className="cofein-booking-map-column">
            <CofeinMapExplorer zones={displayPlan?.zones || []} geometryTables={displayPlan?.tables || []} tables={mapTables} states={tableStates} selectedIds={fresh ? selected?.tableIds || [] : []} viewId={mapView} onViewChange={changeMapView}
              onTableSelect={(table) => selectOption(current?.options.find((item) => item.tableIds.length === 1 && item.tableIds[0] === table.id))} />
            <div className="cofein-booking-legend" aria-label="Легенда"><span>Свободна</span><span>Избрана</span><span>Недостъпна</span><span>Без проверка</span></div>
          </div>
          <aside className="cofein-booking-choice" aria-label="Вашият избор">
            <p className="cofein-booking-kicker">ВАШИЯТ ИЗБОР</p>
            {selected && fresh ? <><h3>{selected.tableIds.join(' + ')}</h3><p>{zoneName(selected.area)}</p><p>{selected.seats} места</p><p className="cofein-booking-choice-time">{dateLabel(date)} · {time}<br />{guests} {guests === 1 ? 'гост' : 'гости'}</p></>
              : <><h3>Място за Вас.</h3><p>{!isSearchValid ? 'Изберете дата, час и брой гости, за да проверим свободните маси.' : !fresh ? 'Изчакваме актуалната наличност.' : current.options.length ? 'Докоснете свободна маса на картата или изберете от списъка.' : 'Опитайте друг час, дата или брой гости.'}</p></>}
            <button className="cofein-booking-primary" type="button" disabled={!selected || !fresh || submitting} onClick={() => { if (selected && fresh && !submitting) setDetails(true); }}>Продължи <span aria-hidden="true">↗</span></button>
            <p className="cofein-booking-help">Местата са ориентировъчни. Масите не се обединяват автоматично.</p>
          </aside>
        </div>
        <details className="cofein-booking-list">
          <summary>Избор от списък{fresh && <span>{options.length} {options.length === 1 ? 'възможност' : 'възможности'}</span>}</summary>
          <label className="cofein-booking-zone" htmlFor={`${id}-zone`}>Пространство<select id={`${id}-zone`} value={activeArea} onChange={(event) => { setArea(event.target.value); setMapView(event.target.value ? cofeinZoneViewId(event.target.value) : 'all'); }}>
            <option value="">Всички пространства</option>{mapZones.map((zone) => <option key={zone.id} value={zone.id}>{zone.names?.bg || zone.name}</option>)}
          </select></label>
          <div className="cofein-booking-options" role="group" aria-label="Свободни маси и комбинации">
            {options.map((option) => <button type="button" key={option.key} aria-pressed={selectedKey === option.key} disabled={submitting} onClick={() => selectOption(option)}>
              <span>{choiceLabel(option)}</span><span>{option.seats} места</span>
            </button>)}
            {!options.length && <p className="cofein-booking-help">{!fresh ? 'Първо изберете дата и час за проверка.' : 'Няма подходяща свободна маса в това пространство.'}</p>}
          </div>
        </details>
      </div>}
      {details && <form className="cofein-booking-contact" onSubmit={submit}>
        <div className="cofein-booking-contact-heading"><h3 ref={contactHeading} tabIndex={-1}>Вашите данни</h3><button type="button" className="cofein-booking-refresh" disabled={submitting} onClick={() => setDetails(false)}>Назад към масите</button></div>
        <p className="cofein-booking-selection">{dateLabel(date)} · {time} · {guests} {guests === 1 ? 'гост' : 'гости'}{selected && <> · {zoneName(selected.area)} · {choiceLabel(selected)}</>}</p>
        {!selected && <p className="cofein-booking-status" role="alert">Избраната маса вече не е достъпна. Върнете се към масите, за да изберете отново.</p>}
        <fieldset disabled={submitting}>
          <legend className="cofein-booking-sr">Данни за контакт</legend>
          <label htmlFor={`${id}-name`}>Име и фамилия<input id={`${id}-name`} name="guestName" autoComplete="name" value={contact.guestName} minLength={2} maxLength={120} required onChange={(event) => setContact({ ...contact, guestName: event.target.value })} /></label>
          <div className="cofein-booking-contact-grid">
            <label htmlFor={`${id}-phone`}>Телефон<input id={`${id}-phone`} name="phone" type="tel" autoComplete="tel" value={contact.phone} maxLength={30} required onChange={(event) => setContact({ ...contact, phone: event.target.value })} /></label>
            <label htmlFor={`${id}-email`}>Имейл<input id={`${id}-email`} name="email" type="email" autoComplete="email" value={contact.email} maxLength={180} required onChange={(event) => setContact({ ...contact, email: event.target.value })} /></label>
          </div>
          <label htmlFor={`${id}-notes`}>Бележка <span className="cofein-booking-optional">по желание</span><textarea id={`${id}-notes`} name="notes" value={contact.notes} rows={2} maxLength={1000} onChange={(event) => setContact({ ...contact, notes: event.target.value })} /></label>
          <label className="cofein-booking-consent" htmlFor={`${id}-consent`}><input id={`${id}-consent`} type="checkbox" name="privacyConsent" checked={contact.privacyConsent} required onChange={(event) => setContact({ ...contact, privacyConsent: event.target.checked })} /><span>Съгласен/съгласна съм Cofein да обработи данните ми за целите на тази резервация.</span></label>
        </fieldset>
        <button className="cofein-booking-primary" type="submit" disabled={submitting || !selected || !fresh || !isSearchValid}>{submitting ? 'Проверяваме и изпращаме…' : 'Резервирай маса'} <span aria-hidden="true">↗</span></button>
        <p className="cofein-booking-help">Резервацията е завършена, когато получите потвърждение на следващия екран.</p>
      </form>}
      {submission.error && <p className="cofein-booking-status" role="alert">{submission.error}</p>}
    </>}
  </section>;
}
