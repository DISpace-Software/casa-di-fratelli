import React from "react";
import { API_BASE_URL } from "../../config/api";

const copy = {
  bg: { title: "SeatMap · Предварителни поръчки", intro: "Доброволна услуга с пълно предплащане с карта и месечно разплащане с ресторанта.", enabled: "Разрешено от платформата", commission: "Договорена комисиона (%)", save: "Запази", consent: "Искам ресторантът да приема предварителни поръчки", terms: "Приемам пълното предплащане чрез SeatMap, договорената комисиона и месечното разплащане.", owner: "Само собственикът може да даде съгласие. Програмистът разрешава функцията, но не може да я приеме вместо ресторанта.", notConnected: "Картовите плащания и реалните изплащания още не са свързани. Включването на тази настройка не стартира приемане на плащания.", saved: "Запазено", error: "Неуспешна заявка. Настройката не е запазена.", loading: "Зареждане…", report: "Месечен отчет", gross: "Плащания", fee: "Комисиона", net: "За ресторанта", renewal: "Комисионата е променена. Необходимо е ново съгласие от собственика.", payments: "потвърдени плащания", currency: "EUR" },
  en: { title: "SeatMap · Preorders", intro: "An optional service with full card prepayment and monthly restaurant settlement.", enabled: "Enabled by the platform", commission: "Agreed commission (%)", save: "Save", consent: "I want this restaurant to accept preorders", terms: "I accept full prepayment through SeatMap, the agreed commission and monthly settlement.", owner: "Only the owner can opt in. The developer enables the feature but cannot consent for the restaurant.", notConnected: "Card payments and real payouts are not connected yet. Enabling this setting does not start accepting payments.", saved: "Saved", error: "The request failed. Settings were not saved.", loading: "Loading…", report: "Monthly report", gross: "Payments", fee: "Commission", net: "Restaurant net", renewal: "The commission changed. The owner must accept the new terms.", payments: "confirmed payments", currency: "EUR" },
  ru: { title: "SeatMap · Предзаказы", intro: "Добровольное подключение с полной предоплатой картой и месячными расчётами с рестораном.", enabled: "Разрешено платформой", commission: "Согласованная комиссия (%)", save: "Сохранить", consent: "Хочу подключить предзаказы для ресторана", terms: "Принимаю полную предоплату через SeatMap, согласованную комиссию и месячные расчёты.", owner: "Согласие даёт только собственник. Разработчик включает функцию, но не может принять условия вместо ресторана.", notConnected: "Эквайринг и реальные выплаты ещё не подключены. Включение этой настройки не запускает приём платежей.", saved: "Сохранено", error: "Запрос не выполнен. Настройки не сохранены.", loading: "Загрузка…", report: "Месячный отчёт", gross: "Платежи", fee: "Комиссия", net: "Ресторану", renewal: "Комиссия изменилась. Нужно повторное согласие собственника.", payments: "подтверждённых платежей", currency: "EUR" },
};
const activationCopy = {
  bg: {
    label: "Запазен статус в приложението",
    disabled: "Изключено от платформата",
    waiting: "Очаква съгласие от собственика",
    renewal: "Необходимо е ново съгласие",
    available: "Достъпно в приложението",
    hidden: "Предложението за предварителна поръчка още не се показва на гостите.",
    drafts: "Само неплатени чернови · плащането с карта е недостъпно",
    availableStep: "След нова резервация гостите виждат предложение да изберат ястия и напитки от менюто.",
    developer: {
      disabled: "Включете разрешението от платформата по-долу и запазете. За достъп в приложението е необходимо и съгласие от собственика.",
      waiting: "Собственикът трябва да отвори „Профил → SeatMap · Предварителни поръчки“, да избере включване, да приеме комисионата {commission} и условията и да запази.",
      renewal: "Собственикът трябва отново да приеме комисионата {commission} и текущите условия в „Профил → SeatMap · Предварителни поръчки“ и да запази.",
    },
    owner: {
      disabled: "Програмистът трябва да разреши услугата в „DEV управление → Услуги и комисиони“. Достъпът в приложението изисква и Вашето съгласие с условията по-долу.",
      waiting: "За да покажете предварителните поръчки на гостите, изберете включване по-долу, приемете комисионата {commission} и условията и натиснете „Запази“.",
      renewal: "Прегледайте комисионата {commission}, приемете текущите условия отново и натиснете „Запази“, за да възстановите достъпа в приложението.",
    },
  },
  en: {
    label: "Saved app availability",
    disabled: "Disabled by the platform",
    waiting: "Waiting for owner consent",
    renewal: "Owner consent must be renewed",
    available: "Available in the app",
    hidden: "Guests do not see the preorder offer yet.",
    drafts: "Unpaid drafts only · card payment is unavailable",
    availableStep: "After a new reservation, guests see an offer to choose dishes and drinks from the menu.",
    developer: {
      disabled: "Enable the platform switch below and save. Availability in the app also requires the owner's consent.",
      waiting: "The owner must open “Profile → SeatMap · Preorders”, opt in, accept the {commission} commission and terms, then save.",
      renewal: "The owner must accept the {commission} commission and current terms again in “Profile → SeatMap · Preorders”, then save.",
    },
    owner: {
      disabled: "The developer must enable the service in “DEV management → Services & commission”. Availability in the app also requires your acceptance of the terms below.",
      waiting: "To show preorders to guests, opt in below, accept the {commission} commission and terms, then press “Save”.",
      renewal: "Review the {commission} commission, accept the current terms again and press “Save” to restore availability in the app.",
    },
  },
  ru: {
    label: "Сохранённый статус в приложении",
    disabled: "Выключено платформой",
    waiting: "Ждём согласия владельца",
    renewal: "Нужно повторное согласие владельца",
    available: "Доступно в приложении",
    hidden: "Предложение предзаказа пока не показывается гостям.",
    drafts: "Только неоплаченные черновики · оплата картой недоступна",
    availableStep: "После новой брони гости увидят предложение выбрать блюда и напитки из меню.",
    developer: {
      disabled: "Включите разрешение платформы ниже и сохраните. Для доступа в приложении также нужно согласие владельца.",
      waiting: "Владелец должен открыть «Профиль → SeatMap · Предзаказы», отметить подключение, принять комиссию {commission} и условия, затем сохранить.",
      renewal: "Владелец должен повторно принять комиссию {commission} и текущие условия в «Профиль → SeatMap · Предзаказы», затем сохранить.",
    },
    owner: {
      disabled: "Программист должен разрешить сервис в «DEV управление → Сервисы и комиссия». Для доступа в приложении также нужно ваше согласие с условиями ниже.",
      waiting: "Чтобы показать предзаказы гостям, отметьте подключение ниже, примите комиссию {commission} и условия, затем нажмите «Сохранить».",
      renewal: "Проверьте комиссию {commission}, повторно примите текущие условия и нажмите «Сохранить», чтобы вернуть доступ в приложении.",
    },
  },
};
export default function PreorderSettings({ adminFetch, role, language }) {
  const t = copy[language] || copy.en;
  const activation = activationCopy[language] || activationCopy.en;
  const [settings, setSettings] = React.useState(null);
  const [enabled, setEnabled] = React.useState(false);
  const [commission, setCommission] = React.useState("0");
  const [optedIn, setOptedIn] = React.useState(false);
  const [accept, setAccept] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [month, setMonth] = React.useState(() => {
    const parts = new Intl.DateTimeFormat("en", { year: "numeric", month: "2-digit", timeZone: "Europe/Sofia" }).formatToParts(new Date());
    return `${parts.find((p) => p.type === "year").value}-${parts.find((p) => p.type === "month").value}`;
  });
  const [report, setReport] = React.useState(null);
  const fetchRef = React.useRef(adminFetch);
  React.useEffect(() => { fetchRef.current = adminFetch; }, [adminFetch]);
  React.useEffect(() => {
    let active = true;
    fetchRef.current(`${API_BASE_URL}/api/preorders/settings`).then(async (response) => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (active) { setSettings(data); setEnabled(data.platform.enabled); setCommission(String(data.platform.commissionBasisPoints / 100)); setOptedIn(data.restaurant.optedIn); setAccept(false); }
    }).catch(() => { if (active) setMessage(t.error); });
    return () => { active = false; };
  }, [role, t.error]);
  async function save(event) {
    event.preventDefault(); if (busy || !settings) return;
    setBusy(true); setMessage("");
    try {
      const developer = role === "Developer";
      const body = developer ? { enabled, commissionBasisPoints: Math.round(Number(commission) * 100) } : { optedIn, acceptFullPrepaymentAndMonthlySettlement: accept, expectedCommissionBasisPoints: settings.platform.commissionBasisPoints, expectedTermsVersion: settings.termsVersion };
      const response = await adminFetch(`${API_BASE_URL}/api/preorders/${developer ? "platform" : "consent"}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (response.status === 409 && !developer) {
        const problem = await response.json();
        if (problem.code === "PREORDER_TERMS_CHANGED") {
          setAccept(false);
          const latest = await adminFetch(`${API_BASE_URL}/api/preorders/settings`);
          if (!latest.ok) throw new Error();
          setSettings(await latest.json());
          setMessage(t.renewal);
          return;
        }
      }
      if (!response.ok) throw new Error();
      setSettings(await response.json()); setMessage(t.saved); setAccept(false);
    } catch { setMessage(t.error); } finally { setBusy(false); }
  }
  async function loadReport() {
    setBusy(true); setMessage("");
    try {
      const response = await adminFetch(`${API_BASE_URL}/api/preorders/settlements?month=${encodeURIComponent(month)}`);
      if (!response.ok) throw new Error(); setReport(await response.json());
    } catch { setMessage(t.error); } finally { setBusy(false); }
  }
  const field = "mt-2 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white";
  // Availability describes the saved server state, never a switch that has only
  // been edited locally. Owner consent and card acquiring are separate gates.
  const availability = !settings?.platform.enabled ? "disabled"
    : !settings.restaurant.optedIn ? "waiting"
    : settings.consentNeedsRenewal ? "renewal" : "available";
  const nextStep = availability === "available" ? activation.availableStep
    : activation[role === "Developer" ? "developer" : "owner"][availability]
      .replace("{commission}", `${(settings?.platform.commissionBasisPoints ?? 0) / 100}%`);
  return <section className="mt-6 rounded-[26px] border border-violet-300/20 bg-violet-500/5 p-5 md:p-6">
    <h3 className="text-xl font-semibold text-violet-100">{t.title}</h3><p className="mt-2 text-sm leading-6 text-white/60">{t.intro}</p>
    <p className="mt-4 rounded-xl bg-amber-300/10 p-3 text-sm leading-6 text-amber-100">{t.notConnected}</p>
    {!settings ? <p className="mt-4 text-sm">{message || t.loading}</p> : <>
      <div aria-live="polite" data-preorder-status={availability} className={`mt-5 rounded-2xl border p-4 ${availability === "available" ? "border-emerald-300/25 bg-emerald-500/10" : "border-amber-300/25 bg-amber-300/5"}`}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">{activation.label}</p>
        <h4 className={`mt-2 text-base font-semibold ${availability === "available" ? "text-emerald-100" : "text-amber-100"}`}>{activation[availability]}</h4>
        {availability !== "available" && <p className="mt-2 text-sm text-white/65">{activation.hidden}</p>}
        <p className="mt-2 text-sm leading-6 text-white/75">{nextStep}</p>
        {availability === "available" && !settings.cardPaymentsAvailable && <p className="mt-3 text-xs font-semibold leading-5 text-amber-100">{activation.drafts}</p>}
      </div>
      <form onSubmit={save} className="mt-5 grid gap-4">
        {role === "Developer" ? <>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={enabled} disabled={busy} onChange={(e) => setEnabled(e.target.checked)} />{t.enabled}</label>
          <label className="max-w-sm text-sm text-white/65">{t.commission}<input required type="number" min="0" max="100" step="0.01" value={commission} disabled={busy} onChange={(e) => setCommission(e.target.value)} className={field} /></label>
          <p className="text-sm leading-6 text-white/50">{t.owner}</p>
        </> : <>
          <p className="text-sm text-violet-100">{t.commission}: {settings.platform.commissionBasisPoints / 100}%</p>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={optedIn} disabled={busy} onChange={(e) => setOptedIn(e.target.checked)} />{t.consent}</label>
          {optedIn && <label className="flex items-start gap-3 text-sm leading-6"><input className="mt-1" type="checkbox" checked={accept} disabled={busy} onChange={(e) => setAccept(e.target.checked)} />{t.terms}</label>}
        </>}
        {settings.consentNeedsRenewal && <p className="text-sm text-amber-200">{t.renewal}</p>}
        <button disabled={busy || (role === "Owner" && optedIn && !accept)} className="luxury-button w-fit rounded-xl px-5 py-3 text-sm disabled:opacity-40">{t.save}</button>
      </form>
      <div className="mt-6 border-t border-white/10 pt-5"><h4 className="font-semibold">{t.report}</h4>
        <div className="mt-3 flex flex-wrap gap-3"><input aria-label={t.report} type="month" disabled={busy} value={month} onChange={(e) => { setMonth(e.target.value); setReport(null); }} className={`${field} max-w-52`} /><button type="button" onClick={loadReport} disabled={busy || !month} className="rounded-xl border border-violet-300/25 px-4 py-2 text-sm disabled:opacity-40">{t.report}</button></div>
        {report && <div className="mt-4 grid gap-3 sm:grid-cols-3">{[[t.gross, report.grossMinor], [t.fee, report.commissionMinor], [t.net, report.restaurantNetMinor]].map(([label, value]) => <div key={label} className="rounded-xl bg-black/20 p-3"><div className="text-xs text-white/50">{label}</div><strong className="mt-2 block">{(value / 100).toFixed(2)} €</strong></div>)}<p className="text-xs text-white/45">{report.payments} {t.payments}</p></div>}
      </div>
      {message && <p role="status" className="mt-4 text-sm text-violet-100">{message}</p>}
    </>}
  </section>;
}
