function getValue(item, key) {
  return item?.[key] ?? item?.[key.charAt(0).toUpperCase() + key.slice(1)];
}

function normalizeEvent(item, language) {
  const images = getValue(item, "imageUrls") || [];
  return {
    id: getValue(item, "id"),
    title: language === "bg"
      ? getValue(item, "titleBg") || getValue(item, "titleEn")
      : getValue(item, "titleEn") || getValue(item, "titleBg"),
    text: language === "bg"
      ? getValue(item, "textBg") || getValue(item, "textEn")
      : getValue(item, "textEn") || getValue(item, "textBg"),
    badge: getValue(item, "badge") || "",
    images: Array.isArray(images) ? images : [],
  };
}

export default function EventsSection({ language, events = [] }) {
  const activeEvents = events.map((item) => normalizeEvent(item, language)).filter((item) => item.title);

  if (activeEvents.length > 0) {
    const [featured, ...rest] = activeEvents;
    const featuredImages = featured.images.slice(0, 4);

    return (
      <section id="events" className="relative mx-auto max-w-7xl overflow-hidden px-6 py-20">
        <div className="absolute right-10 top-14 h-56 w-56 rounded-full bg-[#c9a56a]/10 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="luxury-panel rounded-[30px] p-7 md:p-9">
            <p className="section-kicker">{language === "bg" ? "Събития" : "Events"}</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#fff4df] md:text-5xl">
              {featured.title}
            </h2>
            {featured.text && (
              <p className="mt-5 leading-8 text-white/68">{featured.text}</p>
            )}
            {featured.badge && (
              <div className="mt-7 inline-flex rounded-full border border-[#f2d39a]/25 bg-[#c9a56a]/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#f2d39a]">
                {featured.badge}
              </div>
            )}
          </div>

          <div className="events-giveaway-card menu-spark overflow-hidden rounded-[30px] border border-[#c9a56a]/18 bg-[linear-gradient(135deg,rgba(201,165,106,0.16),rgba(255,255,255,0.045)),radial-gradient(circle_at_78%_18%,rgba(46,139,99,0.16),transparent_16rem)] p-4 shadow-2xl shadow-black/25 sm:p-5">
            {featuredImages.length > 0 ? (
              <div className={`grid h-full gap-3 ${featuredImages.length === 1 ? "min-h-[320px] md:min-h-[420px]" : "sm:grid-cols-2"}`}>
                {featuredImages.map((src, index) => (
                  <div
                    key={`${src}-${index}`}
                    className={`relative overflow-hidden rounded-[24px] border border-white/10 bg-black/25 ${
                      featuredImages.length === 1 ? "min-h-[320px] md:min-h-[420px]" : ""
                    } ${
                      index === 0 && featuredImages.length > 2 ? "sm:col-span-2" : ""
                    }`}
                  >
                    <img
                      src={src}
                      alt={`${featured.title} ${index + 1}`}
                      loading="lazy"
                      className={
                        featuredImages.length === 1
                          ? "absolute inset-0 h-full w-full object-cover object-center"
                          : `w-full object-cover ${index === 0 ? "h-72 md:h-80" : "h-44"}`
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[360px] items-center justify-center rounded-[24px] border border-white/10 bg-black/25 px-8 text-center text-white/55">
                {language === "bg" ? "Добавете снимки към събитието от админ панела." : "Add event photos from the admin panel."}
              </div>
            )}
          </div>
        </div>

        {rest.length > 0 && (
          <div className="relative mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rest.map((item) => (
              <article key={item.id || item.title} className="rounded-[26px] border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/15">
                {item.images[0] && (
                  <img src={item.images[0]} alt={item.title} loading="lazy" className="mb-4 h-44 w-full rounded-[20px] object-cover" />
                )}
                {item.badge && <div className="section-kicker">{item.badge}</div>}
                <h3 className="mt-2 text-xl font-semibold text-[#fff4df]">{item.title}</h3>
                {item.text && <p className="mt-3 line-clamp-4 text-sm leading-6 text-white/58">{item.text}</p>}
              </article>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section id="events" className="relative mx-auto max-w-7xl overflow-hidden px-6 py-20">
      <div className="absolute right-10 top-14 h-56 w-56 rounded-full bg-[#c9a56a]/10 blur-3xl" />
      <div className="relative grid items-stretch gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="luxury-panel rounded-[30px] p-7 md:p-9">
          <p className="section-kicker">{language === "bg" ? "Събития" : "Events"}</p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#fff4df] md:text-5xl">
            {language === "bg" ? "Празници, които остават като история." : "Celebrations that become stories."}
          </h2>
          <p className="mt-5 leading-8 text-white/68">
            {language === "bg"
              ? "За 14 февруари направихме специален giveaway за нашите гости: романтична награда за двама с три дни в SPA хотел. Такива моменти са част от духа на Casa di Fratelli."
              : "For February 14, we created a special giveaway for our guests: a romantic prize for two with three days in a SPA hotel. Moments like this are part of the Casa di Fratelli spirit."}
          </p>
        </div>

        <div className="events-giveaway-card menu-spark rounded-[30px] border border-[#c9a56a]/18 bg-[linear-gradient(135deg,rgba(201,165,106,0.18),rgba(255,255,255,0.045)),radial-gradient(circle_at_78%_18%,rgba(244,63,94,0.18),transparent_16rem)] p-6 shadow-2xl shadow-black/25 sm:p-7 md:p-8 lg:p-9">
          <div className="events-giveaway-pill mb-8 inline-flex rounded-full border border-white/15 bg-black/25 px-4 py-2 text-xs uppercase tracking-[0.28em] text-[#f2d39a]">
            14.02 Giveaway
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:gap-4">
            {[
              language === "bg" ? "Пътешествие за двама" : "Trip for two",
              language === "bg" ? "3 дни SPA хотел" : "3 days SPA hotel",
              language === "bg" ? "Романтичен подарък" : "Romantic prize",
            ].map((item) => (
              <div key={item} className="events-giveaway-option min-w-0 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-semibold leading-5 text-white/82 md:min-h-[92px]">
                {item}
              </div>
            ))}
          </div>
          <p className="events-giveaway-text mt-8 text-sm leading-7 text-white/58">
            {language === "bg"
              ? "Специалните поводи при нас получават свой собствен жест, своя атмосфера и истинско усещане за празник."
              : "Special occasions with us receive their own gesture, atmosphere, and a true sense of celebration."}
          </p>
        </div>
      </div>
    </section>
  );
}
