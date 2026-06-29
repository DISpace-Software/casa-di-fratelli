import menuPageData from "../../data/menuPageData";
import { buildMenuDataFromCms } from "../../utils/menuUtils";

function localText(language, bg, en, ru = bg) {
  if (language === "en") return en;
  if (language === "ru") return ru;
  return bg;
}

export default function MenuSection({ t, language, onOpenMenu, cmsMenuItems }) {
  const data = buildMenuDataFromCms(cmsMenuItems, language, menuPageData[language] || menuPageData.bg);

  const previewCategories = data.categories.slice(0, 3);

  return (
    <section id="menu" className="mx-auto max-w-7xl px-6 py-24">
      <div className="mb-12 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="section-kicker">
            {t.menuTag}
          </p>
          <h2 className="mt-3 text-3xl font-semibold text-[#fff4df] md:text-5xl">
            {t.menuTitle}
          </h2>
        </div>

        <div className="max-w-xl">
          {t.menuText ? (
            <p className="leading-7 text-stone-400">{t.menuText}</p>
          ) : null}
          <button
            type="button"
            onClick={onOpenMenu}
            className="ghost-button rounded-full px-5 py-3 text-sm font-semibold"
          >
            {localText(language, "Отвори цялото меню", "Open full menu", "Открыть всё меню")}
          </button>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {previewCategories.map((category, index) => (
          <div
            key={category.id}
            className="luxury-panel reveal-up menu-spark group rounded-[28px] p-6 transition hover:-translate-y-1 md:p-7"
          >
            <div className="mb-6 flex items-center justify-between gap-4">
              <h3 className="text-2xl font-semibold text-[#f2d39a]">
                {category.title}
              </h3>
              <span className={`h-3 w-3 rounded-full ${index === 1 ? "bg-emerald-300" : index === 2 ? "bg-red-300" : "bg-[#c9a56a]"}`} />
            </div>

            <div className="space-y-5">
              {category.items.slice(0, 3).map((item) => (
                <div
                  key={item.name}
                  className="border-b border-white/10 pb-5 last:border-0 last:pb-0"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-lg font-medium text-[#fff4df]">
                        {item.name}
                      </div>
                      <div className="mt-1 text-sm text-stone-400">
                        {item.description}
                      </div>
                      <div className="mt-2 text-xs text-stone-500">
                        {item.weight}
                      </div>
                    </div>

                    <div className="whitespace-nowrap rounded-full border border-[#c9a56a]/20 bg-[#c9a56a]/10 px-3 py-1 text-sm font-semibold text-[#f2d39a]">
                      {item.price}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={onOpenMenu}
          className="luxury-button rounded-full px-8 py-4 text-sm font-semibold"
        >
          {localText(language, "Виж всички категории", "View all categories", "Смотреть все категории")}
        </button>
      </div>
    </section>
  );
}
