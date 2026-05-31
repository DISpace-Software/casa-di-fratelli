import React from "react";

function LocationIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" />
      <path d="M12 10h.01" />
    </svg>
  );
}

export default function Header({
  t,
  language,
  setLanguage,
  onOpenReservation,
  onOpenMenu,
  onGoHome,
  onOpenSection,
  isMenuPage = false,
  theme = "dark",
  onToggleTheme,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const locationUrl =
    "https://www.google.com/maps/search/?api=1&query=Casa%20di%20Fratelli%20Plovdiv";
  const locationLabel = t.navLocation || (language === "bg" ? "Локация" : "Location");
  const menuLabel = language === "bg" ? "Меню" : "Menu";
  const sectionLinks = [
    ["#about", t.navAbout, "01"],
    ["#gallery", t.navGallery, "02"],
    ["#awards", t.navAwards || (language === "bg" ? "Награди" : "Awards"), "03"],
    ["#delivery", language === "bg" ? "Доставка" : "Delivery", "04"],
    ["#reviews", t.navReviews || (language === "bg" ? "Отзиви" : "Reviews"), "05"],
    ["#events", t.navEvents || (language === "bg" ? "Събития" : "Events"), "06"],
  ];

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const openMenuPage = () => {
    closeMobileMenu();
    onOpenMenu();
  };

  const openReservationPage = () => {
    closeMobileMenu();
    onOpenReservation();
  };

  const changeLanguage = (nextLanguage) => {
    setLanguage(nextLanguage);
    closeMobileMenu();
  };
  const openSection = (event, href) => {
    event.preventDefault();
    closeMobileMenu();
    const sectionId = href.replace("#", "");
    if (onOpenSection) {
      onOpenSection(sectionId);
      return;
    }

    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const mobileLinkClass =
    "flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm font-semibold text-[#fff4df] transition active:scale-[0.98] hover:border-[#c9a56a]/35 hover:bg-[#c9a56a]/10";

  return (
    <>
    <header className="luxury-header fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#090705]/90 backdrop-blur-2xl">
      <div className="mx-auto max-w-7xl px-4 py-3 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              closeMobileMenu();
              onGoHome();
            }}
            className="brand-led nav-reveal group min-w-0 text-left transition hover:opacity-95"
          >
            <img
              src="/casa-di-fratelli-logo.svg"
              alt={t.brand}
              className="brand-logo h-11 w-[142px] object-left md:h-16 md:w-[210px]"
            />
          </button>

          <div className="nav-reveal nav-reveal-delay-1 hidden items-center gap-2 md:flex">
            <a
              href={locationUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={locationLabel}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[#c9a56a]/30 bg-[#c9a56a]/10 text-[#f2d39a] transition hover:border-[#f2d39a]/60 hover:bg-[#c9a56a]/16 hover:text-white"
            >
              <LocationIcon className="h-4 w-4" />
            </a>

            <div className="flex rounded-full border border-white/10 bg-white/[0.06] p-1 shadow-inner">
              <button
                type="button"
                onClick={() => changeLanguage("bg")}
                className={`rounded-full px-4 py-2 text-xs font-medium transition ${
                  language === "bg"
                    ? "bg-[#c9a56a] text-stone-950 shadow-lg shadow-[#c9a56a]/20"
                    : "text-stone-300 hover:text-white"
                }`}
              >
                BG
              </button>
              <button
                type="button"
                onClick={() => changeLanguage("en")}
                className={`rounded-full px-4 py-2 text-xs font-medium transition ${
                  language === "en"
                    ? "bg-[#c9a56a] text-stone-950 shadow-lg shadow-[#c9a56a]/20"
                    : "text-stone-300 hover:text-white"
                }`}
              >
                EN
              </button>
            </div>

            {onToggleTheme ? (
              <button
                type="button"
                onClick={onToggleTheme}
                className="flex h-10 min-w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] px-3 text-xs font-semibold text-stone-300 transition hover:border-[#c9a56a]/35 hover:text-white"
              >
                {theme === "light" ? "Dark" : "Light"}
              </button>
            ) : null}
          </div>

          <div className="nav-reveal nav-reveal-delay-1 flex items-center gap-2 md:hidden">
            <a
              href={locationUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={locationLabel}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[#c9a56a]/30 bg-[#c9a56a]/10 text-[#f2d39a] shadow-[0_10px_28px_rgba(201,165,106,0.12)] transition active:scale-95"
            >
              <LocationIcon className="h-4 w-4" />
            </a>

            <div className="flex rounded-full border border-white/10 bg-white/[0.06] p-1 shadow-inner">
              {["bg", "en"].map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => changeLanguage(code)}
                  className={`rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition ${
                    language === code
                      ? "bg-[#c9a56a] text-stone-950 shadow-lg shadow-[#c9a56a]/20"
                      : "text-stone-300"
                  }`}
                >
                  {code.toUpperCase()}
                </button>
              ))}
            </div>

            {onToggleTheme ? (
              <button
                type="button"
                onClick={onToggleTheme}
                className="flex h-10 min-w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] px-2 text-[10px] font-semibold text-stone-300 transition active:scale-95"
              >
                {theme === "light" ? "Dark" : "Light"}
              </button>
            ) : null}

            <button
              type="button"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((isOpen) => !isOpen)}
              className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] text-[#fff4df] shadow-inner transition active:scale-95"
            >
              <span
                className={`h-[1.5px] w-4 rounded-full bg-current transition ${
                  mobileMenuOpen ? "translate-y-2 rotate-45" : ""
                }`}
              />
              <span
                className={`h-[1.5px] w-4 rounded-full bg-current transition ${
                  mobileMenuOpen ? "opacity-0" : ""
                }`}
              />
              <span
                className={`h-[1.5px] w-4 rounded-full bg-current transition ${
                  mobileMenuOpen ? "-translate-y-2 -rotate-45" : ""
                }`}
              />
            </button>
          </div>
        </div>

        <div className={`nav-reveal nav-reveal-delay-2 mt-3 grid gap-2 md:hidden ${isMenuPage ? "grid-cols-1" : "grid-cols-[1fr_1fr]"}`}>
          {!isMenuPage && (
            <button
              type="button"
              onClick={openMenuPage}
              className="ghost-button rounded-full px-4 py-2.5 text-sm font-semibold"
            >
              {menuLabel}
            </button>
          )}
          <button
            type="button"
            onClick={openReservationPage}
            className="luxury-button rounded-full px-4 py-2.5 text-sm font-semibold"
          >
            {language === "bg" ? "Резервирай" : "Reserve"}
          </button>
        </div>

        <div className="mt-4 hidden items-center justify-between gap-3 md:flex">
          <nav className="nav-reveal nav-reveal-delay-2 flex gap-7 text-sm text-stone-300">
            {sectionLinks.map(([href, label]) => (
              <a
                key={href}
                href={href}
                onClick={(event) => openSection(event, href)}
                className="transition hover:text-[#f2d39a]"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="nav-reveal nav-reveal-delay-3 flex items-center gap-4">
            {!isMenuPage && (
              <button
                type="button"
                onClick={onOpenMenu}
                className="ghost-button rounded-full px-5 py-3 text-sm font-medium"
              >
                {menuLabel}
              </button>
            )}

            <button
              type="button"
              onClick={onOpenReservation}
              className="luxury-button rounded-full px-5 py-3 text-sm font-semibold"
            >
              {t.reserveNow}
            </button>
          </div>
        </div>

        <div
          className={`overflow-hidden transition-all duration-300 md:hidden ${
            mobileMenuOpen ? "mt-3 max-h-[440px] opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <nav className="rounded-[26px] border border-white/10 bg-[#15110d]/92 p-2 shadow-2xl shadow-black/35 backdrop-blur-2xl">
            {sectionLinks.map(([href, label], index) => (
              <a
                key={href}
                href={href}
                onClick={(event) => openSection(event, href)}
                className={`${mobileLinkClass} ${index > 0 ? "mt-2" : ""}`}
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </header>
    <div aria-hidden="true" className="h-[124px] md:h-[152px]" />
    </>
  );
}
