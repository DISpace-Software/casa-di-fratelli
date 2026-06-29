import { chefImage } from "../../data/restaurantData";

function localText(language, bg, en, ru = bg) {
  if (language === "en") return en;
  if (language === "ru") return ru;
  return bg;
}

export default function MenuHero({ data, onOpenReservation, language }) {
  return (
    <section className="relative overflow-hidden border-b border-white/10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(201,165,106,0.2),transparent_32rem),radial-gradient(circle_at_90%_10%,rgba(40,160,116,0.14),transparent_28rem)]" />

      <div className="mx-auto grid max-w-7xl items-center gap-7 px-5 py-7 md:grid-cols-2 md:gap-10 md:px-6 md:py-24">
        <div className="relative z-10">
          <img
            src="/casa-di-fratelli-logo.svg"
            alt="Casa di Fratelli"
            className="brand-logo mb-5 h-16 w-[210px] object-left md:mb-7 md:h-20 md:w-[260px]"
          />
          <div className="section-kicker mb-4">
            {data.heroBadge}
          </div>

          <h1 className="max-w-2xl text-4xl font-semibold leading-tight text-[#fff4df] md:text-7xl">
            {data.heroTitle}
          </h1>

          <p className="mt-4 max-w-xl text-sm leading-7 text-white/70 md:mt-6 md:text-lg md:leading-8">
            {data.heroText}
          </p>

          <div className="mt-8 hidden flex-wrap gap-4 md:flex">
            <button
              type="button"
              onClick={onOpenReservation}
              className="luxury-button rounded-full px-7 py-3 font-semibold"
            >
              {localText(language, "Резервирай маса", "Reserve table", "Забронировать стол")}
            </button>
          </div>
        </div>

        <div className="relative block">
          <div className="absolute -inset-6 rounded-[2rem] bg-[#c9a56a]/10 blur-3xl" />
          <div className="relative overflow-hidden rounded-[28px] border border-white/10 p-2 shadow-2xl shadow-black/30">
            <img
              src={chefImage}
              alt="Chef"
              className="h-[360px] w-full rounded-[22px] object-cover object-[50%_22%] md:h-[560px] md:object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6">
              <div className="mb-2 text-xs uppercase tracking-[0.3em] text-[#d8b377]">
                {localText(language, "Шеф готвач", "Chef portrait", "Шеф-повар")}
              </div>
              <div className="text-3xl font-serif text-white">Chef Yurukov</div>
              <div className="mt-2 text-sm text-white/70">
                {localText(
                  language,
                  "Авторски ястия, премиални продукти и стилно поднасяне.",
                  "Signature dishes, premium ingredients, and refined presentation.",
                  "Авторские блюда, премиальные продукты и изящная подача."
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
