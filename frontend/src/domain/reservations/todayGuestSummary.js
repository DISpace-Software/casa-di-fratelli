import { isHallBlock } from './hallBlockRules.js';

/** Count people, not tables. A late arrival remains expected until staff release
 * or mark the booking no-show; elapsed start time alone does not finish a visit. */
export function todayGuestSummary(reservations, now = new Date(), timeZone = 'Europe/Sofia') {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type).value;
  const today = `${value('year')}-${value('month')}-${value('day')}`;
  return reservations.reduce((summary, reservation) => {
    if (String(reservation.reservedDate).slice(0, 10) !== today ||
        !['Pending', 'Approved'].includes(reservation.status) ||
        reservation.isNoShow || reservation.hasCompletedVisit || reservation.isDeleted ||
        isHallBlock(reservation)) return summary;
    const guests = Number(reservation.guestCount);
    return {
      guests: summary.guests + (Number.isFinite(guests) && guests > 0 ? guests : 0),
      reservations: summary.reservations + 1,
    };
  }, { guests: 0, reservations: 0 });
}
