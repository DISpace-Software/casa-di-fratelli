// A shared admin URL selects data; only the API session grants access to it.
export function resolveTenantContext({ pathname = "", shared = false } = {}) {
  if (!shared) return Object.freeze({ tenantId: "casa-di-fratelli", adminPath: "/admin", shared: false, valid: true });
  const match = /^\/r\/([a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)\/admin\/?$/.exec(pathname);
  return Object.freeze({
    tenantId: match?.[1] || "",
    adminPath: match ? `/r/${match[1]}/admin` : "",
    shared: true,
    valid: Boolean(match),
  });
}

export const tenantContext = resolveTenantContext({
  pathname: typeof window === "undefined" ? "" : window.location.pathname,
  shared: import.meta.env?.VITE_SHARED_ADMIN === "true",
});

export function storageKeyForTenant(key, context) {
  if (!context.valid) throw new Error("A restaurant URL is required.");
  return context.shared ? `seatmap:${context.tenantId}:${key}` : key;
}

export const tenantStorageKey = (key) => storageKeyForTenant(key, tenantContext);
