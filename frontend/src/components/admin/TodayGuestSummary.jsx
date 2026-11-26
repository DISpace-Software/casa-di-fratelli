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
    <div data-today-guest-summary className="min-w-[64px] bg-[#c9a56a]/10 px-2 py-1.5 text-center sm:min-w-[76px] sm:px-2.5 sm:py-2" title={text.hint}>
      <div className="text-[7px] font-bold uppercase tracking-[0.12em] text-[#f2d39a] sm:text-[8px]">{text.title}</div>
      <div className="text-base font-black tabular-nums text-[#fff4df] sm:text-lg" aria-live="polite">{loaded ? summary.guests : '—'}</div>
      <div className="text-[7px] tabular-nums text-white/55 sm:text-[8px]">{text.bookings}: {loaded ? summary.reservations : '—'}</div>
      {stale && <div className="text-[7px] text-orange-300 sm:text-[8px]">{text.stale}</div>}
    </div>
  );
}
