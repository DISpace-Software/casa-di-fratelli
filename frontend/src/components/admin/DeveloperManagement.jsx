import PreorderSettings from "./PreorderSettings";

const copy = {
  bg: {
    title: "DEV управление",
    intro: "Настройки на платформата, достъп и техническа поддръжка на ресторанта.",
    scope: "Избран ресторант",
    restaurantFallback: "Ресторант",
    navigation: "Раздели на DEV управление",
    sections: {
      service: ["Услуги и комисиони", "Basic / Pro, предварителни поръчки и условия"],
      access: ["Достъп и история", "Администратори, роли и журнал на промените"],
      restaurant: ["Ресторант и бранд", "Данни, контакти и настройки за резервации"],
      maintenance: ["Поддръжка и данни", "Архиви, резервни копия и възстановяване"],
    },
    version: "Версия на системата",
    active: "Активен план",
    basicDescription: "Активни са сайтът и резервациите. Поръчки, кухня и сервитьорски роли са заключени.",
    proDescription: "Пълният оперативен модул е активен: сервитьори, кухня, поръчки и дигитално меню.",
    unlock: "Отключи Pro версия",
    lock: "Върни Basic версия",
    dataTitle: "Действия с всички оперативни данни",
    dataHint: "Отвори, за да видиш действието за изчистване.",
    clearTitle: "Изчисти резервации и поръчки",
    clearDescription: "Архивира всички резервации и поръчки на избрания ресторант. Менюто, масите, клиентските настройки и админите се запазват. Възстановяване: Поддръжка → Архив; за поръчки е необходим Pro.",
    confirmation: "Действието изисква отделно потвърждение и код.",
  },
  en: {
    title: "DEV management",
    intro: "Platform settings, access, and technical maintenance for this restaurant.",
    scope: "Selected restaurant",
    restaurantFallback: "Restaurant",
    navigation: "DEV management sections",
    sections: {
      service: ["Services & commission", "Basic / Pro, preorders, and terms"],
      access: ["Access & history", "Administrators, roles, and change history"],
      restaurant: ["Restaurant & brand", "Details, contacts, and booking settings"],
      maintenance: ["Maintenance & data", "Archives, backups, and recovery"],
    },
    version: "System version",
    active: "Active plan",
    basicDescription: "Website and reservations are active. Orders, kitchen, and waiter roles are locked.",
    proDescription: "Full operations are active: waiters, kitchen, orders, and digital menu.",
    unlock: "Unlock Pro version",
    lock: "Return to Basic version",
    dataTitle: "Actions affecting all operational data",
    dataHint: "Expand to view the clearing action.",
    clearTitle: "Clear reservations and orders",
    clearDescription: "Archives all reservations and orders for the selected restaurant. Menu, tables, customer settings, and admins are preserved. Restore from Maintenance → Archive; restoring orders requires Pro.",
    confirmation: "This action requires separate confirmation and a code.",
  },
  ru: {
    title: "DEV управление",
    intro: "Настройки платформы, доступ и техническое обслуживание ресторана.",
    scope: "Выбранный ресторан",
    restaurantFallback: "Ресторан",
    navigation: "Разделы DEV управления",
    sections: {
      service: ["Сервисы и комиссия", "Basic / Pro, предзаказы и условия"],
      access: ["Доступ и история", "Администраторы, роли и журнал изменений"],
      restaurant: ["Ресторан и бренд", "Данные, контакты и настройки бронирования"],
      maintenance: ["Обслуживание и данные", "Архивы, резервные копии и восстановление"],
    },
    version: "Версия системы",
    active: "Активный план",
    basicDescription: "Работают сайт и бронирование. Заказы, кухня и роли официантов заблокированы.",
    proDescription: "Работает полный операционный модуль: официанты, кухня, заказы и цифровое меню.",
    unlock: "Включить Pro",
    lock: "Вернуть Basic",
    dataTitle: "Действия со всеми операционными данными",
    dataHint: "Раскройте, чтобы увидеть действие очистки.",
    clearTitle: "Очистить бронирования и заказы",
    clearDescription: "Архивирует все бронирования и заказы выбранного ресторана. Меню, столы, клиентские настройки и администраторы сохраняются. Восстановление: Обслуживание → Архив; для заказов требуется Pro.",
    confirmation: "Для действия нужны отдельное подтверждение и код.",
  },
};

function SectionIcon({ section, className = "h-5 w-5" }) {
  const paths = {
    service: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><path d="M17.5 14v7M14 17.5h7" /></>,
    access: <><path d="M12 3 4 6v6c0 4.5 8 9 8 9s8-4.5 8-9V6l-8-3Z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
    restaurant: <><path d="M3 10h18M5 10v11h14V10M3 10l2-7h14l2 7M9 21v-7h6v7" /><path d="M8 3v7M16 3v7" /></>,
    maintenance: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>{paths[section] || paths.service}</svg>;
}

export default function DeveloperManagement({ language, restaurantName, restaurantId, section, onSectionChange }) {
  const t = copy[language] || copy.en;
  return (
    <section className="mb-6 overflow-hidden rounded-[28px] border border-violet-300/20 bg-gradient-to-br from-violet-500/10 via-[#1b1723] to-[#181511]">
      <div className="flex flex-col gap-5 p-5 md:flex-row md:items-start md:justify-between md:p-7">
        <div className="max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-violet-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-200">
            <span aria-hidden="true">&lt;/&gt;</span> SeatMap
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-[#fff4df] md:text-3xl">{t.title}</h2>
          <p className="mt-2 text-sm leading-6 text-white/55">{t.intro}</p>
        </div>
        <div className="w-fit max-w-full rounded-2xl border border-[#c9a56a]/25 bg-black/20 px-4 py-3 md:max-w-xs">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#c9a56a]">{t.scope}</p>
          <p className="mt-1 break-words text-sm font-semibold text-[#fff4df]">{restaurantName || restaurantId || t.restaurantFallback}</p>
          {restaurantId && <p className="mt-1 break-all font-mono text-[11px] text-white/40">{restaurantId}</p>}
        </div>
      </div>
      <nav aria-label={t.navigation} className="grid gap-2 border-t border-white/5 bg-black/10 p-3 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(t.sections).map(([key, [title, description]]) => {
          const selected = section === key;
          return (
            <button key={key} type="button" aria-pressed={selected} onClick={() => onSectionChange(key)} className={`group flex min-w-0 items-start gap-3 rounded-2xl border px-4 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1b1723] ${selected ? "border-violet-300/35 bg-violet-400/15 text-violet-100" : "border-transparent text-white/65 hover:border-white/10 hover:bg-white/5"}`}>
              <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-violet-300/15 text-violet-200" : "bg-white/5 text-[#c9a56a]"}`}><SectionIcon section={key} /></span>
              <span className="min-w-0"><span className="block text-sm font-semibold leading-5">{title}</span><span className={`mt-1 block text-xs leading-5 ${selected ? "text-violet-100/60" : "text-white/40"}`}>{description}</span></span>
            </button>
          );
        })}
      </nav>
    </section>
  );
}

export function DeveloperServiceSettings({ language, isProVersion, onUnlockPro, onLockBasic, adminFetch }) {
  const t = copy[language] || copy.en;
  return (
    <div>
      <section className="rounded-[26px] border border-[#c9a56a]/25 bg-black/20 p-5 md:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <div className="section-kicker">{t.version}</div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h3 className="text-2xl font-semibold text-[#fff4df]">{isProVersion ? "Pro" : "Basic"}</h3>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${isProVersion ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-200" : "border-[#c9a56a]/25 bg-[#c9a56a]/10 text-[#f2d39a]"}`}>{t.active}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/60">{isProVersion ? t.proDescription : t.basicDescription}</p>
          </div>
          <button type="button" onClick={isProVersion ? onLockBasic : onUnlockPro} className={`shrink-0 rounded-2xl px-5 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2d39a] ${isProVersion ? "border border-[#f2d39a]/30 bg-black/20 text-[#f2d39a] transition hover:bg-[#c9a56a]/10" : "luxury-button"}`}>{isProVersion ? t.lock : t.unlock}</button>
        </div>
      </section>
      <PreorderSettings adminFetch={adminFetch} role="Developer" language={language} />
    </div>
  );
}

export function DeveloperDataTools({ language, onClearData }) {
  const t = copy[language] || copy.en;
  return (
    <details className="group mt-6 rounded-[26px] border border-red-300/20 bg-red-500/5">
      <summary className="cursor-pointer rounded-[26px] px-5 py-5 text-red-100 marker:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 md:px-6">
        <span className="ml-2 font-semibold">{t.dataTitle}</span>
        <span className="ml-6 mt-1 block text-xs leading-5 text-red-100/50">{t.dataHint}</span>
      </summary>
      <div className="mx-5 mb-5 rounded-2xl border border-red-300/20 bg-red-500/10 p-5 md:mx-6 md:mb-6">
        <h3 className="text-lg font-semibold text-red-100">{t.clearTitle}</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-red-50/70">{t.clearDescription}</p>
        <p className="mt-3 text-xs leading-5 text-red-100/50">{t.confirmation}</p>
        <button type="button" onClick={onClearData} className="mt-5 rounded-xl border border-red-300/35 bg-red-500/20 px-5 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300">{t.clearTitle}</button>
      </div>
    </details>
  );
}
