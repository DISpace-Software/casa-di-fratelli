import React from "react";
import { useTenantBranding } from "../../context/TenantBrandingContext";
import { API_BASE_URL, apiFetch as fetch } from "../../config/api";
import { tenantStorageKey } from "../../config/tenantRuntime.js";

export default function AdminLogin({ onLogin }) {
  const { branding } = useTenantBranding();
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
      ? (branding.isCasa ? "admin@casadifratelli.local" : "")
      : window.localStorage.getItem(tenantStorageKey("admin-email")) || (branding.isCasa ? "admin@casadifratelli.local" : ""))
  );
  const [password, setPassword] = React.useState("");
  const [resetToken, setResetToken] = React.useState(resetParams.token);
  const [authMode, setAuthMode] = React.useState(resetParams.token ? "reset" : "login");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  function storeLogin(data) {
    window.sessionStorage.setItem(tenantStorageKey("admin-token"), data.token);
    window.sessionStorage.setItem(tenantStorageKey("admin-user"), JSON.stringify(data.user));
    window.localStorage.setItem(tenantStorageKey("admin-email"), email);
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
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("email");
        cleanUrl.searchParams.delete("resetToken");
        window.history.replaceState({}, "", cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
      }
    } catch {
      setError("Не успяхме да сменим паролата. Опитайте отново.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleQuickLogin() {
    const credentialToken = window.localStorage.getItem(tenantStorageKey("admin-device-token"));
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
          src={branding.logoUrl || "/restaurant-generic.svg"}
          alt={branding.name}
          className="brand-logo mb-7 h-16 w-[220px] object-left"
        />
        <p className="section-kicker">{branding.name} Admin OS</p>
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
