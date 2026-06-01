const awardsText = {
  bg: {
    kicker: "Награди",
    title: "Две големи признания за Casa di Fratelli.",
    text: "През 2026 Casa di Fratelli печели Grand Prix за най-добър италиански ресторант, а шеф Сули Юруков е отличен като Готвач на годината.",
    awards: [
      {
        title: "Най-добър италиански ресторант",
        text: "Grand Prix признание за кухня с характер, премиални продукти и италиански дух, поднесен с пловдивска топлота.",
        image: "/award-best-italian-restaurant-2026.png",
        alt: "Grand Prix за най-добър италиански ресторант Casa di Fratelli 2026",
      },
      {
        title: "Готвач на годината",
        text: "Отличие за шеф Сули Юруков и неговия авторски почерк - ястия с техника, баланс и запомнящ се вкус.",
        image: "/award-chef-of-year-2026.png",
        alt: "Готвач на годината 2026 Сули Юруков",
      },
    ],
  },
  en: {
    kicker: "Awards",
    title: "Two major honors for Casa di Fratelli.",
    text: "In 2026 Casa di Fratelli received the Grand Prix for Best Italian Restaurant, while Chef Suli Yurukov was honored as Chef of the Year.",
    awards: [
      {
        title: "Best Italian Restaurant",
        text: "A Grand Prix recognition for cuisine with character, premium products, and Italian spirit served with Plovdiv warmth.",
        image: "/award-best-italian-restaurant-2026.png",
        alt: "Grand Prix Best Italian Restaurant Casa di Fratelli 2026",
      },
      {
        title: "Chef of the Year",
        text: "An award for Chef Suli Yurukov and his signature style - technique, balance, and memorable flavor.",
        image: "/award-chef-of-year-2026.png",
        alt: "Chef of the Year 2026 Suli Yurukov",
      },
    ],
  },
};

export default function AwardsSection({ language }) {
  const copy = awardsText[language] || awardsText.bg;

  return (
    <section id="awards" className="mx-auto max-w-7xl px-6 py-24">
      <div className="mx-auto max-w-3xl text-center">
        <p className="section-kicker">{copy.kicker}</p>
        <h2 className="mt-4 text-3xl font-semibold leading-tight text-[#fff4df] md:text-5xl">
          {copy.title}
        </h2>
        <p className="mt-6 text-base leading-8 text-stone-400">
          {copy.text}
        </p>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        {copy.awards.map((award, index) => (
          <article
            key={award.title}
            className="award-card relative overflow-hidden rounded-[30px] p-6 md:p-8"
          >
            <div className="award-card-glow" />
            <div className="relative grid gap-7 sm:grid-cols-[0.95fr_1fr] sm:items-center">
              <div className="award-trophy-stage flex min-h-[360px] items-end justify-center rounded-[26px] px-4 pt-6">
                <img
                  src={award.image}
                  alt={award.alt}
                  className={`award-trophy w-full max-w-[260px] object-contain ${
                    index === 1 ? "max-w-[252px]" : ""
                  }`}
                />
              </div>

              <div>
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-[#c9a56a]/26 bg-[#c9a56a]/12 text-sm font-bold text-[#f2d39a]">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <h3 className="text-2xl font-semibold leading-tight text-white">
                  {award.title}
                </h3>
                <p className="award-text mt-4 text-sm leading-7 text-white/64">
                  {award.text}
                </p>
                <div className="mt-6 h-px w-full bg-gradient-to-r from-[#c9a56a]/60 via-white/18 to-transparent" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
