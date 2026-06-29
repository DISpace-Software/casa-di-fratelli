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

function localText(language, bg, en, ru = bg) {
  if (language === "en") return en;
  if (language === "ru") return ru;
  return bg;
}

function getMenuPageCopy(language) {
  if (language !== "ru") return menuPageData[language] || menuPageData.bg;

  return {
    ...menuPageData.bg,
    heroBadge: "Премиальное меню",
    heroTitle: "Меню Casa di Fratelli",
    heroText:
      "Итальянская кухня, авторские блюда и удобная подача меню с понятными категориями, фотографиями и ценами.",
    chefBadge: "Выбор шефа",
    chefTitle: "Авторские акценты",
    chefText:
      "Блюда от Chef Yurukov, созданные с вниманием к продукту, технике и ресторанной подаче.",
  };
}

function MenuExperienceStrip({ data, language, onCategoryClick }) {
  const pizzaCategory = data.categories.find((category) => category.id === "pizza");
  const pizzaItems = pizzaCategory?.items
    ?.filter((item) => item.imageUrl)
    .slice(0, 6)
    .map((item) => ({ ...item, categoryTitle: pizzaCategory.title, categoryId: pizzaCategory.id })) || [];
  const fallbackItems = data.categories
    .flatMap((category) => category.items.map((item) => ({ ...item, categoryTitle: category.title, categoryId: category.id })))
    .filter((item) => item.imageUrl)
    .slice(0, 6);
  const smallItems = Array.from(
    new Map([...pizzaItems, ...fallbackItems].map((item) => [item.id || item.name, item])).values()
  ).slice(0, 6);

  if (data.categories.length === 0) return null;

  return (
    <section className="menu-experience mx-auto hidden max-w-7xl gap-5 px-6 pt-10 md:grid md:grid-cols-[0.86fr_1.14fr]">
      <div className="menu-feature-panel menu-spark rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(201,165,106,0.16),rgba(255,255,255,0.045)),radial-gradient(circle_at_88%_10%,rgba(46,139,99,0.16),transparent_18rem)] p-6 shadow-2xl shadow-black/20">
        <div className="section-kicker">
          {localText(language, "Меню навигация", "Menu navigation", "Навигация меню")}
        </div>
        <h2 className="mt-3 text-4xl font-semibold leading-tight text-[#fff4df]">
          {localText(language, "Избери секция, виж всичко ясно.", "Choose a section, see everything clearly.", "Выберите раздел, и всё будет перед глазами.")}
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-7 text-white/64">
          {localText(
            language,
            "Компактно меню с пълни снимки, ясни цени и бързо движение между категориите.",
            "A compact menu with complete photos, clear prices, and fast category movement.",
            "Компактное меню с фотографиями, понятными ценами и быстрым переходом по категориям."
          )}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2">
          {data.categories.slice(0, 8).map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => onCategoryClick(category.id)}
              className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-left transition hover:border-[#c9a56a]/35 hover:bg-[#c9a56a]/10"
            >
              <div className="truncate text-sm font-semibold text-[#fff4df]">{category.title}</div>
              <div className="mt-1 text-xs text-white/45">
                {category.items.length} {language === "en" ? "items" : "позиции"}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {smallItems.map((item) => (
          <button
            key={`${item.categoryId}-${item.name}`}
            type="button"
            onClick={() => onCategoryClick(item.categoryId)}
            className="group menu-digest-card rounded-[24px] border border-white/10 bg-white/[0.045] p-3 text-left shadow-xl shadow-black/15 transition hover:-translate-y-0.5 hover:border-[#c9a56a]/35"
          >
            <div className="menu-digest-image flex aspect-square items-center justify-center overflow-hidden rounded-[18px] border border-white/10 bg-[#0e0b08]">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="h-full w-full object-contain p-1 transition duration-500 group-hover:scale-[1.04]" />
              ) : (
                <div className="h-full w-full bg-[radial-gradient(circle_at_50%_20%,rgba(201,165,106,0.26),transparent_60%),linear-gradient(135deg,#211812,#090705)]" />
              )}
            </div>
            <div className="px-1 pb-1 pt-3">
              <div className="text-xs uppercase tracking-[0.18em] text-[#d8b377]">{item.categoryTitle}</div>
              <div className="mt-2 line-clamp-2 text-base font-semibold leading-snug text-[#fff4df]">{item.name}</div>
              <div className="mt-2 text-sm text-white/55">{item.price}</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function buildDisplayDepartments(data, language) {
  if (Array.isArray(data.departments) && data.departments.length > 0) {
    return data.departments
      .map((department) => ({
        ...department,
        title:
          department.id === "Bar"
            ? language === "en" ? "Drinks" : "Напитки"
            : language === "ru" ? "Блюда" : language === "en" ? "Dishes" : "Ястия",
      }))
      .filter((department) => department.categories?.length);
  }

  const drinkCategories = data.categories.filter(
    (category) => category.id === "drinks" || category.department === "Bar"
  );
  const dishCategories = data.categories.filter(
    (category) => category.id !== "drinks" && category.department !== "Bar"
  );

  return [
    {
      id: "Kitchen",
      title: language === "ru" ? "Блюда" : language === "en" ? "Dishes" : "Ястия",
      description:
        language === "en"
          ? "Pizza, pasta, salads, mains, and desserts."
          : language === "ru"
            ? "Пицца, паста, салаты, основные блюда и десерты."
            : "Пица, паста, салати, основни и десерти.",
      categories: dishCategories,
    },
    {
      id: "Bar",
      title: language === "en" ? "Drinks" : "Напитки",
      description:
        language === "en"
          ? "Bar, coffee, wines, and refreshments."
          : language === "ru"
            ? "Бар, кофе, вина и освежающие напитки."
            : "Бар, кафе, вина и освежаващи напитки.",
      categories: drinkCategories,
    },
  ].filter((department) => department.categories.length > 0);
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
    () => buildMenuDataFromCms(cmsMenuItems, language, getMenuPageCopy(language)),
    [cmsMenuItems, language]
  );
  const menuDepartments = React.useMemo(() => buildDisplayDepartments(data, language), [data, language]);
  const [activeDepartment, setActiveDepartment] = React.useState(
    menuDepartments[0]?.id || "Kitchen"
  );
  const activeDepartmentData =
    menuDepartments.find((department) => department.id === activeDepartment) ||
    menuDepartments[0];
  const visibleCategories = activeDepartmentData?.categories || data.categories;
  const [activeCategory, setActiveCategory] = React.useState(
    visibleCategories[0]?.id || ""
  );
  const [orderParams] = React.useState(readOrderLinkParams);
  const [orderSession, setOrderSession] = React.useState(null);
  const [orderItems, setOrderItems] = React.useState([]);
  const [orderNotes, setOrderNotes] = React.useState("");
  const [orderError, setOrderError] = React.useState("");
  const [orderNotice, setOrderNotice] = React.useState("");
  const [showOrderReview, setShowOrderReview] = React.useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = React.useState(false);
  const [isSendingGuestRequest, setIsSendingGuestRequest] = React.useState("");
  const categoryNavRef = React.useRef(null);
  const activeCategoryButtonRef = React.useRef(null);
  const manualCategoryRef = React.useRef("");
  const manualCategoryTimerRef = React.useRef(null);
  const activeCategoryData =
    visibleCategories.find((category) => category.id === activeCategory) ||
    visibleCategories[0];
  const orderEnabled = Boolean(orderParams.reservationId && orderParams.token && orderSession);
  const orderTotal = orderItems.reduce((total, item) => total + Number(item.priceValue || 0) * item.quantity, 0);

  React.useEffect(() => {
    const sectionIds = visibleCategories.map((category) => category.id);

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
  }, [visibleCategories]);

  React.useEffect(() => {
    if (!activeDepartmentData) return;
    if (!activeDepartmentData.categories.some((category) => category.id === activeCategory)) {
      setActiveCategory(activeDepartmentData.categories[0]?.id || "");
    }
  }, [activeCategory, activeDepartmentData]);

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

  const handleDepartmentClick = (id) => {
    const nextDepartment = menuDepartments.find((department) => department.id === id);
    if (!nextDepartment) return;

    setActiveDepartment(id);
    const firstCategoryId = nextDepartment.categories[0]?.id || "";
    setActiveCategory(firstCategoryId);

    window.setTimeout(() => {
      const element = firstCategoryId ? document.getElementById(firstCategoryId) : null;
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 80);
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
          throw new Error(payload?.message || localText(language, "Линкът за поръчка не е активен.", "The order link is not active.", "Ссылка для заказа не активна."));
        }

        if (!cancelled) setOrderSession(payload);
      } catch (error) {
        if (!cancelled) setOrderError(error?.message || localText(language, "Не успяхме да заредим поръчката.", "Could not load the order session.", "Не удалось загрузить заказ."));
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
          kind: item.kind || (item.department === "Bar" ? "Drink" : "Dish"),
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
            kind: item.kind,
            quantity: item.quantity,
          })),
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message || localText(language, "Поръчката не беше изпратена.", "The order was not sent.", "Заказ не был отправлен."));
      }

      setOrderItems([]);
      setOrderNotes("");
      setShowOrderReview(false);
      setOrderNotice(localText(language, "Поръчката е изпратена към екипа.", "Your order was sent to the team.", "Заказ отправлен команде ресторана."));
    } catch (error) {
      setOrderError(error?.message || localText(language, "Поръчката не беше изпратена.", "The order was not sent.", "Заказ не был отправлен."));
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  async function sendGuestRequest(type) {
    if (!orderEnabled || isSendingGuestRequest) return;

    setIsSendingGuestRequest(type);
    setOrderError("");
    setOrderNotice("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/dining-orders/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: Number(orderParams.reservationId),
          token: orderParams.token,
          type,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message || localText(language, "Заявката не беше изпратена.", "The request was not sent.", "Запрос не был отправлен."));
      }

      setOrderNotice(
        type === "bill"
          ? localText(language, "Сервитьорът получи заявка за сметка.", "Your waiter received the bill request.", "Официант получил запрос на счёт.")
          : localText(language, "Сервитьорът е повикан към масата.", "Your waiter was called to the table.", "Официант приглашён к столу.")
      );
    } catch (error) {
      setOrderError(error?.message || localText(language, "Заявката не беше изпратена.", "The request was not sent.", "Запрос не был отправлен."));
    } finally {
      setIsSendingGuestRequest("");
    }
  }

  return (
    <div className={`menu-page luxury-shell min-h-screen text-white ${orderEnabled ? "pb-40" : ""}`}>
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
                {localText(language, "Дигитално меню", "Digital menu", "Дигитальное меню")}
              </h1>
              <div className="mt-1 text-sm text-white/70">
                {orderSession
                  ? `${localText(language, "Маса", "Table", "Стол")} ${orderSession.tableIds?.join(", ")} · ${orderSession.guestName}`
                  : orderError}
              </div>
            </div>
            {orderNotice && <div className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-100">{orderNotice}</div>}
            {orderSession && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowOrderReview(true)}
                  disabled={orderItems.length === 0 || isSubmittingOrder}
                  className="luxury-button rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  {localText(language, "Изпрати поръчка", "Send order", "Отправить заказ")}
                </button>
                <button
                  type="button"
                  onClick={() => sendGuestRequest("call-waiter")}
                  disabled={Boolean(isSendingGuestRequest)}
                  className="ghost-button rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  {isSendingGuestRequest === "call-waiter"
                    ? localText(language, "Изпращане...", "Sending...", "Отправляем...")
                    : localText(language, "Повикай сервитьор", "Call waiter", "Позвать официанта")}
                </button>
                <button
                  type="button"
                  onClick={() => sendGuestRequest("bill")}
                  disabled={Boolean(isSendingGuestRequest)}
                  className="ghost-button rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  {isSendingGuestRequest === "bill"
                    ? localText(language, "Изпращане...", "Sending...", "Отправляем...")
                    : localText(language, "Поискай сметка", "Request bill", "Попросить счёт")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={`sticky ${isOrderLink ? "top-[88px] md:top-[92px]" : "top-[124px] md:top-[152px]"} z-40 border-y border-white/10 bg-[#090705]/90 backdrop-blur-2xl`}>
        <div className="mx-auto max-w-7xl px-4 py-3 md:px-6 md:py-4">
          <div className="mb-3 grid grid-cols-2 gap-2 md:mb-4 md:max-w-xl">
            {menuDepartments.map((department) => {
              const isActive = activeDepartmentData?.id === department.id;

              return (
                <button
                  key={department.id}
                  type="button"
                  onClick={() => handleDepartmentClick(department.id)}
                  className={`menu-department-chip rounded-[20px] border px-4 py-3 text-left transition active:scale-[0.98] md:px-5 md:py-3.5 ${
                    isActive
                      ? "border-[#c9a56a]/55 bg-[#c9a56a] text-black shadow-lg shadow-[#c9a56a]/20"
                      : "border-white/10 bg-white/[0.055] text-white hover:border-[#c9a56a]/35 hover:bg-[#c9a56a]/10"
                  }`}
                  aria-current={isActive ? "true" : undefined}
                >
                  <span className="block text-base font-semibold">{department.title}</span>
                  <span className={`mt-1 block text-xs ${isActive ? "text-black/60" : "text-white/45"}`}>
                    {department.categories.length} {localText(language, "секции", "sections", "раздела")}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mb-2 flex items-center justify-between gap-3 md:hidden">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] text-[#d8b377]">
                {localText(language, "Секция", "Section", "Раздел")}
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
              {localText(language, "Начало", "Home", "Главная")}
            </button>
          </div>

          <div className="menu-category-rail relative -mx-4 md:mx-0">
            <div className="pointer-events-none absolute bottom-1 left-0 top-0 z-10 w-8 bg-gradient-to-r from-[#090705] to-transparent md:hidden" />
            <div className="pointer-events-none absolute bottom-1 right-0 top-0 z-10 w-8 bg-gradient-to-l from-[#090705] to-transparent md:hidden" />

            <div
              ref={categoryNavRef}
              className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 scrollbar-none md:px-0 md:gap-3"
            >
              {visibleCategories.map((category) => {
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
                    <span className="block truncate text-sm font-semibold md:inline md:text-sm">
                      {category.title}
                    </span>
                    <span className={`mt-1 block text-xs md:hidden ${
                      isActive ? "text-black/60" : "text-white/45"
                    }`}>
                      {category.items.length} {localText(language, "позиции", "items", "позиций")}
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
                  {localText(language, "Начало", "Home", "Главная")}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {!isOrderLink && (
        <MenuExperienceStrip
          data={{ ...data, categories: visibleCategories }}
          language={language}
          onCategoryClick={handleCategoryClick}
        />
      )}

      <div className="flex flex-col">
        <div className={`${isOrderLink ? "order-1" : "order-2"} mx-auto grid max-w-7xl gap-6 px-3 pb-10 pt-5 md:gap-12 md:px-6 md:pb-20 md:pt-10`}>
          {[activeDepartmentData || { id: "all", title: "", categories: visibleCategories }].map((department) => (
            <section key={department.id} className="grid gap-6 md:gap-8">
              {department.title && (
                <div className="menu-spark rounded-[28px] border border-[#c9a56a]/18 bg-[linear-gradient(135deg,rgba(201,165,106,0.16),rgba(255,255,255,0.035))] px-5 py-5 md:px-7">
                  <div className="section-kicker">
                    {localText(language, "Основен раздел", "Main section", "Основной раздел")}
                  </div>
                  <h2 className="mt-2 text-3xl font-semibold text-[#fff4df] md:text-4xl">
                    {department.title}
                  </h2>
                </div>
              )}
              {department.categories.map((category) => (
                <MenuCategorySection
                  key={category.id}
                  category={category}
                  language={language}
                  orderEnabled={orderEnabled}
                  onAddToOrder={addToOrder}
                />
              ))}
            </section>
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
                    {localText(language, "Вашата поръчка", "Your order", "Ваш заказ")}
                  </div>
                  <div className="mt-1 text-sm text-white/60">
                    {orderItems.length} {localText(language, "позиции", "items", "позиций")} · {formatOrderPrice(orderTotal)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOrderReview(true)}
                  disabled={orderItems.length === 0 || isSubmittingOrder}
                  className="luxury-button rounded-2xl px-5 py-3 text-sm font-semibold disabled:opacity-50"
                >
                  {localText(language, "Прегледай", "Review", "Проверить")}
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
                <div className="section-kicker">{localText(language, "Преглед", "Review", "Проверка")}</div>
                <h2 className="mt-2 text-2xl font-semibold text-[#fff4df]">
                  {localText(language, "Вашата поръчка", "Your order", "Ваш заказ")}
                </h2>
                <p className="mt-1 text-sm text-white/55">
                  {localText(language, "Маса", "Table", "Стол")} {orderSession?.tableIds?.join(", ")}
                </p>
              </div>
              <button type="button" onClick={() => setShowOrderReview(false)} className="ghost-button rounded-full px-4 py-2 text-sm" aria-label={localText(language, "Затвори прегледа на поръчката", "Close order review", "Закрыть проверку заказа")}>
                {localText(language, "Затвори", "Close", "Закрыть")}
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
                      <button type="button" onClick={() => updateOrderQuantity(item.key, item.quantity - 1)} className="px-4 py-2 text-lg text-[#f2d39a]" aria-label={localText(language, `Намали ${item.name}`, `Decrease ${item.name}`, `Уменьшить ${item.name}`)}>-</button>
                      <span className="min-w-10 text-center text-base font-semibold">{item.quantity}</span>
                      <button type="button" onClick={() => updateOrderQuantity(item.key, item.quantity + 1)} className="px-4 py-2 text-lg text-[#f2d39a]" aria-label={localText(language, `Увеличи ${item.name}`, `Increase ${item.name}`, `Увеличить ${item.name}`)}>+</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <input
              value={orderNotes}
              onChange={(event) => setOrderNotes(event.target.value)}
              placeholder={localText(language, "Бележка към поръчката...", "Order note...", "Комментарий к заказу...")}
              className="mt-4 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-base outline-none placeholder:text-white/35 focus:border-[#f2d39a]/60"
            />

            <div className="mt-5 flex items-center justify-between gap-4 border-t border-white/10 pt-4">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-[#d8b377]">{localText(language, "Общо", "Total", "Итого")}</div>
                <div className="mt-1 text-2xl font-semibold text-[#fff4df]">{formatOrderPrice(orderTotal)}</div>
              </div>
              <button
                type="button"
                onClick={submitOrder}
                disabled={orderItems.length === 0 || isSubmittingOrder}
                className="luxury-button rounded-2xl px-6 py-4 text-sm font-semibold disabled:opacity-50"
              >
                {isSubmittingOrder
                  ? localText(language, "Изпращане...", "Sending...", "Отправляем...")
                  : localText(language, "Изпрати поръчката", "Send order", "Отправить заказ")}
              </button>
            </div>
          </div>
        </div>
      )}

      {!isOrderLink && <Footer t={t} onOpenPrivacy={onOpenPrivacy} />}
    </div>
  );
}
