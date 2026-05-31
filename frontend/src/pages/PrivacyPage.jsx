import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
import privacyPolicy from "../data/privacyPolicy";

function PolicySection({ section }) {
  return (
    <section className="rounded-[26px] border border-white/10 bg-white/[0.04] p-5 md:p-6">
      <h2 className="text-xl font-semibold text-[#fff4df]">{section.title}</h2>

      {section.paragraphs?.map((paragraph) => (
        <p key={paragraph} className="mt-4 leading-7 text-white/68">
          {paragraph}
        </p>
      ))}

      {section.list && (
        <ul className="mt-4 grid gap-2 text-white/68">
          {section.list.map((item) => (
            <li key={item} className="flex gap-3 leading-7">
              <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c9a56a]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function PrivacyPage({
  t,
  language,
  setLanguage,
  onOpenReservation,
  onOpenMenu,
  onOpenSection,
  onBackHome,
  theme,
  onToggleTheme,
}) {
  const policy = privacyPolicy[language] || privacyPolicy.bg;

  return (
    <div className="luxury-shell min-h-screen text-white">
      <Header
        t={t}
        language={language}
        setLanguage={setLanguage}
        onOpenReservation={onOpenReservation}
        onOpenMenu={onOpenMenu}
        onOpenSection={onOpenSection}
        onGoHome={onBackHome}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      <main className="mx-auto max-w-5xl px-6 pb-16 pt-8 md:pb-24 md:pt-12">
        <div className="menu-spark rounded-[32px] border border-[#c9a56a]/20 bg-[radial-gradient(circle_at_top_left,rgba(201,165,106,0.18),transparent_34%),rgba(255,255,255,0.04)] p-6 shadow-2xl shadow-black/25 md:p-9">
          <p className="section-kicker">{policy.updated}</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight text-[#fff4df] md:text-6xl">
            {policy.title}
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-white/68">
            {policy.intro}
          </p>
        </div>

        <div className="mt-8 grid gap-4">
          {policy.sections.map((section) => (
            <PolicySection key={section.title} section={section} />
          ))}
        </div>
      </main>

      <Footer t={t} />
    </div>
  );
}
