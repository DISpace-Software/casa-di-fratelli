const deliveryLinks = [
  {
    key: "takeaway",
    name: "Takeaway.com",
    tone: "bg-[#ff7a1a]",
    href: "https://www.takeaway.com/bg/menu/jorjio-grill-pizzadzordzio-gril-pica?serviceType=delivery&utm_source=google&utm_medium=organic&utm_campaign=foodorder",
  },
  {
    key: "glovo",
    name: "Glovo",
    tone: "bg-[#ffc244]",
    href: "https://glovoapp.com/en/bg/plovdiv/stores/jorjio-grill-pizza-pdv",
  },
];

function ExternalIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}

function localText(language, bg, en, ru = bg) {
  if (language === "en") return en;
  if (language === "ru") return ru;
  return bg;
}

export default function DeliverySection({ language }) {
  return (
    <section id="delivery" className="delivery-section border-y border-white/8 px-6 py-20">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1fr_0.85fr] md:items-center">
        <div>
          <p className="section-kicker">
            {localText(language, "Доставка до вас", "Delivery to you", "Доставка для вас")}
          </p>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight text-[#fff4df] md:text-5xl">
            {localText(language, "Casa di Fratelli у дома.", "Casa di Fratelli at home.", "Casa di Fratelli у вас дома.")}
          </h2>
          <p className="mt-6 max-w-xl text-base leading-8 text-stone-400">
            {localText(
              language,
              "Поръчайте през Takeaway или Glovo - за обяд, вечеря или спокойна вечер с любимия вкус.",
              "Order through Takeaway or Glovo for lunch, dinner, or an easy evening with your favorite flavors.",
              "Закажите через Takeaway или Glovo - для обеда, ужина или спокойного вечера с любимым вкусом."
            )}
          </p>
        </div>

        <div className="grid gap-4">
          {deliveryLinks.map((link) => (
            <a
              key={link.key}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="delivery-card group flex items-center justify-between gap-4 rounded-[22px] border border-[#c9a56a]/18 bg-[#f2d39a]/10 p-5 transition hover:-translate-y-1 hover:border-[#c9a56a]/42"
            >
              <span className="flex min-w-0 items-center gap-4">
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${link.tone} text-sm font-black text-stone-950 shadow-lg shadow-black/10`}>
                  {link.name[0]}
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-semibold text-[#fff4df]">{link.name}</span>
                  <span className="mt-1 block text-sm text-stone-400">
                    {localText(language, "Поръчайте онлайн", "Order online", "Заказать онлайн")}
                  </span>
                </span>
              </span>
              <span className="text-[#c9a56a] transition group-hover:translate-x-1 group-hover:-translate-y-1">
                <ExternalIcon />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
