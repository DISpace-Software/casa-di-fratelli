import React from "react";
import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
import MenuHero from "../components/menu/MenuHero";
import ChefHighlight from "../components/menu/ChefHighlight";
import MenuCategorySection from "../components/menu/MenuCategorySection";
import menuPageData from "../data/menuPageData";
import { buildMenuDataFromCms } from "../utils/menuUtils";
import { API_BASE_URL } from "../config/api";

function readOrderLinkParams() {
  if (typeof window === "undefined") {
    return { reservationId: "", token: "" };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    reservationId: params.get("reservation") || "",
    token: params.get("token") || "",
  };
}

function formatOrderPrice(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function MenuExperienceStrip({ data, language, onCategoryClick }) {
  const signatureItems = data.categories
    .flatMap((category) => category.items.map((item) => ({ ...item, categoryTitle: category.title, categoryId: category.id })))
    .filter((item) => item.featured || item.imageUrl)
    .slice(0, 4);

  const heroItem = signatureItems[0] || data.categories[0]?.items?.[0];
  const smallItems = signatureItems.slice(1, 4);

  if (!heroItem) return null;

  return (
    <section className="menu-experience mx-auto grid max-w-7xl gap-4 px-4 pt-8 md:grid-cols-[1.15fr_0.85fr] md:px-6 md:pt-10">
      <button
        type="button"
        onClick={() => heroItem.categoryId && onCategoryClick(heroItem.categoryId)}
        className="menu-feature-panel menu-spark group relative min-h-[420px] overflow-hidden rounded-[32px] border border-white/10 bg-[#120e0b] text-left shadow-2xl shadow-black/30"
      >
        {heroItem.imageUrl ? (
          <img
            src={heroItem.imageUrl}
            alt={heroItem.name}
            className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
          />
        ) : (
          <img
            src="/restaurant-interior.webp"
            alt="Casa di Fratelli"
            className="absolute inset-0 h-full w-full object-cover opacity-55 transition duration-700 group-hover:scale-[1.04]"
          />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,5,4,0.86),rgba(7,5,4,0.22)),linear-gradient(0deg,rgba(0,0,0,0.62),transparent_58%)]" />
        <div className="relative flex min-h-[420px] flex-col justify-end p-6 md:p-8">
          <div className="mb-4 inline-flex w-fit rounded-full border border-[#c9a56a]/35 bg-black/35 px-4 py-2 text-xs uppercase tracking-[0.24em] text-[#f2d39a] backdrop-blur">
            {language === "bg" ? "Авторска селекция" : "Signature plate"}
          </div>
          <h2 className="max-w-2xl text-4xl font-semibold leading-tight text-[#fff4df] md:text-6xl">
            {heroItem.name}
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/75 md:text-base">
            {heroItem.description}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className="rounded-full border border-white/15 bg-black/35 px-4 py-2 text-sm text-white/75 backdrop-blur">
              {heroItem.categoryTitle}
            </span>
            <span className="rounded-full bg-[#c9a56a] px-4 py-2 text-sm font-semibold text-black">
              {heroItem.price}
            </span>
          </div>
        </div>
      </button>

      <div className="grid gap-4">
        <div className="rounded-[30px] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/15 backdrop-blur">
          <div className="section-kicker">
            {language === "bg" ? "Навигация с вкус" : "Taste navigation"}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {data.categories.slice(0, 8).map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => onCategoryClick(category.id)}
                className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-left transition hover:border-[#c9a56a]/35 hover:bg-[#c9a56a]/10"
              >
                <div className="truncate text-sm font-semibold text-[#fff4df]">{category.title}</div>
                <div className="mt-1 text-xs text-white/45">
                  {category.items.length} {language === "bg" ? "позиции" : "items"}
                </div>
              </button>
            ))}
          </div>
        </div>

        {smallItems.map((item) => (
          <button
            key={`${item.categoryId}-${item.name}`}
            type="button"
            onClick={() => onCategoryClick(item.categoryId)}
            className="group grid grid-cols-[96px_1fr] overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.045] text-left shadow-xl shadow-black/15 transition hover:-translate-y-0.5 hover:border-[#c9a56a]/35"
          >
            <div className="h-full min-h-[118px] bg-black/25">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.05]" />
              ) : (
                <div className="h-full w-full bg-[radial-gradient(circle_at_50%_20%,rgba(201,165,106,0.26),transparent_60%),linear-gradient(135deg,#211812,#090705)]" />
              )}
            </div>
            <div className="p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-[#d8b377]">{item.categoryTitle}</div>
              <div className="mt-2 text-base font-semibold leading-snug text-[#fff4df]">{item.name}</div>
              <div className="mt-3 text-sm text-white/55">{item.price}</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function MenuPage({
  t,
  language,
  setLanguage,
  onOpenReservation,
  onBackHome,
  onOpenSection,
  onOpenPrivacy,
  cmsMenuItems,
  theme,
  onToggleTheme,
}) {
  const data = React.useMemo(
    () => buildMenuDataFromCms(cmsMenuItems, language, menuPageData[language]),
    [cmsMenuItems, language]
  );
  const [activeCategory, setActiveCategory] = React.useState(
    data.categories[0]?.id || ""
  );
  const [orderParams] = React.useState(readOrderLinkParams);
  const [orderSession, setOrderSession] = React.useState(null);
  const [orderItems, setOrderItems] = React.useState([]);
  const [orderNotes, setOrderNotes] = React.useState("");
  const [orderError, setOrderError] = React.useState("");
  const [orderNotice, setOrderNotice] = React.useState("");
  const [showOrderReview, setShowOrderReview] = React.useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = React.useState(false);
  const categoryNavRef = React.useRef(null);
  const activeCategoryButtonRef = React.useRef(null);
  const manualCategoryRef = React.useRef("");
  const manualCategoryTimerRef = React.useRef(null);
  const activeCategoryData =
    data.categories.find((category) => category.id === activeCategory) ||
    data.categories[0];
  const orderEnabled = Boolean(orderParams.reservationId && orderParams.token && orderSession);
  const orderTotal = orderItems.reduce((total, item) => total + Number(item.priceValue || 0) * item.quantity, 0);

  React.useEffect(() => {
    const sectionIds = data.categories.map((category) => category.id);

    const handleScroll = () => {
      if (manualCategoryRef.current) return;

      let current = sectionIds[0];

      for (const id of sectionIds) {
        const element = document.getElementById(id);
        if (!element) continue;

        const rect = element.getBoundingClientRect();

        if (rect.top <= 160) {
          current = id;
        }
      }

      setActiveCategory(current);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll);

    return () => window.removeEventListener("scroll", handleScroll);
  }, [data.categories]);

  React.useEffect(() => {
    const container = categoryNavRef.current;
    const activeButton = activeCategoryButtonRef.current;
    if (!container || !activeButton) return;

    const containerBox = container.getBoundingClientRect();
    const buttonBox = activeButton.getBoundingClientRect();
    const nextScrollLeft =
      container.scrollLeft +
      (buttonBox.left - containerBox.left) -
      containerBox.width / 2 +
      buttonBox.width / 2;

    container.scrollTo({
      left: Math.max(0, nextScrollLeft),
      behavior: "smooth",
    });
  }, [activeCategory]);

  React.useEffect(() => () => {
    if (manualCategoryTimerRef.current) {
      window.clearTimeout(manualCategoryTimerRef.current);
    }
  }, []);

  const handleCategoryClick = (id) => {
    const element = document.getElementById(id);
    if (!element) return;

    setActiveCategory(id);
    manualCategoryRef.current = id;
    if (manualCategoryTimerRef.current) {
      window.clearTimeout(manualCategoryTimerRef.current);
    }
    manualCategoryTimerRef.current = window.setTimeout(() => {
      manualCategoryRef.current = "";
    }, 850);

    element.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const isOrderLink = Boolean(orderParams.reservationId && orderParams.token);

  React.useEffect(() => {
    if (!orderParams.reservationId || !orderParams.token) return;

    let cancelled = false;

    async function loadOrderSession() {
      setOrderError("");
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/dining-orders/session?reservationId=${encodeURIComponent(orderParams.reservationId)}&token=${encodeURIComponent(orderParams.token)}`
        );
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.message || (language === "bg" ? "Линкът за поръчка не е активен." : "The order link is not active."));
        }

        if (!cancelled) setOrderSession(payload);
      } catch (error) {
        if (!cancelled) setOrderError(error?.message || (language === "bg" ? "Не успяхме да заредим поръчката." : "Could not load the order session."));
      }
    }

    loadOrderSession();
    const timer = window.setInterval(loadOrderSession, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [language, orderParams.reservationId, orderParams.token]);

  function addToOrder(item) {
    setOrderNotice("");
    setOrderError("");
    setOrderItems((prev) => {
      const key = item.id || item.name;
      const existing = prev.find((entry) => entry.key === key);
      if (existing) {
        return prev.map((entry) =>
          entry.key === key ? { ...entry, quantity: Math.min(entry.quantity + 1, 99) } : entry
        );
      }

      return [
        ...prev,
        {
          key,
          menuItemId: Number.isFinite(Number(item.id)) ? Number(item.id) : null,
          name: item.name,
          priceValue: Number(item.priceValue || 0),
          quantity: 1,
        },
      ];
    });
  }

  function updateOrderQuantity(key, nextQuantity) {
    const quantity = Number(nextQuantity || 0);
    setOrderItems((prev) =>
      quantity <= 0
        ? prev.filter((item) => item.key !== key)
        : prev.map((item) => (item.key === key ? { ...item, quantity: Math.min(quantity, 99) } : item))
    );
  }

  async function submitOrder() {
    if (!orderEnabled || orderItems.length === 0) return;

    setIsSubmittingOrder(true);
    setOrderError("");
    setOrderNotice("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/dining-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: Number(orderParams.reservationId),
          token: orderParams.token,
          notes: orderNotes,
          items: orderItems.map((item) => ({
            menuItemId: item.menuItemId,
            name: item.name,
            unitPrice: item.priceValue,
            quantity: item.quantity,
          })),
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message || (language === "bg" ? "Поръчката не беше изпратена." : "The order was not sent."));
      }

      setOrderItems([]);
      setOrderNotes("");
      setShowOrderReview(false);
      setOrderNotice(language === "bg" ? "Поръчката е изпратена към екипа." : "Your order was sent to the team.");
    } catch (error) {
      setOrderError(error?.message || (language === "bg" ? "Поръчката не беше изпратена." : "The order was not sent."));
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  return (
    <div className={`luxury-shell min-h-screen text-white ${orderEnabled ? "pb-40" : ""}`}>
      {!isOrderLink && (
        <>
          <Header
            t={t}
            language={language}
            setLanguage={setLanguage}
            onOpenReservation={onOpenReservation}
            onOpenMenu={() => {}}
            onOpenSection={onOpenSection}
            onGoHome={onBackHome}
            isMenuPage
            theme={theme}
            onToggleTheme={onToggleTheme}
          />

          <MenuHero
            data={data}
            onOpenReservation={onOpenReservation}
            language={language}
          />
        </>
      )}

      {(orderSession || orderError) && (
        <div className="sticky top-0 z-50 border-b border-[#c9a56a]/20 bg-[#14100c]/95 backdrop-blur-2xl">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
            <div>
              <div className="section-kicker">
                Casa di Fratelli
              </div>
              <h1 className="mt-1 text-xl font-semibold text-[#fff4df]">
                {language === "bg" ? "Дигитално меню" : "Digital menu"}
              </h1>
              <div className="mt-1 text-sm text-white/70">
                {orderSession
                  ? `${language === "bg" ? "Маса" : "Table"} ${orderSession.tableIds?.join(", ")} · ${orderSession.guestName}`
                  : orderError}
              </div>
            </div>
            {orderNotice && <div className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-100">{orderNotice}</div>}
          </div>
        </div>
      )}

      <div className={`sticky ${isOrderLink ? "top-[88px] md:top-[92px]" : "top-[124px] md:top-[152px]"} z-40 border-y border-white/10 bg-[#090705]/90 backdrop-blur-2xl`}>
        <div className="mx-auto max-w-7xl px-4 py-3 md:px-6 md:py-3">
          <div className="mb-2 flex items-center justify-between gap-3 md:hidden">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] text-[#d8b377]">
                {language === "bg" ? "Секция" : "Section"}
              </div>
              <div className="truncate text-sm font-semibold text-[#fff4df]">
                {activeCategoryData?.title}
              </div>
            </div>
            <button
              type="button"
              onClick={onBackHome}
              className={`ghost-button shrink-0 rounded-full px-3 py-2 text-xs font-medium ${isOrderLink ? "hidden" : ""}`}
            >
              {language === "bg" ? "Начало" : "Home"}
            </button>
          </div>

          <div className="menu-category-rail relative -mx-4 md:mx-0">
            <div className="pointer-events-none absolute bottom-1 left-0 top-0 z-10 w-8 bg-gradient-to-r from-[#090705] to-transparent md:hidden" />
            <div className="pointer-events-none absolute bottom-1 right-0 top-0 z-10 w-8 bg-gradient-to-l from-[#090705] to-transparent md:hidden" />

            <div
              ref={categoryNavRef}
              className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 scrollbar-none md:px-0 md:gap-3"
            >
              {data.categories.map((category, index) => {
                const isActive = activeCategory === category.id;

                return (
                  <button
                    key={category.id}
                    ref={isActive ? activeCategoryButtonRef : null}
                    type="button"
                    aria-current={isActive ? "true" : undefined}
                    onClick={() => handleCategoryClick(category.id)}
                    className={`menu-category-chip min-w-[9.4rem] snap-start rounded-2xl border px-3.5 py-3 text-left transition active:scale-[0.98] md:min-w-0 md:rounded-full md:px-4 md:py-2 ${
                      isActive
                        ? "border-[#c9a56a]/45 bg-[#c9a56a] text-black shadow-lg shadow-[#c9a56a]/20"
                        : "border-white/10 bg-white/5 text-white/75 hover:border-[#c9a56a]/30 hover:text-[#f2d3a0]"
                    }`}
                  >
                    <span className={`block text-[10px] font-semibold uppercase tracking-[0.22em] md:hidden ${
                      isActive ? "text-black/55" : "text-[#d8b377]"
                    }`}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="mt-1 block truncate text-sm font-semibold md:mt-0 md:inline md:text-sm">
                      {category.title}
                    </span>
                    <span className={`mt-1 block text-xs md:hidden ${
                      isActive ? "text-black/60" : "text-white/45"
                    }`}>
                      {category.items.length} {language === "bg" ? "позиции" : "items"}
                    </span>
                  </button>
                );
              })}

              {!isOrderLink && (
                <button
                  type="button"
                  onClick={onBackHome}
                  className="ghost-button hidden whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium md:block"
                >
                  {language === "bg" ? "Начало" : "Home"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {!isOrderLink && (
        <MenuExperienceStrip
          data={data}
          language={language}
          onCategoryClick={handleCategoryClick}
        />
      )}

      <div className="flex flex-col">
        <div className={`${isOrderLink ? "order-1" : "order-2"} mx-auto grid max-w-7xl gap-10 px-4 pb-12 pt-8 md:gap-14 md:px-6 md:pb-20 md:pt-10`}>
          {data.categories.map((category) => (
            <MenuCategorySection
              key={category.id}
              category={category}
              language={language}
              orderEnabled={orderEnabled}
              onAddToOrder={addToOrder}
            />
          ))}
        </div>

        {!isOrderLink && <div className="order-1">
          <ChefHighlight data={data} />
        </div>}
      </div>

      {orderEnabled && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#c9a56a]/25 bg-[#090705]/95 px-4 py-3 text-white shadow-[0_-18px_60px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
          <div className="mx-auto grid max-w-7xl gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-[#d8b377]">
                    {language === "bg" ? "Вашата поръчка" : "Your order"}
                  </div>
                  <div className="mt-1 text-sm text-white/60">
                    {orderItems.length} {language === "bg" ? "позиции" : "items"} · {formatOrderPrice(orderTotal)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOrderReview(true)}
                  disabled={orderItems.length === 0 || isSubmittingOrder}
                  className="luxury-button rounded-2xl px-5 py-3 text-sm font-semibold disabled:opacity-50"
                >
                  {language === "bg" ? "Прегледай" : "Review"}
                </button>
              </div>
              {orderError && <div className="mt-2 text-sm text-red-200">{orderError}</div>}
            </div>
          </div>
        </div>
      )}

      {showOrderReview && (
        <div className="fixed inset-0 z-[70] flex items-end bg-black/70 p-0 backdrop-blur-sm md:items-center md:p-6" role="dialog" aria-modal="true">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#120e0b] p-4 shadow-2xl md:mx-auto md:max-w-2xl md:rounded-[28px] md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="section-kicker">{language === "bg" ? "Преглед" : "Review"}</div>
                <h2 className="mt-2 text-2xl font-semibold text-[#fff4df]">
                  {language === "bg" ? "Вашата поръчка" : "Your order"}
                </h2>
                <p className="mt-1 text-sm text-white/55">
                  {language === "bg" ? "Маса" : "Table"} {orderSession?.tableIds?.join(", ")}
                </p>
              </div>
              <button type="button" onClick={() => setShowOrderReview(false)} className="ghost-button rounded-full px-4 py-2 text-sm" aria-label={language === "bg" ? "Затвори прегледа на поръчката" : "Close order review"}>
                {language === "bg" ? "Затвори" : "Close"}
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              {orderItems.map((item) => (
                <div key={item.key} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-[#fff4df]">{item.name}</div>
                      <div className="mt-1 text-sm text-white/45">{formatOrderPrice(item.priceValue)} · {formatOrderPrice(item.priceValue * item.quantity)}</div>
                    </div>
                    <div className="flex items-center overflow-hidden rounded-full border border-white/10">
                      <button type="button" onClick={() => updateOrderQuantity(item.key, item.quantity - 1)} className="px-4 py-2 text-lg text-[#f2d39a]" aria-label={language === "bg" ? `Намали ${item.name}` : `Decrease ${item.name}`}>-</button>
                      <span className="min-w-10 text-center text-base font-semibold">{item.quantity}</span>
                      <button type="button" onClick={() => updateOrderQuantity(item.key, item.quantity + 1)} className="px-4 py-2 text-lg text-[#f2d39a]" aria-label={language === "bg" ? `Увеличи ${item.name}` : `Increase ${item.name}`}>+</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <input
              value={orderNotes}
              onChange={(event) => setOrderNotes(event.target.value)}
              placeholder={language === "bg" ? "Бележка към поръчката..." : "Order note..."}
              className="mt-4 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-base outline-none placeholder:text-white/35 focus:border-[#f2d39a]/60"
            />

            <div className="mt-5 flex items-center justify-between gap-4 border-t border-white/10 pt-4">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-[#d8b377]">{language === "bg" ? "Общо" : "Total"}</div>
                <div className="mt-1 text-2xl font-semibold text-[#fff4df]">{formatOrderPrice(orderTotal)}</div>
              </div>
              <button
                type="button"
                onClick={submitOrder}
                disabled={orderItems.length === 0 || isSubmittingOrder}
                className="luxury-button rounded-2xl px-6 py-4 text-sm font-semibold disabled:opacity-50"
              >
                {isSubmittingOrder
                  ? language === "bg" ? "Изпращане..." : "Sending..."
                  : language === "bg" ? "Изпрати поръчката" : "Send order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!isOrderLink && <Footer t={t} onOpenPrivacy={onOpenPrivacy} />}
    </div>
  );
}
