export default function EventsSection({ language }) {
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
