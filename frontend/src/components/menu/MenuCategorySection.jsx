export default function MenuCategorySection({ category, language, orderEnabled = false, onAddToOrder }) {
  const featuredCount = category.items.filter((item) => item.featured).length;

  return (
    <section id={category.id} className="reveal-up scroll-mt-44 md:scroll-mt-56">
      <div className="menu-category-banner menu-spark mb-8 overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(135deg,rgba(201,165,106,0.18),rgba(255,255,255,0.045)),radial-gradient(circle_at_92%_18%,rgba(52,211,153,0.14),transparent_16rem)] p-5 shadow-2xl shadow-black/20 md:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="section-kicker">
              {language === "bg" ? "Подбор Casa" : "Casa selection"}
            </div>
            <h2 className="mt-2 text-3xl font-semibold text-[#fff4df] md:text-4xl">
              {category.title}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/62">
              {language === "bg"
                ? "Подбрани позиции с премиален ритъм, ясни вкусове и ресторантско усещане."
                : "Curated plates with a premium rhythm, clear flavors, and a restaurant-first feel."}
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

      <div className="grid gap-4 md:grid-cols-2">
        {category.items.map((item, index) => (
          <div
            key={item.id || item.name}
            className={`dish-card group luxury-panel menu-spark overflow-hidden rounded-[26px] transition duration-300 hover:-translate-y-1 hover:border-[#c9a56a]/35 ${
              item.featured ? "md:col-span-2" : ""
            } ${
              item.featured && item.imageUrl ? "md:grid md:grid-cols-[0.9fr_1.1fr]" : ""
            }`}
          >
            {item.imageUrl && (
              <div className={`dish-image relative min-h-48 overflow-hidden border-b border-white/10 bg-black/20 ${
                item.featured ? "md:h-full md:min-h-[320px] md:border-b-0 md:border-r" : "md:h-56"
              }`}>
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/8 to-transparent" />
                {item.featured && (
                  <div className="absolute left-4 top-4 rounded-full border border-[#c9a56a]/30 bg-black/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f2d39a] backdrop-blur">
                    Signature
                  </div>
                )}
              </div>
            )}

            <div className="flex min-h-full flex-col justify-between gap-5 p-5 md:p-6">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-stone-400">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {!item.imageUrl && item.featured && (
                    <span className="floating-glow rounded-full border border-[#c9a56a]/30 bg-[#c9a56a]/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[#d8b377]">
                      Signature
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <h3 className="text-2xl font-semibold leading-tight text-white md:text-[1.65rem]">{item.name}</h3>
                  {item.featured && (
                    <div className="hidden rounded-full border border-[#c9a56a]/25 bg-[#c9a56a]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#f2d3a0] md:block">
                      Chef pick
                    </div>
                  )}
                </div>

                <p className="mt-3 text-sm leading-7 text-white/70">
                  {item.description}
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  <div className="inline-flex rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-sm text-white/55">
                    {item.weight}
                  </div>
                  <div className="inline-flex rounded-full border border-[#c9a56a]/20 bg-[#c9a56a]/10 px-3 py-1.5 text-sm text-[#f2d3a0]">
                    {language === "bg" ? "Приготвя се на момента" : "Prepared to order"}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                <div className="rounded-full border border-[#c9a56a]/25 bg-[#c9a56a]/10 px-4 py-2 text-base font-semibold text-[#f2d3a0]">
                  {item.price}
                </div>
                {orderEnabled && (
                  <button
                    type="button"
                    onClick={() => onAddToOrder?.(item)}
                    className="luxury-button rounded-full px-4 py-2 text-xs font-semibold"
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
