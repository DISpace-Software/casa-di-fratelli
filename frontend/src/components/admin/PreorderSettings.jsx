import React from "react";
import { API_BASE_URL } from "../../config/api";

const copy = {
  "bg": {
    "title": "SeatMap · Предварителни поръчки",
    "intro": "Програмистът включва услугата и задава комисионата след договорка с ресторанта.",
    "enabled": "Разрешено от платформата",
    "commission": "Договорена комисиона (%)",
    "save": "Запази",
    "notConnected": "Картовите плащания и реалните изплащания още не са свързани. Настройката не стартира приемане на плащания.",
    "saved": "Запазено",
    "error": "Неуспешна заявка. Настройката не е запазена.",
    "loading": "Зареждане…",
    "report": "Месечен отчет",
    "gross": "Плащания",
    "fee": "Комисиона",
    "net": "За ресторанта",
    "payments": "потвърдени плащания",
    "statusLabel": "Запазен статус в приложението",
    "disabled": "Изключено от платформата",
    "available": "Достъпно в приложението",
    "hidden": "Предложението за предварителна поръчка не се показва на гостите.",
    "drafts": "Само неплатени чернови · плащането с карта е недостъпно",
    "availableStep": "След нова резервация гостите виждат предложение да изберат ястия и напитки от менюто.",
    "developerStep": "Включете услугата по-долу и запазете, за да я покажете в приложението.",
    "ownerStep": "Програмистът управлява включването и договорената комисиона в „DEV управление → Услуги и комисиони“.",
    "ownerReadOnly": "Тук виждате запазения статус, договорената комисиона и месечните отчети. Не е нужно допълнително потвърждение."
  },
  "en": {
    "title": "SeatMap · Preorders",
    "intro": "The developer enables the service and sets the commission after agreement with the restaurant.",
    "enabled": "Enabled by the platform",
    "commission": "Agreed commission (%)",
    "save": "Save",
    "notConnected": "Card payments and real payouts are not connected yet. This setting does not start accepting payments.",
    "saved": "Saved",
    "error": "The request failed. Settings were not saved.",
    "loading": "Loading…",
    "report": "Monthly report",
    "gross": "Payments",
    "fee": "Commission",
    "net": "Restaurant net",
    "payments": "confirmed payments",
    "statusLabel": "Saved app availability",
    "disabled": "Disabled by the platform",
    "available": "Available in the app",
    "hidden": "Guests do not see the preorder offer.",
    "drafts": "Unpaid drafts only · card payment is unavailable",
    "availableStep": "After a new reservation, guests see an offer to choose dishes and drinks from the menu.",
    "developerStep": "Enable the service below and save to show it in the app.",
    "ownerStep": "The developer manages activation and the agreed commission in “DEV management → Services & commission”.",
    "ownerReadOnly": "View the saved status, agreed commission and monthly reports here. No additional confirmation is required."
  },
  "ru": {
    "title": "SeatMap · Предзаказы",
    "intro": "Программист включает сервис и задаёт комиссию после договорённости с рестораном.",
    "enabled": "Разрешено платформой",
    "commission": "Согласованная комиссия (%)",
    "save": "Сохранить",
    "notConnected": "Эквайринг и реальные выплаты ещё не подключены. Эта настройка не запускает приём платежей.",
    "saved": "Сохранено",
    "error": "Запрос не выполнен. Настройки не сохранены.",
    "loading": "Загрузка…",
    "report": "Месячный отчёт",
    "gross": "Платежи",
    "fee": "Комиссия",
    "net": "Ресторану",
    "payments": "подтверждённых платежей",
    "statusLabel": "Сохранённый статус в приложении",
    "disabled": "Выключено платформой",
    "available": "Доступно в приложении",
    "hidden": "Предложение предзаказа не показывается гостям.",
    "drafts": "Только неоплаченные черновики · оплата картой недоступна",
    "availableStep": "После новой брони гости увидят предложение выбрать блюда и напитки из меню.",
    "developerStep": "Включите сервис ниже и сохраните, чтобы показать его в приложении.",
    "ownerStep": "Программист управляет подключением и согласованной комиссией в «DEV управление → Сервисы и комиссия».",
    "ownerReadOnly": "Здесь доступны сохранённый статус, согласованная комиссия и месячные отчёты. Дополнительное подтверждение не требуется."
  }
};

export default function PreorderSettings({ adminFetch, role, language }) {
  const t = copy[language] || copy.en;
  const developer = role === "Developer";
  const [settings, setSettings] = React.useState(null);
  const [enabled, setEnabled] = React.useState(false);
  const [commission, setCommission] = React.useState("0");
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
      if (active) {
        setSettings(data);
        setEnabled(data.platform.enabled);
        setCommission(String(data.platform.commissionBasisPoints / 100));
      }
    }).catch(() => { if (active) setMessage(t.error); });
    return () => { active = false; };
  }, [role, t.error]);
  async function save(event) {
    event.preventDefault();
    if (!developer || busy || !settings) return;
    setBusy(true); setMessage("");
    try {
      const response = await adminFetch(`${API_BASE_URL}/api/preorders/platform`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, commissionBasisPoints: Math.round(Number(commission) * 100) }),
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setSettings(data);
      setEnabled(data.platform.enabled);
      setCommission(String(data.platform.commissionBasisPoints / 100));
      setMessage(t.saved);
    } catch { setMessage(t.error); } finally { setBusy(false); }
  }
  async function loadReport() {
    if (busy || !month) return;
    setBusy(true); setMessage("");
    try {
      const response = await adminFetch(`${API_BASE_URL}/api/preorders/settlements?month=${encodeURIComponent(month)}`);
      if (!response.ok) throw new Error();
      setReport(await response.json());
    } catch { setMessage(t.error); } finally { setBusy(false); }
  }
  const field = "mt-2 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white";
  // Only the saved Developer switch controls app availability. Historical owner
  // consent and unsaved form values do not affect activation.
  const availability = settings?.platform.enabled ? "available" : "disabled";
  const nextStep = availability === "available" ? t.availableStep : developer ? t.developerStep : t.ownerStep;
  return <section className="mt-6 rounded-[26px] border border-violet-300/20 bg-violet-500/5 p-5 md:p-6">
    <h3 className="text-xl font-semibold text-violet-100">{t.title}</h3>
    <p className="mt-2 text-sm leading-6 text-white/60">{t.intro}</p>
    <p className="mt-4 rounded-xl bg-amber-300/10 p-3 text-sm leading-6 text-amber-100">{t.notConnected}</p>
    {!settings ? <p className="mt-4 text-sm">{message || t.loading}</p> : <>
      <div aria-live="polite" data-preorder-status={availability} className={`mt-5 rounded-2xl border p-4 ${availability === "available" ? "border-emerald-300/25 bg-emerald-500/10" : "border-amber-300/25 bg-amber-300/5"}`}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">{t.statusLabel}</p>
        <h4 className={`mt-2 text-base font-semibold ${availability === "available" ? "text-emerald-100" : "text-amber-100"}`}>{t[availability]}</h4>
        {availability === "disabled" && <p className="mt-2 text-sm text-white/65">{t.hidden}</p>}
        <p className="mt-2 text-sm leading-6 text-white/75">{nextStep}</p>
        {availability === "available" && !settings.cardPaymentsAvailable && <p className="mt-3 text-xs font-semibold leading-5 text-amber-100">{t.drafts}</p>}
      </div>
      {developer ? <form onSubmit={save} className="mt-5 grid gap-4">
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={enabled} disabled={busy} onChange={(e) => setEnabled(e.target.checked)} />{t.enabled}</label>
        <label className="max-w-sm text-sm text-white/65">{t.commission}<input required type="number" min="0" max="100" step="0.01" value={commission} disabled={busy} onChange={(e) => setCommission(e.target.value)} className={field} /></label>
        <button disabled={busy} className="luxury-button w-fit rounded-xl px-5 py-3 text-sm disabled:opacity-40">{t.save}</button>
      </form> : <div className="mt-5 space-y-2">
        <p className="text-sm font-semibold text-violet-100">{t.commission}: {settings.platform.commissionBasisPoints / 100}%</p>
        <p className="text-sm leading-6 text-white/60">{t.ownerReadOnly}</p>
      </div>}
      <div className="mt-6 border-t border-white/10 pt-5"><h4 className="font-semibold">{t.report}</h4>
        <div className="mt-3 flex flex-wrap gap-3"><input aria-label={t.report} type="month" disabled={busy} value={month} onChange={(e) => { setMonth(e.target.value); setReport(null); }} className={`${field} max-w-52`} /><button type="button" onClick={loadReport} disabled={busy || !month} className="rounded-xl border border-violet-300/25 px-4 py-2 text-sm disabled:opacity-40">{t.report}</button></div>
        {report && <div className="mt-4 grid gap-3 sm:grid-cols-3">{[[t.gross, report.grossMinor], [t.fee, report.commissionMinor], [t.net, report.restaurantNetMinor]].map(([label, value]) => <div key={label} className="rounded-xl bg-black/20 p-3"><div className="text-xs text-white/50">{label}</div><strong className="mt-2 block">{(value / 100).toFixed(2)} €</strong></div>)}<p className="text-xs text-white/45">{report.payments} {t.payments}</p></div>}
      </div>
      {message && <p role="status" className="mt-4 text-sm text-violet-100">{message}</p>}
    </>}
  </section>;
}
