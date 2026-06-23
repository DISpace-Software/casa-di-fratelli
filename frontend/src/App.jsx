import React from "react";
import translations from "./i18n/translations";
import { tables } from "./data/tablesData";
import { galleryImages } from "./data/restaurantData";
import HomePage from "./pages/HomePage";
import ReservationPage from "./pages/ReservationPage";
import MenuPage from "./pages/MenuPage";
import AdminPage from "./pages/AdminPage";
import PrivacyPage from "./pages/PrivacyPage";
import { API_BASE_URL } from "./config/api";
import BackToTopButton from "./components/layout/BackToTopButton";

const safeReadStoredLanguage = () => {
  if (typeof window === "undefined") return "bg";
  const stored = window.localStorage.getItem("restaurant-lang");
  return stored === "en" ? "en" : "bg";
};

const safeReadStoredTheme = () => {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem("restaurant-theme");
  return stored === "light" ? "light" : "dark";
};

const safeReadAdminToken = () => {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem("admin-token") || "";
};

const getInitialPage = () => {
  if (typeof window === "undefined") return "home";

  if (window.location.pathname === "/admin") {
    return "admin";
  }

  if (window.location.pathname === "/reservation") {
    return "reservation-map";
  }

  if (window.location.pathname === "/menu") {
    return "menu";
  }

  if (window.location.pathname === "/privacy") {
    return "privacy";
  }

  if (window.location.pathname === "/reservation-confirm") {
    return "reservation-confirm";
  }

  if (window.location.pathname === "/feedback") {
    return "feedback";
  }

  return "home";
};

const runSanityChecks = () => {
  console.assert(typeof translations.bg.navGallery === "string", "BG translation missing navGallery");
  console.assert(typeof translations.en.navReservation === "string", "EN translation missing navReservation");
  console.assert(galleryImages.length > 0, "Gallery should not be empty");
  console.assert(tables.length > 0, "Tables should not be empty");
};

runSanityChecks();

function isInteractiveSwipeTarget(target) {
  return Boolean(target?.closest?.("input, textarea, select, button, a, [role='button']"));
}

function AdminLogin({ onLogin }) {
  const resetParams = React.useMemo(() => {
    if (typeof window === "undefined") return { email: "", token: "" };

    const params = new URLSearchParams(window.location.search);
    return {
      email: params.get("email") || "",
      token: params.get("resetToken") || "",
    };
  }, []);
  const [email, setEmail] = React.useState(() =>
    resetParams.email || (typeof window === "undefined"
      ? "admin@casadifratelli.local"
      : window.localStorage.getItem("admin-email") || "admin@casadifratelli.local")
  );
  const [password, setPassword] = React.useState("");
  const [resetToken, setResetToken] = React.useState(resetParams.token);
  const [authMode, setAuthMode] = React.useState(resetParams.token ? "reset" : "login");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  function storeLogin(data) {
    window.sessionStorage.setItem("admin-token", data.token);
    window.sessionStorage.setItem("admin-user", JSON.stringify(data.user));
    window.localStorage.setItem("admin-email", email);
    onLogin(data.token, data.user);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        setError("Грешен email или парола.");
        return;
      }

      storeLogin(await response.json());
    } catch {
      setError("Неуспешен вход. Опитайте отново.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRequestPasswordReset(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/password-reset/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        setError("Не успяхме да изпратим имейл за възстановяване.");
        return;
      }

      setNotice("Ако този админ съществува, изпратихме линк за възстановяване на имейла.");
    } catch {
      setError("Неуспешна заявка. Опитайте отново.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/password-reset/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token: resetToken, password }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.message || "Линкът е невалиден или изтекъл.");
        return;
      }

      setPassword("");
      setResetToken("");
      setAuthMode("login");
      setNotice("Паролата е сменена. Влезте с новата парола.");

      if (window.location.search) {
        window.history.replaceState({}, "", "/admin");
      }
    } catch {
      setError("Не успяхме да сменим паролата. Опитайте отново.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleQuickLogin() {
    const credentialToken = window.localStorage.getItem("admin-device-token");
    if (!credentialToken) {
      setError("Бързият вход не е активиран на това устройство.");
      return;
    }

    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      if (window.PublicKeyCredential && navigator.credentials?.get) {
        await navigator.credentials.get({
          publicKey: {
            challenge: crypto.getRandomValues(new Uint8Array(32)),
            timeout: 60000,
            userVerification: "required",
          },
        });
      }

      const response = await fetch(`${API_BASE_URL}/api/admin/device-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialToken }),
      });

      if (!response.ok) {
        setError("Бързият вход не е активен. Влезте с парола.");
        return;
      }

      storeLogin(await response.json());
    } catch {
      setError("Бързият вход беше отказан.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="luxury-shell flex min-h-screen items-center justify-center px-5 py-10 text-white">
      <form
        onSubmit={
          authMode === "forgot"
            ? handleRequestPasswordReset
            : authMode === "reset"
            ? handleResetPassword
            : handleSubmit
        }
        className="luxury-panel w-full max-w-md rounded-[28px] p-6 md:p-8"
      >
        <img
          src="/casa-di-fratelli-logo.svg"
          alt="Casa di Fratelli"
          className="brand-logo mb-7 h-16 w-[220px] object-left"
        />
        <p className="section-kicker">Casa di Fratelli Admin OS</p>
        <h1 className="mt-3 text-3xl font-semibold text-[#fff4df]">
          {authMode === "login" ? "Admin Login" : authMode === "forgot" ? "Възстановяване" : "Нова парола"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-stone-400">
          {authMode === "login"
            ? "Въведете email и парола за достъп до CRM панела."
            : authMode === "forgot"
            ? "Въведете email и ще изпратим линк за нова парола."
            : "Задайте нова парола за админ профила."}
        </p>

        <label className="mt-7 block text-sm font-semibold text-white/65">Email</label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoFocus
          className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-4 text-white outline-none transition focus:border-[#f2d39a]/55"
        />

        {authMode !== "forgot" && (
          <>
            <label className="mt-4 block text-sm font-semibold text-white/65">
              {authMode === "reset" ? "Нова парола" : "Парола"}
            </label>
            <div className="mt-2 flex overflow-hidden rounded-2xl border border-white/10 bg-black/25 focus-within:border-[#f2d39a]/55">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={authMode === "reset" ? 8 : undefined}
                className="min-w-0 flex-1 bg-transparent px-4 py-4 text-white outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="shrink-0 border-l border-white/10 px-4 text-sm font-semibold text-[#f2d39a]"
              >
                {showPassword ? "Скрий" : "Покажи"}
              </button>
            </div>
          </>
        )}

        {authMode === "reset" && (
          <input
            type="hidden"
            value={resetToken}
            onChange={(event) => setResetToken(event.target.value)}
          />
        )}

        {error && (
          <div className="mt-4 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {notice && (
          <div className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {notice}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="luxury-button mt-6 w-full rounded-2xl px-5 py-4 text-sm font-semibold disabled:opacity-60"
        >
          {isSubmitting
            ? "Моля, изчакайте..."
            : authMode === "forgot"
            ? "Изпрати линк"
            : authMode === "reset"
            ? "Запази нова парола"
            : "Влез"}
        </button>

        {authMode === "login" && (
          <button
            type="button"
            onClick={handleQuickLogin}
            disabled={isSubmitting}
            className="ghost-button mt-3 w-full rounded-2xl px-5 py-4 text-sm font-semibold disabled:opacity-60"
          >
            Face ID / Touch ID
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setError("");
            setNotice("");
            setPassword("");
            setAuthMode(authMode === "login" ? "forgot" : "login");
          }}
          className="mt-4 w-full text-sm font-semibold text-[#f2d39a] transition hover:text-white"
        >
          {authMode === "login" ? "Забравена парола?" : "Назад към вход"}
        </button>
      </form>
    </div>
  );
}

function ReservationConfirmPage({ onBackHome }) {
  const [status, setStatus] = React.useState("loading");
  const [message, setMessage] = React.useState("");
  const [reservation, setReservation] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;

    async function confirmReservation() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token") || "";

      if (!token) {
        setStatus("error");
        setMessage("Линкът за потвърждение е невалиден.");
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/reservations/confirm?token=${encodeURIComponent(token)}`);
        const payload = await response.json().catch(() => null);

        if (cancelled) return;

        if (!response.ok) {
          setStatus("error");
          setMessage(payload?.message || "Не успяхме да потвърдим резервацията.");
          return;
        }

        setReservation(payload);
        setStatus("success");
        setMessage("Вашата резервация е потвърдена успешно.");
      } catch {
        if (cancelled) return;
        setStatus("error");
        setMessage("Неуспешна връзка със сървъра. Опитайте отново.");
      }
    }

    confirmReservation();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="luxury-shell flex min-h-screen items-center justify-center px-5 py-10 text-white">
      <div className="luxury-panel w-full max-w-lg rounded-[32px] p-6 text-center md:p-9">
        <img
          src="/casa-di-fratelli-logo.svg"
          alt="Casa di Fratelli"
          className="brand-logo mx-auto mb-7 h-16 w-[230px] object-center"
        />
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border text-3xl ${
          status === "success"
            ? "border-emerald-300/35 bg-emerald-400/12 text-emerald-200"
            : status === "error"
            ? "border-red-300/35 bg-red-500/12 text-red-100"
            : "border-[#c9a56a]/30 bg-[#c9a56a]/12 text-[#f2d39a]"
        }`}>
          {status === "loading" ? "…" : status === "success" ? "✓" : "!"}
        </div>
        <p className="section-kicker mt-6">Casa di Fratelli</p>
        <h1 className="mt-3 text-3xl font-semibold text-[#fff4df]">
          {status === "loading"
            ? "Потвърждаваме резервацията..."
            : status === "success"
            ? "Резервацията е потвърдена"
            : "Проблем с потвърждението"}
        </h1>
        <p className="mt-4 text-sm leading-7 text-stone-300">{message}</p>

        {reservation && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 px-5 py-4 text-left text-sm text-stone-300">
            <div><strong className="text-[#fff4df]">Дата:</strong> {reservation.reservedDate || reservation.ReservedDate}</div>
            <div className="mt-2"><strong className="text-[#fff4df]">Час:</strong> {reservation.reservedTime || reservation.ReservedTime}</div>
            <div className="mt-2"><strong className="text-[#fff4df]">Маси:</strong> {(reservation.tableIds || reservation.TableIds || []).join(", ")}</div>
          </div>
        )}

        <button
          type="button"
          onClick={onBackHome}
          className="luxury-button mt-7 w-full rounded-2xl px-5 py-4 text-sm font-semibold"
        >
          Към началото
        </button>
      </div>
    </div>
  );
}

function RatingControl({ label, value, onChange, max = 5, min = 1, compact = false }) {
  const values = Array.from({ length: max - min + 1 }, (_, index) => index + min);

  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-white/70">{label}</div>
      <div className={`grid gap-2 ${max > 5 ? "grid-cols-5 sm:grid-cols-11" : "grid-cols-5"}`}>
        {values.map((rating) => (
          <button
            key={rating}
            type="button"
            onClick={() => onChange(rating)}
            className={`rounded-2xl border px-2 ${compact ? "py-2 text-xs" : "py-3 text-sm"} font-bold transition ${
              Number(value) === rating
                ? "border-[#f2d39a]/60 bg-[#c9a56a]/25 text-[#fff4df]"
                : "border-white/10 bg-black/20 text-white/55 hover:border-[#c9a56a]/35"
            }`}
          >
            {rating}
          </button>
        ))}
      </div>
    </div>
  );
}

function OptionGroup({ label, value, options, onChange }) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-white/70">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
              value === option
                ? "border-[#f2d39a]/70 bg-[#c9a56a]/25 text-[#fff4df]"
                : "border-white/10 bg-black/20 text-white/58 hover:border-[#c9a56a]/35"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function FeedbackTextarea({ label, value, onChange, placeholder, important = false }) {
  return (
    <label className="block text-sm font-semibold text-white/64">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={important ? 4 : 2}
        placeholder={placeholder}
        className={`mt-2 w-full rounded-[22px] border px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-[#f2d39a]/55 ${
          important
            ? "border-[#f2d39a]/28 bg-[#c9a56a]/10 shadow-[0_18px_45px_rgba(0,0,0,0.2)]"
            : "border-white/10 bg-black/25"
        }`}
      />
    </label>
  );
}

function FeedbackSection({ number, title, children }) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.035] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.16)] md:p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#f2d39a]/30 bg-[#c9a56a]/12 text-sm font-bold text-[#f2d39a]">
          {number}
        </span>
        <h2 className="text-xl font-semibold text-[#fff4df]">{title}</h2>
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function FeedbackPage({ onBackHome }) {
  const params = React.useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);
  const [form, setForm] = React.useState({
    reservationId: params.get("reservationId") || "",
    guestName: params.get("name") || "",
    email: params.get("email") || "",
    atmosphereRating: 5,
    atmosphereImpression: "",
    atmosphereChange: "",
    foodRating: 5,
    foodImpression: "",
    foodChange: "",
    serviceRating: 5,
    serviceImpression: "",
    serviceChange: "",
    onlineReservationRating: 5,
    onlineReservationFeedback: "",
    onlineReservationEase: "Изключително лесен",
    tableMapRating: 5,
    tableMapUsefulnessRating: 5,
    tableMapFavoriteFeature: "",
    tableMapReuseIntent: "Да, определено",
    tableChoiceImportance: "Много важно",
    softwareRating: 5,
    softwareFeedback: "",
    mostUsefulDigitalFeature: "Избор на маса от карта",
    clientCareFeedback: "",
    smallDetailsFeedback: "",
    returnLikelihood: 10,
    recommendLikelihood: 10,
    oneThingToChange: "",
    googleReviewClicked: false,
  });
  const [reviewUrl, setReviewUrl] = React.useState("");
  const [status, setStatus] = React.useState("idle");
  const [message, setMessage] = React.useState("");
  const [discountCode, setDiscountCode] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;

    async function loadMeta() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/feedback/meta`);
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setReviewUrl(data.reviewUrl || data.ReviewUrl || "");
      } catch {
        // Feedback form still works without the optional Google link.
      }
    }

    loadMeta();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submitFeedback(event) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          reservationId: form.reservationId ? Number(form.reservationId) : null,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setStatus("error");
        setMessage(payload?.message || "Не успяхме да запазим обратната връзка.");
        return;
      }

      setDiscountCode(payload?.discountCode || payload?.DiscountCode || "");
      setReviewUrl(payload?.reviewUrl || payload?.ReviewUrl || reviewUrl);
      setStatus("success");
      setMessage("Благодарим Ви. Вашата обратна връзка е записана.");
    } catch {
      setStatus("error");
      setMessage("Няма връзка със сървъра. Опитайте отново.");
    }
  }

  const completedSignals = [
    form.guestName,
    form.email,
    form.atmosphereImpression,
    form.foodImpression,
    form.serviceImpression,
    form.onlineReservationEase,
    form.tableMapReuseIntent,
    form.mostUsefulDigitalFeature,
    form.oneThingToChange,
  ].filter((value) => String(value || "").trim()).length;
  const progress = Math.min(100, Math.round((completedSignals / 9) * 100));
  const showGooglePrompt =
    Number(form.atmosphereRating) === 5 &&
    Number(form.foodRating) === 5 &&
    Number(form.serviceRating) === 5;

  return (
    <div className="luxury-shell min-h-screen px-4 py-6 text-white md:px-8 md:py-10">
      <form onSubmit={submitFeedback} className="feedback-premium-form luxury-panel mx-auto w-full max-w-6xl rounded-[34px] p-4 md:p-8">
        <div className="sticky top-3 z-20 mb-5 rounded-[24px] border border-white/10 bg-[#14100d]/90 p-3 backdrop-blur md:static md:bg-transparent md:p-0">
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={onBackHome} className="ghost-button rounded-2xl px-4 py-3 text-sm font-semibold">
              ← Към сайта
            </button>
            <div className="min-w-[130px] text-right text-xs font-semibold uppercase tracking-[0.18em] text-[#f2d39a]">
              {progress}% готово
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[linear-gradient(90deg,#f2d39a,#b8843f)] transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="grid gap-7 lg:grid-cols-[0.8fr_1.2fr]">
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <img src="/casa-di-fratelli-logo.svg" alt="Casa di Fratelli" className="brand-logo mb-7 h-16 w-[230px] object-left" />
            <p className="section-kicker">Обратна връзка</p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight text-[#fff4df] md:text-5xl">
              Вашето мнение оформя следващото посещение.
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-white/62">
              Кратка анкета за атмосфера, кухня, обслужване и дигиталното изживяване. Отнема 1-2 минути.
            </p>
            <div className="mt-6 rounded-[26px] border border-[#f2d39a]/22 bg-[#c9a56a]/10 p-5 text-sm leading-7 text-[#f8ddb0]">
              След изпращане ще получите персонален код за 5% отстъпка при следващо посещение.
            </div>

            {status === "success" && (
              <div className="mt-6 rounded-3xl border border-emerald-300/25 bg-emerald-500/12 p-5 text-emerald-50">
                <div className="text-xl font-semibold">{message}</div>
                <p className="mt-2 text-sm leading-6 text-emerald-50/78">
                  Благодарим Ви за отделеното време. Тези отговори помагат на екипа ни да подобрява ресторанта с конкретика, а не с догадки.
                </p>
                {discountCode && (
                  <div className="mt-4 rounded-2xl border border-emerald-200/25 bg-black/20 px-4 py-3">
                    Код за 5% отстъпка: <strong>{discountCode}</strong>
                  </div>
                )}
                <div className="mt-4 grid gap-2 text-sm text-emerald-50/80">
                  <div>Средна оценка ресторант: {((Number(form.atmosphereRating) + Number(form.foodRating) + Number(form.serviceRating)) / 3).toFixed(1)}/5</div>
                  <div>SeatMap изживяване: {((Number(form.onlineReservationRating) + Number(form.tableMapRating) + Number(form.softwareRating)) / 3).toFixed(1)}/5</div>
                  <div>Препоръка: {form.recommendLikelihood}/10</div>
                </div>
                {reviewUrl && (
                  <a
                    href={reviewUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => updateField("googleReviewClicked", true)}
                    className="mt-4 inline-flex rounded-2xl border border-[#f2d39a]/35 bg-[#c9a56a]/15 px-5 py-3 text-sm font-semibold text-[#f2d39a]"
                  >
                    Остави Google Review
                  </a>
                )}
              </div>
            )}
          </aside>

          <div className="space-y-4">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-4 md:p-5">
              <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm font-semibold text-white/60">
                Име
                <input
                  value={form.guestName}
                  onChange={(event) => updateField("guestName", event.target.value)}
                  required
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-[#f2d39a]/50"
                />
              </label>
              <label className="block text-sm font-semibold text-white/60">
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  required
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none focus:border-[#f2d39a]/50"
                />
              </label>
              </div>
            </div>

            <FeedbackSection number="01" title="Атмосфера">
              <RatingControl label="Атмосфера" value={form.atmosphereRating} onChange={(value) => updateField("atmosphereRating", value)} />
              <FeedbackTextarea label="Какво най-много Ви хареса в атмосферата?" value={form.atmosphereImpression} onChange={(value) => updateField("atmosphereImpression", value)} placeholder="Например: интериорът, музиката, гледката, спокойствието, уютът..." />
              <FeedbackTextarea label="Имаше ли нещо, което намали комфорта Ви по време на посещението?" value={form.atmosphereChange} onChange={(value) => updateField("atmosphereChange", value)} />
            </FeedbackSection>

            <FeedbackSection number="02" title="Храна">
              <RatingControl label="Храна" value={form.foodRating} onChange={(value) => updateField("foodRating", value)} />
              <FeedbackTextarea label="Кое ястие или напитка Ви направи най-силно впечатление?" value={form.foodImpression} onChange={(value) => updateField("foodImpression", value)} />
              <FeedbackTextarea label="Има ли нещо в храната или менюто, което бихте подобрили?" value={form.foodChange} onChange={(value) => updateField("foodChange", value)} />
            </FeedbackSection>

            <FeedbackSection number="03" title="Обслужване">
              <RatingControl label="Обслужване" value={form.serviceRating} onChange={(value) => updateField("serviceRating", value)} />
              <FeedbackTextarea label="Какво най-много Ви хареса в обслужването?" value={form.serviceImpression} onChange={(value) => updateField("serviceImpression", value)} />
              <FeedbackTextarea label="Как можем да направим обслужването още по-добро?" value={form.serviceChange} onChange={(value) => updateField("serviceChange", value)} />
            </FeedbackSection>

            <FeedbackSection number="04" title="Онлайн резервация">
              <RatingControl label="Онлайн резервация" value={form.onlineReservationRating} onChange={(value) => updateField("onlineReservationRating", value)} />
              <OptionGroup label="Как Ви се стори процесът по онлайн резервация?" value={form.onlineReservationEase} onChange={(value) => updateField("onlineReservationEase", value)} options={["Изключително лесен", "Лесен", "Нормален", "Малко объркващ", "Труден"]} />
            </FeedbackSection>

            <FeedbackSection number="05" title="Избор на маса от интерактивна карта">
              <RatingControl label="Избор на маса от интерактивна карта" value={form.tableMapRating} onChange={(value) => updateField("tableMapRating", value)} />
              <RatingControl label="Колко полезна беше възможността сами да изберете конкретна маса?" value={form.tableMapUsefulnessRating} onChange={(value) => updateField("tableMapUsefulnessRating", value)} />
              <FeedbackTextarea label="Какво Ви хареса най-много в избора на маса чрез интерактивната карта?" value={form.tableMapFavoriteFeature} onChange={(value) => updateField("tableMapFavoriteFeature", value)} placeholder="Например: маса до прозореца, любима зона, по-добра ориентация, удобство..." />
              <OptionGroup label="Бихте ли използвали отново възможността сами да изберете маса?" value={form.tableMapReuseIntent} onChange={(value) => updateField("tableMapReuseIntent", value)} options={["Да, определено", "Вероятно да", "Няма значение", "Вероятно не", "Не"]} />
              <OptionGroup label="Колко важно е за Вас да можете сами да избирате къде да седнете в ресторант?" value={form.tableChoiceImportance} onChange={(value) => updateField("tableChoiceImportance", value)} options={["Много важно", "Важно", "Без значение", "Не е важно"]} />
            </FeedbackSection>

            <FeedbackSection number="06" title="Дигитална система">
              <RatingControl label="Дигитална система" value={form.softwareRating} onChange={(value) => updateField("softwareRating", value)} />
              <OptionGroup label="Коя функция Ви беше най-полезна?" value={form.mostUsefulDigitalFeature} onChange={(value) => updateField("mostUsefulDigitalFeature", value)} options={["Онлайн резервация", "Избор на маса от карта", "Дигитално меню", "Информация за ресторанта", "Навигация в сайта", "Друго"]} />
              <FeedbackTextarea label="Какво бихте подобрили в дигиталното изживяване?" value={form.softwareFeedback} onChange={(value) => updateField("softwareFeedback", value)} />
            </FeedbackSection>

            <FeedbackSection number="07" title="Лоялност">
              <RatingControl label="Колко вероятно е да посетите Casa di Fratelli отново?" value={form.returnLikelihood} onChange={(value) => updateField("returnLikelihood", value)} max={10} min={1} compact />
              <RatingControl label="Колко вероятно е да препоръчате Casa di Fratelli на приятел или колега?" value={form.recommendLikelihood} onChange={(value) => updateField("recommendLikelihood", value)} max={10} min={0} compact />
            </FeedbackSection>

            <FeedbackSection number="08" title="Най-важният въпрос">
              <FeedbackTextarea important label="Ако можехте да промените само едно нещо в Casa di Fratelli, какво би било то?" value={form.oneThingToChange} onChange={(value) => updateField("oneThingToChange", value)} placeholder="Един конкретен детайл, който би направил преживяването още по-добро..." />
            </FeedbackSection>

            {showGooglePrompt && reviewUrl && (
              <div className="rounded-[28px] border border-[#f2d39a]/25 bg-[#c9a56a]/12 p-5">
                <div className="text-lg font-semibold text-[#fff4df]">Благодарим Ви!</div>
                <p className="mt-2 text-sm leading-6 text-white/65">
                  Ако сте останали доволни, ще се радваме да споделите мнението си и в Google Maps.
                </p>
                <a href={reviewUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-2xl border border-[#f2d39a]/35 bg-[#c9a56a]/20 px-5 py-3 text-sm font-semibold text-[#f2d39a]">
                  Остави Google Review
                </a>
              </div>
            )}

            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
              <input
                type="checkbox"
                checked={form.googleReviewClicked}
                onChange={(event) => updateField("googleReviewClicked", event.target.checked)}
              />
              Ще оставя или вече оставих отзив в Google Maps.
            </label>

            {status === "error" && (
              <div className="rounded-2xl border border-red-300/25 bg-red-500/12 px-4 py-3 text-sm text-red-100">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={status === "submitting" || status === "success"}
              className="luxury-button w-full rounded-2xl px-5 py-4 text-sm font-semibold disabled:opacity-60"
            >
              {status === "submitting" ? "Изпращаме..." : status === "success" ? "Изпратено" : "Изпрати обратна връзка"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function App() {
  const [language, setLanguage] = React.useState(safeReadStoredLanguage);
  const [theme, setTheme] = React.useState(safeReadStoredTheme);
  const [currentPage, setCurrentPage] = React.useState(getInitialPage);
  const [cmsMenuItems, setCmsMenuItems] = React.useState([]);
  const [cmsEvents, setCmsEvents] = React.useState([]);
  const [adminToken, setAdminToken] = React.useState(safeReadAdminToken);
  const [adminUser, setAdminUser] = React.useState(() => {
    if (typeof window === "undefined") return null;
    try {
      return JSON.parse(window.sessionStorage.getItem("admin-user") || "null");
    } catch {
      return null;
    }
  });
  const swipeStartRef = React.useRef(null);
  const pendingHomeSectionRef = React.useRef("");

  const t = translations[language];

  const loadMenuItems = React.useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/menu`);
      if (!response.ok) return;

      const data = await response.json();
      setCmsMenuItems(Array.isArray(data) ? data : []);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn("Using fallback menu because public menu failed to load.", error);
      }
    }
  }, []);

  const loadEvents = React.useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/events`);
      if (!response.ok) return;

      const data = await response.json();
      setCmsEvents(Array.isArray(data) ? data : []);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn("Using fallback events because public events failed to load.", error);
      }
    }
  }, []);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("restaurant-lang", language);
      document.documentElement.lang = language;
    }
  }, [language]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("restaurant-theme", theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = React.useCallback(() => {
    setTheme((currentTheme) => (currentTheme === "light" ? "dark" : "light"));
  }, []);

  React.useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const pagePaths = {
      admin: "/admin",
      "reservation-map": "/reservation",
      menu: "/menu",
      privacy: "/privacy",
      "reservation-confirm": "/reservation-confirm",
      feedback: "/feedback",
      home: "/",
    };
    const nextPath = pagePaths[currentPage] || "/";
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
  }, [currentPage]);

  React.useEffect(() => {
    if (typeof document === "undefined") return;

    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (manifestLink) {
      manifestLink.setAttribute("href", currentPage === "admin" ? "/admin.webmanifest" : "/site.webmanifest");
    }

    let robotsMeta = document.querySelector('meta[name="robots"]');
    if (!robotsMeta) {
      robotsMeta = document.createElement("meta");
      robotsMeta.setAttribute("name", "robots");
      document.head.appendChild(robotsMeta);
    }

    robotsMeta.setAttribute(
      "content",
      currentPage === "admin" ? "noindex, nofollow, noarchive" : "index, follow, max-image-preview:large"
    );

    document.title = currentPage === "admin"
      ? "Casa di Fratelli Admin"
      : "Casa di Fratelli | Италиански ресторант, пица и паста в Пловдив";
  }, [currentPage]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = () => {
      const path = window.location.pathname;

      if (path === "/admin") {
        setCurrentPage("admin");
        return;
      }

      if (path === "/reservation") {
        setCurrentPage("reservation-map");
        return;
      }

      if (path === "/menu") {
        setCurrentPage("menu");
        return;
      }

      if (path === "/privacy") {
        setCurrentPage("privacy");
        return;
      }

      if (path === "/reservation-confirm") {
        setCurrentPage("reservation-confirm");
        return;
      }

      if (path === "/feedback") {
        setCurrentPage("feedback");
        return;
      }

      setCurrentPage("home");
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  React.useEffect(() => {
    loadMenuItems();
  }, [loadMenuItems]);

  const openHomeSection = React.useCallback((sectionId) => {
    if (currentPage === "home") {
      window.requestAnimationFrame(() => {
        document.getElementById(sectionId)?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
      return;
    }

    pendingHomeSectionRef.current = sectionId;
    setCurrentPage("home");
  }, [currentPage]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (pendingHomeSectionRef.current) return;

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, [currentPage]);

  React.useEffect(() => {
    if (currentPage !== "home" || !pendingHomeSectionRef.current) return;

    const sectionId = pendingHomeSectionRef.current;
    pendingHomeSectionRef.current = "";

    window.requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [currentPage]);

  React.useEffect(() => {
    if (typeof window === "undefined" || currentPage === "admin") return undefined;
    if (currentPage === "menu") return undefined;

    const pages = ["home", "menu", "reservation-map", "privacy"];

    const handleTouchStart = (event) => {
      if (event.touches.length !== 1 || isInteractiveSwipeTarget(event.target)) {
        swipeStartRef.current = null;
        return;
      }

      const touch = event.touches[0];
      swipeStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
      };
    };

    const handleTouchEnd = (event) => {
      const start = swipeStartRef.current;
      swipeStartRef.current = null;
      if (!start || event.changedTouches.length !== 1) return;

      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      if (Math.abs(deltaX) < 70 || Math.abs(deltaX) < Math.abs(deltaY) * 1.35) return;

      const index = pages.indexOf(currentPage);
      if (index === -1) return;

      const nextIndex = deltaX < 0 ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= pages.length) return;

      setCurrentPage(pages[nextIndex]);
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [currentPage]);

  if (currentPage === "admin") {
    if (!adminToken) {
      return (
        <AdminLogin
          onLogin={(token, user) => {
            setAdminToken(token);
            setAdminUser(user);
          }}
        />
      );
    }

    return (
      <>
        <AdminPage
          adminToken={adminToken}
          onAdminLogout={() => {
            window.sessionStorage.removeItem("admin-token");
            window.sessionStorage.removeItem("admin-user");
            setAdminToken("");
            setAdminUser(null);
          }}
          adminUser={adminUser}
          onMenuChanged={loadMenuItems}
          onEventsChanged={loadEvents}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        <BackToTopButton />
      </>
    );
  }

  if (currentPage === "reservation-map") {
    return (
      <>
        <ReservationPage
          t={t}
          language={language}
          setLanguage={setLanguage}
          onBack={() => setCurrentPage("home")}
          onOpenPrivacy={() => setCurrentPage("privacy")}
          onReservationComplete={() => setCurrentPage("home")}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        <BackToTopButton />
      </>
    );
  }

  if (currentPage === "menu") {
    return (
      <>
        <MenuPage
          t={t}
          language={language}
          setLanguage={setLanguage}
          onOpenReservation={() => setCurrentPage("reservation-map")}
          onBackHome={() => setCurrentPage("home")}
          onOpenSection={openHomeSection}
          onOpenPrivacy={() => setCurrentPage("privacy")}
          cmsMenuItems={cmsMenuItems}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        <BackToTopButton />
      </>
    );
  }

  if (currentPage === "privacy") {
    return (
      <>
        <PrivacyPage
          t={t}
          language={language}
          setLanguage={setLanguage}
          onOpenReservation={() => setCurrentPage("reservation-map")}
          onOpenMenu={() => setCurrentPage("menu")}
          onOpenSection={openHomeSection}
          onBackHome={() => setCurrentPage("home")}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        <BackToTopButton />
      </>
    );
  }

  if (currentPage === "reservation-confirm") {
    return (
      <>
        <ReservationConfirmPage onBackHome={() => setCurrentPage("home")} />
        <BackToTopButton />
      </>
    );
  }

  if (currentPage === "feedback") {
    return (
      <>
        <FeedbackPage onBackHome={() => setCurrentPage("home")} />
        <BackToTopButton />
      </>
    );
  }

  return (
    <>
      <HomePage
        t={t}
        language={language}
        setLanguage={setLanguage}
        onOpenReservation={() => setCurrentPage("reservation-map")}
        onOpenMenu={() => setCurrentPage("menu")}
        onOpenSection={openHomeSection}
        onOpenPrivacy={() => setCurrentPage("privacy")}
        cmsMenuItems={cmsMenuItems}
        cmsEvents={cmsEvents}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <BackToTopButton />
    </>
  );
}
