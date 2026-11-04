import React from "react";
import { API_BASE_URL, apiFetch as fetch } from "../config/api";
import { tenantContext } from "../config/tenantRuntime.js";
import { normalizeTenantBranding } from "../config/tenantBranding";
import { TenantBrandingContext } from "./TenantBrandingContext";

export default function TenantBrandingProvider({ children }) {
  const [branding, setBranding] = React.useState(() => normalizeTenantBranding(tenantContext.shared ? { name: "Restaurant" } : null));
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState("");
  const reloadBranding = React.useCallback(async (signal) => {
    const response = await fetch(`${API_BASE_URL}/api/branding`, { signal });
    if (!response.ok) throw new Error("Could not load restaurant branding.");
    const data = await response.json();
    if (!data || typeof data.name !== "string" || !data.name.trim()) throw new Error("Invalid restaurant branding.");
    const normalized = normalizeTenantBranding(data, { isCasa: tenantContext.tenantId === "casa-di-fratelli" });
    if (tenantContext.shared) {
      // Relative media belongs to the restaurant website, not the shared portal.
      const restaurantResponse = await fetch(`${API_BASE_URL}/api/admin/context`, { signal });
      if (!restaurantResponse.ok) throw new Error("Could not verify the restaurant.");
      const restaurant = await restaurantResponse.json();
      if (restaurant.tenantId !== tenantContext.tenantId) throw new Error("Restaurant context mismatch.");
      normalized.assetBaseUrl = restaurant.frontendUrl || "";
      if (normalized.logoUrl.startsWith("/") && restaurant.frontendUrl) normalized.logoUrl = new URL(normalized.logoUrl, restaurant.frontendUrl).href;
    }
    setBranding(normalized);
    setError("");
    setLoaded(true);
  }, []);
  React.useEffect(() => {
    const controller = new AbortController();
    reloadBranding(controller.signal).catch((failure) => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [reloadBranding]);
  React.useEffect(() => {
    const icon = document.querySelector('link[rel="icon"]');
    if (icon) {
      icon.href = branding.faviconUrl;
      icon.type = branding.isCasa ? "image/png" : "image/svg+xml";
    }
    if (!branding.isCasa) {
      const description = [branding.name, branding.address, branding.openingHoursText].filter(Boolean).join(" · ");
      for (const [selector, content] of [
        ['meta[name="description"]', description], ['meta[name="author"]', branding.name],
        ['meta[name="keywords"]', branding.name], ['meta[property="og:site_name"]', branding.name],
        ['meta[property="og:title"]', branding.name], ['meta[property="og:description"]', description],
        ['meta[property="og:url"]', window.location.origin], ['meta[name="twitter:title"]', branding.name],
        ['meta[name="twitter:description"]', description],
      ]) document.querySelector(selector)?.setAttribute("content", content);
      document.querySelector('link[rel="canonical"]')?.setAttribute("href", window.location.origin + window.location.pathname);
      for (const selector of ['meta[property="og:image"]', 'meta[property="og:image:alt"]', 'meta[name="twitter:image"]']) document.querySelector(selector)?.remove();
      document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => script.remove());
    }
  }, [branding]);
  const value = React.useMemo(() => ({ branding, reloadBranding, loaded, error }), [branding, reloadBranding, loaded, error]);
  return <TenantBrandingContext.Provider value={value}>{children}</TenantBrandingContext.Provider>;
}
