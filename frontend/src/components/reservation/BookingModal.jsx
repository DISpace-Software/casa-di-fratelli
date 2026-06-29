import React from "react";

function localText(language, bg, en, ru = bg) {
  if (language === "en") return en;
  if (language === "ru") return ru;
  return bg;
}

export default function BookingModal({
  t,
  language = "bg",
  selectedTable,
  selectedSection,
  selectedTime,
  sectionLabels,
  onClose,
  onSubmit,
  onOpenPrivacy,
}) {
  const [birthDay, setBirthDay] = React.useState("");
  const [birthMonth, setBirthMonth] = React.useState("");
  const birthdayDays = Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, "0"));
  const birthdayMonthsByLanguage = {
    bg: [
          ["01", "Януари"],
          ["02", "Февруари"],
          ["03", "Март"],
          ["04", "Април"],
          ["05", "Май"],
          ["06", "Юни"],
          ["07", "Юли"],
          ["08", "Август"],
          ["09", "Септември"],
          ["10", "Октомври"],
          ["11", "Ноември"],
          ["12", "Декември"],
        ],
    en: [
          ["01", "January"],
          ["02", "February"],
          ["03", "March"],
          ["04", "April"],
          ["05", "May"],
          ["06", "June"],
          ["07", "July"],
          ["08", "August"],
          ["09", "September"],
          ["10", "October"],
          ["11", "November"],
          ["12", "December"],
        ],
    ru: [
          ["01", "Январь"],
          ["02", "Февраль"],
          ["03", "Март"],
          ["04", "Апрель"],
          ["05", "Май"],
          ["06", "Июнь"],
          ["07", "Июль"],
          ["08", "Август"],
          ["09", "Сентябрь"],
          ["10", "Октябрь"],
          ["11", "Ноябрь"],
          ["12", "Декабрь"],
        ],
  };
  const birthdayMonths = birthdayMonthsByLanguage[language] || birthdayMonthsByLanguage.bg;
  const availableBirthdayMonths = birthdayMonths.filter(([month]) => {
    const selectedDay = Number(birthDay || 0);
    if (!selectedDay) return true;
    const daysInMonth = new Date(2000, Number(month), 0).getDate();
    return selectedDay <= daysInMonth;
  });
  const handleBirthDayChange = (event) => {
    const nextDay = event.target.value;
    setBirthDay(nextDay);

    const monthStillAvailable = birthdayMonths.some(([month]) => {
      if (month !== birthMonth) return false;
      const selectedDay = Number(nextDay || 0);
      if (!selectedDay) return true;
      return selectedDay <= new Date(2000, Number(month), 0).getDate();
    });
    if (!monthStillAvailable) {
      setBirthMonth("");
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-stone-950 p-8 text-stone-100 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-amber-300">
              {t.bookingFormTitle}
            </p>
            <h2 className="mt-3 text-3xl font-semibold">{selectedTable.id}</h2>
            <p className="mt-4 text-stone-300">
              {t.bookingSummary}:{" "}
              <span className="font-semibold text-white">{selectedTable.id}</span> ·{" "}
              {sectionLabels[selectedSection]} · {selectedTime}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-white/15 px-4 py-2 text-sm transition hover:border-amber-300 hover:text-amber-300"
          >
            {t.closeForm}
          </button>
        </div>

        <form onSubmit={onSubmit} className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm text-stone-300">{t.formName}</label>
            <input
              name="guestName"
              required
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-amber-300"
              placeholder={t.placeholderName}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-stone-300">{t.formPhone}</label>
            <input
              name="phone"
              required
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-amber-300"
              placeholder={t.placeholderPhone}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-stone-300">{t.formEmail}</label>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-amber-300"
              placeholder={t.placeholderEmail}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-stone-300">{t.formGuests}</label>
            <select
              name="guestCount"
              required
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-amber-300"
            >
              <option value="">{t.selectGuests}</option>
              <option value="1">{t.one}</option>
              <option value="2">{t.two}</option>
              <option value="3">{t.three}</option>
              <option value="4">{t.four}</option>
              <option value="5">{t.five}</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm text-stone-300">{t.formDate}</label>
            <input
              name="reservedDate"
              type="date"
              required
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-amber-300"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-stone-300">{t.formTime}</label>
            <input
              readOnly
              value={selectedTime}
              className="w-full rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-amber-100 outline-none"
            />
          </div>

          <div className="sm:col-span-2 rounded-[1.5rem] border border-amber-400/25 bg-amber-500/10 p-5">
            <label className="mb-2 block text-sm text-amber-100">
              {localText(language, "Рожден ден (опционално)", "Birthday (optional)", "День рождения (опционально)")}
            </label>
            <div className="grid gap-3 sm:grid-cols-[0.75fr_1.25fr]">
              <select
                name="birthDay"
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none transition focus:border-amber-300"
                value={birthDay}
                onChange={handleBirthDayChange}
              >
                <option value="">{localText(language, "Ден", "Day", "День")}</option>
                {birthdayDays.map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
              <select
                name="birthMonth"
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none transition focus:border-amber-300"
                value={birthMonth}
                onChange={(event) => setBirthMonth(event.target.value)}
              >
                <option value="">{localText(language, "Месец", "Month", "Месяц")}</option>
                {availableBirthdayMonths.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <p className="mt-3 text-sm leading-6 text-amber-100/80">
              {localText(
                language,
                "Само ден и месец, без година. Очаква ви приятен бонус за вашия празник.",
                "Day and month only, no year. A special birthday bonus is waiting for your celebration.",
                "Только день и месяц, без года. Для вашего праздника вас ждёт приятный бонус."
              )}
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-2 block text-sm text-stone-300">
              {t.formRequests}
            </label>
            <textarea
              name="notes"
              rows={4}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-amber-300"
              placeholder={t.placeholderRequests}
            />
          </div>

          <div className="sm:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-4">
            <label className="flex items-start gap-3 text-sm leading-6 text-stone-300">
              <input
                name="marketingConsent"
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-white/20 bg-stone-900"
              />
              <span>
                {localText(
                  language,
                  "Съгласявам се да получавам нови предложения, сезонни менюта и специални оферти от Casa di Fratelli по имейл.",
                  "I agree to receive new offers, seasonal menus, and special promotions from Casa di Fratelli by email.",
                  "Я согласен получать новые предложения, сезонные меню и специальные оферты от Casa di Fratelli по email."
                )}
              </span>
            </label>
          </div>

          <div className="sm:col-span-2 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4">
            <label className="flex items-start gap-3 text-sm leading-6 text-stone-200">
              <input
                name="privacyConsent"
                type="checkbox"
                required
                className="mt-1 h-4 w-4 rounded border-white/20 bg-stone-900"
              />
              <span>
                {localText(
                  language,
                  "Съгласявам се Casa di Fratelli да обработи данните ми за целите на резервацията и приемам ",
                  "I agree that Casa di Fratelli may process my data for this reservation and I accept the ",
                  "Я согласен, что Casa di Fratelli обработает мои данные для резервации, и принимаю "
                )}
                {onOpenPrivacy ? (
                  <button
                    type="button"
                    onClick={onOpenPrivacy}
                    className="font-semibold text-amber-200 underline underline-offset-4 transition hover:text-white"
                  >
                    {localText(language, "Политиката за поверителност", "Privacy Policy", "Политику конфиденциальности")}
                  </button>
                ) : (
                  <a
                    href="/privacy"
                    className="font-semibold text-amber-200 underline underline-offset-4 transition hover:text-white"
                  >
                    {localText(language, "Политиката за поверителност", "Privacy Policy", "Политику конфиденциальности")}
                  </a>
                )}
                .
              </span>
            </label>
          </div>

          <button
            type="submit"
            className="mt-2 w-full rounded-2xl bg-amber-400 px-6 py-4 font-medium text-stone-950 transition hover:scale-[1.01] sm:col-span-2"
          >
            {t.submit}
          </button>
        </form>
      </div>
    </div>
  );
}
