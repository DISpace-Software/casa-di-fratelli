export default function MenuCategorySection({ category, language, orderEnabled = false, onAddToOrder }) {
  const featuredCount = category.items.filter((item) => item.featured).length;

  return (
    <section id={category.id} className="reveal-up scroll-mt-44 md:scroll-mt-56">
      <div className="mb-8 overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(201,165,106,0.16),rgba(255,255,255,0.045)),radial-gradient(circle_at_90%_20%,rgba(52,211,153,0.14),transparent_16rem)] p-6 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="section-kicker">
              {language === "bg" ? "Категория" : "Category"}
            </div>
            <h2 className="mt-2 text-3xl font-semibold text-[#fff4df] md:text-4xl">
              {category.title}
            </h2>
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
            className={`group luxury-panel menu-spark overflow-hidden rounded-[22px] transition hover:-translate-y-1 hover:border-[#c9a56a]/30 ${
              item.featured ? "md:col-span-2" : ""
            }`}
          >
            {item.imageUrl && (
              <div className="relative h-48 overflow-hidden border-b border-white/10 bg-black/20 md:h-56">
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
              </div>
            )}

            <div className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-stone-400">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-xl font-semibold text-white">{item.name}</h3>
                  {item.featured && (
                    <span className="floating-glow rounded-full border border-[#c9a56a]/30 bg-[#c9a56a]/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[#d8b377]">
                      Signature
                    </span>
                  )}
                </div>

                <p className="mt-3 text-sm leading-7 text-white/70">
                  {item.description}
                </p>

                <div className="mt-4 inline-flex rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-sm text-white/50">
                  {item.weight}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
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
