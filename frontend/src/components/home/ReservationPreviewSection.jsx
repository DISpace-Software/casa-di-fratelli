export default function ReservationPreviewSection({ t, onOpenReservation }) {
  return (
    <section id="reservation" className="mx-auto max-w-7xl px-6 py-24">
      <div className="grid gap-6 md:grid-cols-[0.85fr_1.15fr]">
        <div className="reservation-preview-panel luxury-panel reveal-up rounded-[28px] p-8 md:p-10">
          <p className="section-kicker">
            {t.reservationTag}
          </p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#fff4df] md:text-5xl">
            {t.reservationTitle}
          </h2>
          <p className="mt-5 max-w-md leading-8 text-stone-300">
            {t.reservationText}
          </p>

          <div className="mt-8 space-y-3 text-stone-300">
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <span className="font-semibold text-white">{t.address}:</span>{" "}
              ж.к. Христо Смирненски Западен, Vechernica 9, 4000 Пловдив
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <span className="font-semibold text-white">{t.phone}:</span>{" "}
              088 821 8318
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <span className="font-semibold text-white">{t.hours}:</span>{" "}
              {t.hoursValue}
            </div>
          </div>
        </div>

        <div className="reservation-photo-card reveal-up relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0d1511] p-3 shadow-2xl shadow-black/30">
          <img
            src="/restaurant-interior.webp"
            alt="Restaurant table"
            className="absolute inset-0 h-full w-full scale-[1.03] object-cover opacity-40 blur-[1px]"
          />
          <div className="relative rounded-[22px] border border-white/10 bg-black/45 p-6 backdrop-blur-md md:p-8">
            <div className="mb-4 inline-flex rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-xs uppercase tracking-[0.24em] text-amber-200">
              VIP Booking UX
            </div>

            <h3 className="text-2xl font-semibold text-[#fff4df]">{t.reservationMapTitle}</h3>
            <p className="mt-4 leading-8 text-stone-300">{t.reservationMapText}</p>

            <div className="mt-6 grid gap-3">
              <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {t.smokingSection}
              </div>
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                {t.familySection}
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                {t.terraceSection}
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenReservation}
              className="luxury-button mt-8 w-full rounded-full px-6 py-4 font-semibold"
            >
              {t.openTableMap}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
