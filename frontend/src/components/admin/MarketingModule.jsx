/** Marketing feature UI; authentication and tenant headers are supplied by adminFetch. */
import React from 'react';
import { adminLocalText } from '../../i18n/adminText.js';
import { API_BASE_URL } from '../../config/api';
import { readErrorMessage } from '../../admin/api/response.js';
import { capitalize } from '../../admin/presentation/formatters.js';
import { Panel } from './AdminPrimitives.jsx';
import MarketingHistory from './MarketingHistory';

export function MarketingModule({ adminLanguage, adminFetch }) {
  const [historyVersion, setHistoryVersion] = React.useState(0);
  const [settings, setSettings] = React.useState(null);
  const [stats, setStats] = React.useState(null);
  const [preview, setPreview] = React.useState(null);
  const [notice, setNotice] = React.useState("");
  const [error, setError] = React.useState("");

  const text = {
    bg: {
      title: "Маркетинг",
      subtitle: "Автоматични кампании за рожден ден, редовни гости и връщане на гости. Работи и в Basic, и в Pro.",
      birthday: "Рожден ден",
      loyalty: "Редовен гост",
      winback: "Върни гост",
      enabled: "Активна кампания",
      discount: "Отстъпка %",
      daysBefore: "Дни преди рожден ден",
      windowDays: "Период дни",
      requiredVisits: "Нужни посещения",
      absenceDays: "Дни без посещение",
      historyDays: "История дни",
      minVisits: "Мин. посещения в историята",
      subject: "Тема на имейла",
      html: "Съобщение",
      save: "Запази маркетинга",
      preview: "Провери кандидати",
      run: "Изпрати сега",
      subscribers: "Абонати",
      sent: "Изпратени писма",
      candidates: "Кандидати",
      placeholders: "В текста може да използвате име, процент, дата и име на ресторанта.",
      tokens: "Бързи променливи",
      warning: "Реалното изпращане ще изпрати писма към всички кандидати, които още не са получавали тази кампания за тази дата.",
    },
    en: {
      title: "Marketing",
      subtitle: "Automated birthday, loyal guest, and win-back campaigns. Available in Basic and Pro.",
      birthday: "Birthday",
      loyalty: "Loyal guest",
      winback: "Win back",
      enabled: "Campaign enabled",
      discount: "Discount %",
      daysBefore: "Days before birthday",
      windowDays: "Window days",
      requiredVisits: "Required visits",
      absenceDays: "Days absent",
      historyDays: "History days",
      minVisits: "Min. visits in history",
      subject: "Email subject",
      html: "Message",
      save: "Save marketing",
      preview: "Preview candidates",
      run: "Send now",
      subscribers: "Subscribers",
      sent: "Emails sent",
      candidates: "Candidates",
      placeholders: "You can use guest name, discount, date, and restaurant name in the text.",
      tokens: "Quick variables",
      warning: "Real sending will email every candidate who has not already received this campaign for this date.",
    },
  }[adminLanguage] || {
    title: "Маркетинг",
    subtitle: "Автоматические кампании для дней рождения, постоянных гостей и возвращения гостей. Доступно в Basic и Pro.",
    birthday: "День рождения",
    loyalty: "Постоянный гость",
    winback: "Вернуть гостя",
    enabled: "Кампания активна",
    discount: "Скидка %",
    daysBefore: "Дней до дня рождения",
    windowDays: "Период дней",
    requiredVisits: "Нужно посещений",
    absenceDays: "Дней без посещения",
    historyDays: "История дней",
    minVisits: "Мин. посещений в истории",
    subject: "Тема письма",
    html: "Сообщение",
    save: "Сохранить маркетинг",
    preview: "Проверить кандидатов",
    run: "Отправить сейчас",
    subscribers: "Подписчики",
    sent: "Отправленные письма",
    candidates: "Кандидаты",
    placeholders: "В тексте можно использовать имя, скидку, дату и название ресторана.",
    tokens: "Быстрые переменные",
    warning: "Реальная отправка отправит письма всем кандидатам, которые ещё не получали эту кампанию на эту дату.",
  };

  const tokenOptions = [
    ["{{guestName}}", adminLanguage === "bg" ? "Име" : "Name"],
    ["{{discountPercent}}%", adminLanguage === "bg" ? "Отстъпка" : "Discount"],
    ["{{restaurantName}}", adminLanguage === "bg" ? "Ресторант" : "Restaurant"],
    ["{{date}}", adminLanguage === "bg" ? "Дата" : "Date"],
    ["{{birthdayTiming}}", adminLocalText(adminLanguage, "Точно време до рождения ден", "Exact birthday timing", "Точный срок до дня рождения")],
  ];

  const campaignMeta = [
    ["birthday", text.birthday, ["discountPercent", "daysBefore"]],
    ["loyalty", text.loyalty, ["discountPercent", "windowDays", "requiredVisits"]],
    ["winback", text.winback, ["discountPercent", "absenceDays", "historyDays", "minVisitsInHistory"]],
  ];

  const fieldLabels = {
    discountPercent: text.discount,
    daysBefore: text.daysBefore,
    windowDays: text.windowDays,
    requiredVisits: text.requiredVisits,
    absenceDays: text.absenceDays,
    historyDays: text.historyDays,
    minVisitsInHistory: text.minVisits,
  };

  const loadSettings = React.useCallback(async () => {
    setError("");
    const response = await adminFetch(`${API_BASE_URL}/api/marketing/settings`);
    if (!response.ok) {
      setError(await readErrorMessage(response, "Failed to load marketing settings."));
      return;
    }
    const data = await response.json();
    setSettings(data.settings || data.Settings);
    setStats(data.stats || data.Stats);
  }, [adminFetch]);

  React.useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  function updateCampaign(campaignKey, field, value) {
    setSettings((previous) => ({
      ...previous,
      [campaignKey]: {
        ...(previous?.[campaignKey] || previous?.[capitalize(campaignKey)] || {}),
        [field]: value,
      },
    }));
  }

  function appendToken(campaignKey, token) {
    const campaign = getCampaign(campaignKey);
    const current = campaign.htmlTemplate ?? campaign.HtmlTemplate ?? "";
    updateCampaign(campaignKey, "htmlTemplate", `${current}${current.endsWith(" ") || current.endsWith("\n") || current.length === 0 ? "" : " "}${token}`);
  }

  async function saveSettings(event) {
    event.preventDefault();
    setNotice("");
    setError("");
    const response = await adminFetch(`${API_BASE_URL}/api/marketing/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Failed to save marketing settings."));
      return;
    }
    setSettings(await response.json());
    setNotice(adminLanguage === "bg" ? "Маркетинг настройките са запазени." : "Marketing settings saved.");
    await loadSettings();
  }

  async function runMarketing(dryRun) {
    setNotice("");
    setError("");
    if (!dryRun && !window.confirm(text.warning)) return;

    const response = await adminFetch(`${API_BASE_URL}/api/marketing/run?dryRun=${dryRun ? "true" : "false"}`, { method: "POST" });
    if (!response.ok) {
      setError(await readErrorMessage(response, "Marketing run failed."));
      return;
    }
    const data = await response.json();
    setPreview(data);
    if (!dryRun) setHistoryVersion((version) => version + 1);
    setNotice(dryRun
      ? (adminLanguage === "bg" ? "Проверката е готова." : "Preview ready.")
      : (adminLanguage === "bg" ? `Изпратени писма: ${data.sent ?? data.Sent ?? 0}` : `Emails sent: ${data.sent ?? data.Sent ?? 0}`));
    await loadSettings();
  }

  function getCampaign(key) {
    return settings?.[key] || settings?.[capitalize(key)] || {};
  }

  if (!settings) {
    return (
      <Panel title={text.title} subtitle={text.subtitle}>
        <div className="rounded-3xl border border-white/10 bg-black/20 p-6 text-white/50">Loading...</div>
      </Panel>
    );
  }

  return (
    <Panel title={text.title} subtitle={text.subtitle}>
      <MarketingHistory adminLanguage={adminLanguage} adminFetch={adminFetch} refreshVersion={historyVersion} />
      <form onSubmit={saveSettings} className="space-y-5">
        {(notice || error) && (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${error ? "border-red-300/30 bg-red-500/15 text-red-100" : "border-emerald-300/25 bg-emerald-500/12 text-emerald-100"}`}>
            {error || notice}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
            <div className="section-kicker">{text.subscribers}</div>
            <div className="mt-3 text-3xl font-semibold text-[#fff4df]">{stats?.subscribers ?? stats?.Subscribers ?? 0}</div>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
            <div className="section-kicker">{text.sent}</div>
            <div className="mt-3 text-3xl font-semibold text-[#fff4df]">{stats?.totalSent ?? stats?.TotalSent ?? 0}</div>
          </div>
          <div className="rounded-[24px] border border-[#c9a56a]/20 bg-[#c9a56a]/10 p-4 text-sm text-[#f2d39a]">
            {text.placeholders}
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          {campaignMeta.map(([key, label, fields]) => {
            const campaign = getCampaign(key);
            return (
              <div key={key} className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="section-kicker">{label}</div>
                    <div className="mt-2 text-sm text-white/45">{text.placeholders}</div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-white/70">
                    <input name={`marketing.${key}.enabled`} type="checkbox" checked={Boolean(campaign.enabled ?? campaign.Enabled)} onChange={(event) => updateCampaign(key, "enabled", event.target.checked)} />
                    {text.enabled}
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  {fields.map((field) => (
                    <label key={field} className="block">
                      <span className="mb-1 block text-xs text-white/45">{fieldLabels[field]}</span>
                      <input name={`marketing.${key}.${field}`} type="number" step="1" value={campaign[field] ?? campaign[capitalize(field)] ?? ""} onChange={(event) => updateCampaign(key, field, Number(event.target.value || 0))} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" />
                    </label>
                  ))}
                </div>

                <label className="mt-4 block">
                  <span className="mb-1 block text-xs text-white/45">{text.subject}</span>
                  <input name={`marketing.${key}.subject`} value={campaign.subject ?? campaign.Subject ?? ""} onChange={(event) => updateCampaign(key, "subject", event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-amber-300" />
                </label>

                <label className="mt-4 block">
                  <span className="mb-1 block text-xs text-white/45">{text.html}</span>
                  <textarea name={`marketing.${key}.htmlTemplate`} rows={7} value={campaign.htmlTemplate ?? campaign.HtmlTemplate ?? ""} onChange={(event) => updateCampaign(key, "htmlTemplate", event.target.value)} className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-relaxed outline-none focus:border-amber-300" />
                </label>

                <div className="mt-3">
                  <div className="mb-2 text-xs text-white/45">{text.tokens}</div>
                  <div className="flex flex-wrap gap-2">
                    {tokenOptions.map(([token, label]) => (
                      <button
                        key={token}
                        type="button"
                        onClick={() => appendToken(key, token)}
                        className="rounded-full border border-[#c9a56a]/25 bg-[#c9a56a]/10 px-3 py-1.5 text-xs font-semibold text-[#f2d39a] transition hover:border-[#f2d39a]/45 hover:bg-[#c9a56a]/18"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="luxury-button rounded-2xl px-5 py-3 text-sm font-semibold">{text.save}</button>
          <button type="button" onClick={() => runMarketing(true)} className="ghost-button rounded-2xl px-5 py-3 text-sm font-semibold">{text.preview}</button>
          <button type="button" onClick={() => runMarketing(false)} className="rounded-2xl border border-emerald-300/25 bg-emerald-400/15 px-5 py-3 text-sm font-semibold text-emerald-100">{text.run}</button>
        </div>

        {preview && (
          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
            <div className="section-kicker">{text.candidates}: {preview.candidates ?? preview.Candidates ?? 0}</div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {(preview.preview || preview.Preview || []).map((item, index) => (
                <div key={`${item.email || item.Email}-${index}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="font-semibold text-[#fff4df]">{item.guestName || item.GuestName || "—"}</div>
                  <div className="mt-1 text-sm text-white/45">{item.email || item.Email}</div>
                  <div className="mt-3 rounded-full border border-[#c9a56a]/25 bg-[#c9a56a]/10 px-3 py-1 text-xs font-semibold text-[#f2d39a]">
                    {item.campaignKey || item.CampaignKey} · {item.discountPercent ?? item.DiscountPercent}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </form>
    </Panel>
  );
}

