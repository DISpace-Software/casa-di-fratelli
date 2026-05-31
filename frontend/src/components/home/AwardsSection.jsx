const awardsText = {
  bg: {
    kicker: "Награди",
    title: "Две големи признания за Casa di Fratelli.",
    text: "През 2026 Casa di Fratelli печели Grand Prix за най-добър италиански ресторант, а шеф Сули Юруков е отличен като Готвач на годината.",
    leftTitle: "Най-добър италиански ресторант",
    leftText: "Grand Prix признание за кухня с характер, премиални продукти и италиански дух, поднесен с пловдивска топлота.",
    rightTitle: "Готвач на годината",
    rightText: "Отличие за шеф Сули Юруков и неговия авторски почерк - ястия с техника, баланс и запомнящ се вкус.",
  },
  en: {
    kicker: "Awards",
    title: "Two major honors for Casa di Fratelli.",
    text: "In 2026 Casa di Fratelli received the Grand Prix for Best Italian Restaurant, while Chef Suli Yurukov was honored as Chef of the Year.",
    leftTitle: "Best Italian Restaurant",
    leftText: "A Grand Prix recognition for cuisine with character, premium products, and Italian spirit served with Plovdiv warmth.",
    rightTitle: "Chef of the Year",
    rightText: "An award for Chef Suli Yurukov and his signature style - technique, balance, and memorable flavor.",
  },
};

export default function AwardsSection({ language }) {
  const copy = awardsText[language] || awardsText.bg;

  return (
    <section id="awards" className="mx-auto max-w-7xl px-6 py-24">
      <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <p className="section-kicker">{copy.kicker}</p>
          <h2 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight text-[#fff4df] md:text-5xl">
            {copy.title}
          </h2>
          <p className="mt-6 max-w-xl text-base leading-8 text-stone-400">
            {copy.text}
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {[
              [copy.leftTitle, copy.leftText],
              [copy.rightTitle, copy.rightText],
            ].map(([title, text]) => (
              <article key={title} className="luxury-panel rounded-[24px] p-5">
                <div className="mb-4 h-1 w-14 rounded-full bg-[#c9a56a]" />
                <h3 className="text-lg font-semibold text-white">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-white/62">{text}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="award-image-wrap luxury-panel overflow-hidden rounded-[30px] p-3">
          <img
            src="/awards-2026.png"
            alt={language === "bg" ? "Награди Casa di Fratelli 2026" : "Casa di Fratelli 2026 awards"}
            className="award-image h-full max-h-[680px] w-full rounded-[24px] object-contain"
          />
        </div>
      </div>
    </section>
  );
}
