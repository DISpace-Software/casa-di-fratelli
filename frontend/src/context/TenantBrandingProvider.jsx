import React from "react";
import { API_BASE_URL } from "../config/api";
import { normalizeTenantBranding } from "../config/tenantBranding";
import { TenantBrandingContext } from "./TenantBrandingContext";

export default function TenantBrandingProvider({ children }) {
  const [branding, setBranding] = React.useState(() => normalizeTenantBranding(null));
  const reloadBranding = React.useCallback(async (signal) => {
    const response = await fetch(`${API_BASE_URL}/api/branding`, { signal });
    if (!response.ok) throw new Error("Could not load restaurant branding.");
    setBranding(normalizeTenantBranding(await response.json()));
  }, []);
  React.useEffect(() => {
    const controller = new AbortController();
    reloadBranding(controller.signal).catch(() => {});
    return () => controller.abort();
  }, [reloadBranding]);
  React.useEffect(() => {
    const icon = document.querySelector('link[rel="icon"]');
    if (icon) icon.href = branding.faviconUrl;
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
  const value = React.useMemo(() => ({ branding, reloadBranding }), [branding, reloadBranding]);
  return <TenantBrandingContext.Provider value={value}>{children}</TenantBrandingContext.Provider>;
}
