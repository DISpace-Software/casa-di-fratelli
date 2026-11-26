import { useEffect, useState } from 'react';
import { todayGuestSummary } from '../../domain/reservations/todayGuestSummary.js';

const labels = {
  bg: { title: 'Гости днес', bookings: 'Резервации', hint: 'Предстоящи и текущи · без освободените', stale: 'Не е обновено' },
  ru: { title: 'Гостей сегодня', bookings: 'Бронирований', hint: 'Предстоящие и текущие · без завершённых', stale: 'Не обновлено' },
  en: { title: 'Guests today', bookings: 'Reservations', hint: 'Upcoming and current · excluding released', stale: 'Not refreshed' },
};

export default function TodayGuestSummary({ reservations, language, timeZone, loaded, stale }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const text = labels[language] || labels.bg;
  const summary = todayGuestSummary(reservations, now, timeZone);
  return (
    <div data-today-guest-summary className="mb-20 mt-4 self-end rounded-2xl border border-[#f2d39a]/25 bg-[#c9a56a]/10 px-4 py-3 text-right md:absolute md:right-24 md:top-7 md:mt-0 md:mb-0" title={text.hint}>
      <div className="text-xs font-medium text-[#f2d39a]">{text.title}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums leading-none text-[#fff4df]" aria-live="polite">{loaded ? summary.guests : '—'}</div>
      <div className="mt-2 text-xs text-white/65">{text.bookings}: {loaded ? summary.reservations : '—'}</div>
      {stale && <div className="mt-1 text-xs text-orange-300">{text.stale}</div>}
    </div>
  );
}
