export default function MenuCategorySection({ category, language, orderEnabled = false, onAddToOrder }) {
  const featuredCount = category.items.filter((item) => item.featured).length;

  return (
    <section id={category.id} className="reveal-up scroll-mt-44 md:scroll-mt-56">
      <div className="menu-category-banner menu-spark mb-4 overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(201,165,106,0.14),rgba(255,255,255,0.04)),radial-gradient(circle_at_92%_18%,rgba(52,211,153,0.1),transparent_14rem)] p-4 shadow-2xl shadow-black/15 md:mb-6 md:rounded-[28px] md:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="section-kicker">
              {language === "bg" ? "Подбор Casa" : "Casa selection"}
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-[#fff4df] md:text-4xl">
              {category.title}
            </h2>
            <p className="mt-2 max-w-2xl text-xs leading-6 text-white/62 md:mt-3 md:text-sm md:leading-7">
              {language === "bg"
                ? "Ясни вкусове, точни цени и удобен преглед."
                : "Clear flavors, exact prices, and an easy scan."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-stone-300">
              {category.items.length} {language === "bg" ? "позиции" : "items"}
            </span>
            {featuredCount > 0 && (
              <span className="rounded-full border border-[#c9a56a]/30 bg-[#c9a56a]/10 px-3 py-2 text-[#f2d39a]">
                {featuredCount} Signature
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-2.5 md:grid-cols-2 md:gap-3">
        {category.items.map((item, index) => (
          <div
            key={item.id || item.name}
            className="dish-card group menu-spark grid grid-cols-[82px_1fr] overflow-hidden rounded-[18px] border border-white/10 bg-white/[0.045] shadow-xl shadow-black/10 transition duration-300 hover:-translate-y-0.5 hover:border-[#c9a56a]/35 md:grid-cols-[128px_1fr] md:rounded-[22px]"
          >
            <div className="dish-image flex min-h-[112px] items-center justify-center border-r border-white/10 bg-[radial-gradient(circle_at_50%_28%,rgba(201,165,106,0.16),transparent_58%),rgba(0,0,0,0.22)] p-1.5 md:min-h-[154px] md:p-2">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  loading="lazy"
                  className="h-full max-h-[104px] w-full object-contain transition duration-500 group-hover:scale-[1.035] md:max-h-[138px]"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[#c9a56a]/20 bg-[#c9a56a]/10 text-xs font-semibold uppercase tracking-[0.16em] text-[#d8b377] md:h-20 md:w-20">
                  Casa
                </div>
              )}
            </div>

            <div className="flex min-h-full flex-col justify-between gap-3 p-3.5 md:p-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] font-semibold text-stone-400">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {item.featured && (
                    <span className="floating-glow rounded-full border border-[#c9a56a]/30 bg-[#c9a56a]/10 px-2.5 py-0.5 text-[9px] uppercase tracking-[0.18em] text-[#d8b377]">
                      Signature
                    </span>
                  )}
                </div>

                <h3 className="mt-2 text-[1rem] font-semibold leading-snug text-white md:text-xl">{item.name}</h3>

                <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-white/64 md:mt-2 md:line-clamp-3 md:text-sm md:leading-6">
                  {item.description}
                </p>

                <div className="mt-3 flex flex-wrap gap-1.5 md:gap-2">
                  <div className="inline-flex rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-xs text-white/55 md:text-sm">
                    {item.weight}
                  </div>
                  <div className="prepared-badge hidden rounded-full border border-[#c9a56a]/20 bg-[#c9a56a]/10 px-2.5 py-1 text-xs text-[#f2d3a0] md:inline-flex md:text-sm">
                    {language === "bg" ? "Приготвя се на момента" : "Prepared to order"}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-3">
                <div className="rounded-full border border-[#c9a56a]/25 bg-[#c9a56a]/10 px-3 py-1.5 text-sm font-semibold text-[#f2d3a0] md:px-4 md:py-2 md:text-base">
                  {item.price}
                </div>
                {orderEnabled && (
                  <button
                    type="button"
                    onClick={() => onAddToOrder?.(item)}
                    className="luxury-button rounded-full px-3 py-2 text-xs font-semibold md:px-4"
                  >
                    {language === "bg" ? "Добави" : "Add"}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
