import React from "react";
import { API_BASE_URL } from "../../config/api";

const translations = {
  bg: { title: "История на изпращанията", all: "Всички кампании", birthday: "Рожден ден", loyalty: "Редовен гост", winback: "Върни гост", search: "Име, имейл или тема", apply: "Търси", refresh: "Обнови", empty: "Няма изпратени писма по тези критерии.", loading: "Зареждане…", error: "Историята не може да бъде заредена.", previous: "Назад", next: "Напред", event: "Дата на кампанията", discount: "Отстъпка", total: "Изпратени", note: "Успешни изпращания, включително автоматични и ръчни поздравления. Часовете са за София." },
  en: { title: "Sending history", all: "All campaigns", birthday: "Birthday", loyalty: "Loyal guest", winback: "Win back", search: "Name, email or subject", apply: "Search", refresh: "Refresh", empty: "No sent emails match these filters.", loading: "Loading…", error: "Could not load sending history.", previous: "Previous", next: "Next", event: "Campaign date", discount: "Discount", total: "Sent", note: "Successful sends, including automated and manual greetings. Times are shown for Sofia." },
  ru: { title: "История отправок", all: "Все кампании", birthday: "День рождения", loyalty: "Постоянный гость", winback: "Вернуть гостя", search: "Имя, email или тема", apply: "Найти", refresh: "Обновить", empty: "Нет отправленных писем по выбранным условиям.", loading: "Загрузка…", error: "Не удалось загрузить историю отправок.", previous: "Назад", next: "Вперёд", event: "Дата кампании", discount: "Скидка", total: "Отправлено", note: "Успешные отправки, включая автоматические и ручные поздравления. Время указано для Софии." },
};

export default function MarketingHistory({ adminLanguage, adminFetch, refreshVersion }) {
  const t = translations[adminLanguage] || translations.ru;
  const [campaign, setCampaign] = React.useState("");
  const [draft, setDraft] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [reload, setReload] = React.useState(0);
  const [data, setData] = React.useState(null);
  const [busy, setBusy] = React.useState(true);
  const [error, setError] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    setBusy(true);
    setError(false);
    const params = new URLSearchParams({ campaign, search, page: String(page), pageSize: "20" });
    (async () => {
      try {
        const response = await adminFetch(`${API_BASE_URL}/api/marketing/history?${params}`);
        if (!response.ok) throw new Error("History request failed");
        const result = await response.json();
        if (active) setData(result);
      } catch { if (active) setError(true); }
      finally { if (active) setBusy(false); }
    })();
    return () => { active = false; };
  }, [adminFetch, campaign, search, page, reload, refreshVersion]);
  const inputClass = "min-h-11 min-w-0 rounded-2xl border border-white/15 bg-black/20 px-4 py-3 text-sm";
  const locale = adminLanguage === "bg" ? "bg-BG" : adminLanguage === "en" ? "en-GB" : "ru-RU";
  return (
    <section className="mb-6 rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-5" aria-label={t.title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">{t.title}</h3>
        <button type="button" className="ghost-button min-h-11 rounded-2xl px-4 py-2" onClick={() => setReload((n) => n + 1)} disabled={busy}>{t.refresh}</button>
      </div>
      <p className="mt-2 text-sm text-white/60">{t.note}</p>
      <form className="mt-4 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); setSearch(draft.trim()); setPage(1); setReload((n) => n + 1); }}>
        <select aria-label={t.all} className={inputClass} value={campaign} onChange={(event) => { setCampaign(event.target.value); setPage(1); }}>
          <option value="">{t.all}</option>
          {["birthday", "loyalty", "winback"].map((key) => <option key={key} value={key}>{t[key]}</option>)}
        </select>
        <input aria-label={t.search} placeholder={t.search} className={`${inputClass} flex-1`} value={draft} onChange={(event) => setDraft(event.target.value)} />
        <button className="ghost-button min-h-11 rounded-2xl px-4 py-2">{t.apply}</button>
      </form>
      <div className="mt-4" aria-live="polite" aria-busy={busy}>
        {busy ? <p>{t.loading}</p> : error ? <p role="alert" className="text-red-300">{t.error}</p> : <>
          <p className="mb-3 text-sm text-white/60">{t.total}: {data?.total ?? 0}</p>
          {!data?.items?.length ? <p className="py-4 text-white/60">{t.empty}</p> : <div className="grid gap-3 lg:grid-cols-2">
            {data.items.map((item) => <article key={item.id} className="min-w-0 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap justify-between gap-2"><strong className="break-words">{item.guestName || item.email}</strong><span className="text-sm text-[#f2d39a]">{t[item.campaignKey] || item.campaignKey}</span></div>
              <div className="mt-1 break-all text-sm text-white/65">{item.email}</div>
              <time className="mt-2 block text-sm" dateTime={item.sentAtUtc}>{new Date(item.sentAtUtc).toLocaleString(locale, { timeZone: "Europe/Sofia", dateStyle: "short", timeStyle: "short" })}</time>
              <p className="mt-2 break-words">{item.subject}</p>
              <p className="mt-2 text-xs text-white/60">{t.event}: {item.sentForDate} · {t.discount}: {item.discountPercent}%</p>
            </article>)}
          </div>}
          {data?.total > data?.pageSize && <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className="ghost-button min-h-11 rounded-2xl px-4" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>{t.previous}</button>
            <span>{data.page} / {Math.ceil(data.total / data.pageSize)}</span>
            <button type="button" className="ghost-button min-h-11 rounded-2xl px-4" disabled={data.page * data.pageSize >= data.total} onClick={() => setPage(data.page + 1)}>{t.next}</button>
          </div>}
        </>}
      </div>
    </section>
  );
}
