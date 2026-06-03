export default function HeroSection({ t, onOpenReservation, onOpenMenu, language }) {
  return (
    <section className="site-hero relative min-h-[calc(100vh-92px)] overflow-hidden">
      <img
        src="/restaurant-terrace.jpg"
        alt={t.interiorAlt}
        className="absolute inset-0 h-full w-full scale-[1.03] object-cover object-[56%_center] md:object-center"
      />
      <div className="hero-soften absolute inset-0 backdrop-blur-[0.6px]" />
      <div className="hero-shade absolute inset-0 bg-[linear-gradient(90deg,rgba(7,5,4,0.96)_0%,rgba(9,7,5,0.82)_42%,rgba(9,7,5,0.28)_75%,rgba(9,7,5,0.64)_100%)]" />
      <div className="hero-warmth absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(201,165,106,0.18),transparent_24rem),radial-gradient(circle_at_16%_82%,rgba(36,115,78,0.2),transparent_24rem)]" />
      <div className="hero-bottom-fade absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#090705] to-transparent" />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-92px)] max-w-7xl items-center px-6 py-16 md:py-20">
        <div className="max-w-3xl">
          <img
            src="/casa-di-fratelli-logo.svg"
            alt={t.brand}
            className="brand-logo hero-logo mb-8 h-24 w-[270px] object-left md:h-32 md:w-[390px]"
          />
          <p className="section-kicker mb-5">
            {t.heroTag}
          </p>

          <h1 className="hero-title max-w-3xl text-5xl font-semibold leading-[1.02] text-[#fff4df] md:text-7xl">
            {t.heroTitle}
          </h1>

          <p className="hero-copy mt-6 max-w-2xl text-base leading-8 text-stone-200 md:text-lg">
            {t.heroText}
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={onOpenMenu}
              className="ghost-button rounded-full px-6 py-3 font-semibold"
            >
              {language === "bg" ? "Виж менюто" : "View menu"}
            </button>

            <button
              type="button"
              onClick={onOpenReservation}
              className="luxury-button rounded-full px-7 py-3 font-semibold"
            >
              {t.openTableMap}
            </button>
          </div>

          <div className="mt-12 grid max-w-xl grid-cols-3 gap-3 text-center sm:gap-4">
            <div className="luxury-panel rounded-2xl p-4">
              <div className="text-2xl font-semibold text-[#fff4df]">4,8</div>
              <div className="mt-1 text-[0.68rem] font-semibold tracking-[0.18em] text-[#f2c76f]" aria-label="5 stars">
                ★★★★★
              </div>
              <div className="mt-1 text-xs text-stone-400">{t.rating}</div>
            </div>

            <div className="luxury-panel rounded-2xl p-4">
              <div className="text-2xl font-semibold text-[#fff4df]">1000+</div>
              <div className="mt-1 text-xs text-stone-400">{t.reviewsCount}</div>
            </div>

            <div className="luxury-panel rounded-2xl p-4">
              <div className="text-2xl font-semibold text-[#fff4df]">7/7</div>
              <div className="mt-1 text-xs text-stone-400">{t.openDays}</div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
