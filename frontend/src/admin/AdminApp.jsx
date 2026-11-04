import React from "react";
import AdminLogin from "../components/admin/AdminLogin";
import BackToTopButton from "../components/layout/BackToTopButton";
import { useTenantBranding } from "../context/TenantBrandingContext";
import { API_BASE_URL, apiFetch } from "../config/api";
import { tenantContext, tenantStorageKey } from "../config/tenantRuntime.js";

const AdminPage = React.lazy(() => import("../pages/AdminPage"));
const unchanged = () => {};

function AdminStatus({ error = "" }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090705] px-6 text-center text-[#f7ead3]" aria-live="polite" aria-busy={!error}>
      <div>
        {!error && <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#c9a56a]/30 border-t-[#c9a56a]" />}
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#c9a56a]">{error || "Зареждане на администрацията"}</p>
        {error && <button type="button" className="ghost-button mt-6 rounded-2xl px-5 py-3" onClick={() => window.location.reload()}>Опитай отново</button>}
      </div>
    </main>
  );
}

export default function AdminApp() {
  const { branding, loaded, error } = useTenantBranding();
  const [session, setSession] = React.useState(null);
  const [checking, setChecking] = React.useState(true);
  const [sessionError, setSessionError] = React.useState("");
  const [theme, setTheme] = React.useState(() => window.localStorage.getItem("restaurant-theme") === "light" ? "light" : "dark");
  const logout = React.useCallback(() => {
    window.sessionStorage.removeItem(tenantStorageKey("admin-token"));
    window.sessionStorage.removeItem(tenantStorageKey("admin-user"));
    setSession(null);
  }, []);

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("restaurant-theme", theme);
  }, [theme]);

  React.useEffect(() => {
    if (!loaded) return;
    document.title = `${branding.name} Admin`;
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute("content", `${branding.name} Admin`);
    const link = document.createElement("link");
    link.rel = "manifest";
    const manifest = {
      name: `${branding.name} Admin`, short_name: `${branding.name} Admin`,
      id: new URL(tenantContext.adminPath, window.location.origin).href,
      start_url: new URL(tenantContext.adminPath, window.location.origin).href,
      scope: new URL(`/r/${tenantContext.tenantId}/`, window.location.origin).href,
      display: "standalone", background_color: "#15110e", theme_color: "#15110e",
      icons: branding.isCasa ? [192, 512].map(size => ({
        src: new URL(`/casa-fratelli-icon-${size}.png`, window.location.origin).href,
        sizes: `${size}x${size}`, type: "image/png", purpose: "any maskable",
      })) : [{ src: new URL(branding.faviconUrl, window.location.origin).href, sizes: "any", type: "image/svg+xml" }],
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }));
    link.href = url;
    document.head.append(link);
    return () => { link.remove(); URL.revokeObjectURL(url); };
  }, [branding, loaded]);

  React.useEffect(() => {
    if (!tenantContext.valid) return;
    const controller = new AbortController();
    const expireSession = (event) => {
      // Requests from an unmounted session may finish after a new login succeeds.
      // Only the session that received the 401 may be cleared.
      const token = event.detail?.token;
      if (token && token === window.sessionStorage.getItem(tenantStorageKey("admin-token"))) logout();
    };
    window.addEventListener("seatmap:session-expired", expireSession);
    async function restoreSession() {
      const token = window.sessionStorage.getItem(tenantStorageKey("admin-token"));
      try {
        if (!token) return;
        const response = await apiFetch(`${API_BASE_URL}/api/admin/me`, { headers: { "X-Admin-Token": token }, signal: controller.signal });
        if (response.status === 401) { logout(); return; }
        if (!response.ok) throw new Error("Session verification failed.");
        const data = await response.json();
        // /me is authoritative; cached role/name is never trusted.
        const user = data.user || data;
        if (!user.id || !user.role) throw new Error("Invalid session response.");
        if (!controller.signal.aborted) setSession({ token, user });
      } catch {
        if (!controller.signal.aborted) setSessionError("Не успяхме да проверим сесията. Опитайте отново.");
      } finally {
        if (!controller.signal.aborted) setChecking(false);
      }
    }
    restoreSession();
    return () => { controller.abort(); window.removeEventListener("seatmap:session-expired", expireSession); };
  }, [logout]);

  if (!tenantContext.valid) return <AdminStatus error="Отворете административната връзка на ресторанта." />;
  if (error) return <AdminStatus error="Не успяхме да заредим ресторанта. Проверете връзката и опитайте отново." />;
  if (sessionError) return <AdminStatus error={sessionError} />;
  if (!loaded || checking) return <AdminStatus />;
  if (!session) return <AdminLogin onLogin={(token, user) => setSession({ token, user })} />;
  return <>
    <React.Suspense fallback={<AdminStatus />}>
      <AdminPage adminToken={session.token} adminUser={session.user} onAdminLogout={logout}
        onMenuChanged={unchanged} onEventsChanged={unchanged} theme={theme}
        onToggleTheme={() => setTheme((value) => value === "dark" ? "light" : "dark")} />
    </React.Suspense>
    <BackToTopButton />
  </>;
}
