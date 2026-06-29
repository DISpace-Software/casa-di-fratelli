import React from "react";

export default function HeroSection({ t, onOpenReservation, onOpenMenu, language }) {
  const [deliveryOpen, setDeliveryOpen] = React.useState(false);
  const directPhone = "0888218318";
  const takeawayUrl = "https://www.takeaway.com/bg/menu/jorjio-grill-pizzadzordzio-gril-pica?serviceType=delivery&utm_source=google&utm_medium=organic&utm_campaign=foodorder";
  const glovoUrl = "https://glovoapp.com/en/bg/plovdiv/stores/jorjio-grill-pizza-pdv";

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
      <img
        src="/hero-chef-plating-cutout.png"
        alt=""
        aria-hidden="true"
        className="hero-chef-overlay pointer-events-none absolute bottom-0 right-0 z-[2] h-[52vh] max-h-[760px] w-[66vw] max-w-[860px] object-contain object-right-bottom opacity-95 md:h-[88vh] md:w-[48vw]"
      />

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

          <div className="mt-8 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={() => setDeliveryOpen(true)}
              className="luxury-button rounded-full px-7 py-3 font-semibold"
            >
              {language === "bg" ? "Casa di Fratelli у дома" : "Casa di Fratelli at home"}
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

            <div className="hero-days-stat luxury-panel rounded-2xl p-4">
              <div className="text-2xl font-semibold text-[#fff4df]">7/7</div>
              <div className="mt-1 text-xs text-stone-400">{t.openDays}</div>
            </div>
          </div>

        </div>
      </div>

      {deliveryOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="luxury-panel w-full max-w-lg rounded-[32px] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.65)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="section-kicker">{language === "bg" ? "Поръчка за вкъщи" : "Order at home"}</p>
                <h2 className="mt-3 text-3xl font-semibold text-[#fff4df]">
                  {language === "bg" ? "Casa di Fratelli у дома" : "Casa di Fratelli at home"}
                </h2>
                <p className="mt-3 text-sm leading-6 text-white/62">
                  {language === "bg"
                    ? "Изберете най-удобния начин за поръчка. При директна поръчка и взимане от ресторанта получавате 10% отстъпка."
                    : "Choose the easiest way to order. Direct pickup from the restaurant includes 10% discount."}
                </p>
              </div>
              <button type="button" onClick={() => setDeliveryOpen(false)} className="ghost-button rounded-full px-3 py-2 text-lg" aria-label="Close">
                ×
              </button>
            </div>
            <div className="mt-6 grid gap-3">
              <a href={takeawayUrl} target="_blank" rel="noreferrer" className="delivery-card rounded-[22px] border border-[#c9a56a]/20 bg-[#f2d39a]/10 p-4 font-semibold text-[#fff4df] transition hover:border-[#c9a56a]/45">
                Takeaway
              </a>
              <a href={glovoUrl} target="_blank" rel="noreferrer" className="delivery-card rounded-[22px] border border-[#c9a56a]/20 bg-[#f2d39a]/10 p-4 font-semibold text-[#fff4df] transition hover:border-[#c9a56a]/45">
                Glovo
              </a>
              <a href={`tel:${directPhone}`} className="rounded-[22px] border border-emerald-300/25 bg-emerald-400/12 p-4 font-semibold text-emerald-100 transition hover:border-emerald-200/45">
                {language === "bg" ? "Поръчай директно и вземи от ресторанта · 10% отстъпка" : "Order direct and pick up · 10% discount"}
                <span className="mt-1 block text-sm font-normal text-emerald-100/65">088 821 8318</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
