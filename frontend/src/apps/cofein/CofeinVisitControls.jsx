import { bookingTimes } from './bookingApi.js';

const guestsLabel = guests => `${guests} ${guests === 1 ? 'гост' : 'гости'}`;
const zoneLabel = zone => zone.names?.bg || zone.name;
const nextDate = date => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
};

/** Visit controls change booking inputs; camera sections remain a separate concern. */
export default function CofeinVisitControls({
  id, date, time, guests, clock, times, now, policy, plan,
  zones, openZones, area, onSearchChange, onAreaChange,
  telephone, zoneCounts, searchValid,
}) {
  const openIds = new Set(openZones.map(zone => zone.id));
  const tomorrow = nextDate(clock.today);
  const countFor = zoneId => zoneCounts instanceof Map ? zoneCounts.get(zoneId) : zoneCounts?.[zoneId];
  const statusFor = zone => {
    if (!openIds.has(zone.id)) return 'Временно затворена';
    const count = countFor(zone.id);
    if (count == null) return '';
    if (count === 0) return 'Няма свободни варианти';
    return `${count} ${count === 1 ? 'свободен вариант' : 'свободни варианта'}`;
  };

  return <div className="cofein-booking-visit-controls">
    <h3>Вашето посещение</h3>
    <fieldset className="cofein-booking-search">
      <legend className="cofein-booking-sr">Дата, час и брой гости</legend>
      <div className="cofein-booking-date-field">
        <label htmlFor={`${id}-date`}>Дата</label>
        <input id={`${id}-date`} name="reservedDate" type="date" min={clock.today} max={clock.lastDate}
          value={date} onChange={event => onSearchChange('date', event.target.value)} required />
        <div className="cofein-booking-quick-dates" role="group" aria-label="Бърз избор на дата">
          {[[clock.today, 'Днес'], [tomorrow, 'Утре']].map(([value, label]) => <button key={value} type="button"
            aria-pressed={date === value} disabled={value > clock.lastDate || bookingTimes(policy, value, now).length === 0}
            onClick={() => onSearchChange('date', value)}>{label}</button>)}
        </div>
      </div>
      <div className="cofein-booking-search-row">
        <label htmlFor={`${id}-time`}><span id={`${id}-time-label`}>Час</span>
          <select id={`${id}-time`} name="reservedTime" aria-labelledby={`${id}-time-label`} value={time}
            onChange={event => onSearchChange('time', event.target.value)} required>
            <option value="">Изберете</option>
            {time && !times.includes(time) && <option value={time} disabled>{time} · недостъпно</option>}
            {times.map(slot => <option key={slot} value={slot}>{slot}</option>)}
          </select>
        </label>
        <label htmlFor={`${id}-guests`}><span id={`${id}-guests-label`}>Брой гости</span>
          <select id={`${id}-guests`} name="guestCount" aria-labelledby={`${id}-guests-label`} value={guests}
            onChange={event => onSearchChange('guests', Number(event.target.value))}>
            {guests > plan.publicMaxGuests && <option value={guests} disabled>{guestsLabel(guests)} · недостъпно</option>}
            {Array.from({ length: plan.publicMaxGuests }, (_, index) => <option key={index + 1} value={index + 1}>{guestsLabel(index + 1)}</option>)}
          </select>
        </label>
      </div>
    </fieldset>

    {!times.length && <p className="cofein-booking-status" role="status">За тази дата няма оставащи часове. Изберете друга дата.</p>}
    {time && !searchValid && <p className="cofein-booking-status" role="alert">Избраният час или брой гости вече не е достъпен. Проверете избора си.</p>}

    <fieldset className="cofein-booking-halls">
      <legend id={`${id}-hall-label`}>Зала</legend>
      {zones.length <= 4 ? <div className="cofein-booking-hall-options">
        {zones.map(zone => <button type="button" key={zone.id} aria-pressed={area === zone.id}
          disabled={!openIds.has(zone.id)} onClick={() => onAreaChange(zone.id)}>
          <span>{zoneLabel(zone)}{statusFor(zone) && <small>{statusFor(zone)}</small>}</span>
        </button>)}
      </div> : <select name="area" id={`${id}-hall`} aria-labelledby={`${id}-hall-label`} value={area}
        onChange={event => onAreaChange(event.target.value)}>
        {!area && <option value="" disabled>Изберете зала</option>}
        {zones.map(zone => <option key={zone.id} value={zone.id} disabled={!openIds.has(zone.id)}>
          {zoneLabel(zone)}{statusFor(zone) ? ` · ${statusFor(zone)}` : ''}
        </option>)}
      </select>}
      {!openIds.size && <p className="cofein-booking-help" role="status">Няма отворени зали за това посещение. Изберете друга дата или се свържете с нас.</p>}
    </fieldset>
    <p className="cofein-booking-help">Онлайн до {policy.maxDays} дни напред{policy.leadMinutes ? ` · поне ${policy.leadMinutes} мин. преди посещението` : ''}.</p>
    {telephone && <p className="cofein-booking-phone-help">За по-голяма компания <a href={`tel:${telephone}`}>обадете ни се</a>.</p>}
  </div>;
}
