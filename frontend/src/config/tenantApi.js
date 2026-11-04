export function createTenantFetch({ baseUrl, context, request = globalThis.fetch, onUnauthorized }) {
  const base = new URL(baseUrl);
  return async (input, options = {}) => {
    if (!context.valid || !context.tenantId) throw new Error("A restaurant URL is required.");
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, base);
    if (url.origin !== base.origin || !url.pathname.startsWith("/api/")) {
      throw new Error("Restaurant credentials may only be sent to the configured API.");
    }
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(options.headers).forEach((value, key) => headers.set(key, value));
    const selected = headers.get("X-Tenant-Id");
    if (selected && selected !== context.tenantId) throw new Error("Restaurant context mismatch.");
    headers.set("X-Tenant-Id", context.tenantId);
    const response = await request(input instanceof Request ? input : url.href, { ...options, headers, redirect: "error" });
    if (response.status === 401 && headers.has("X-Admin-Token")) onUnauthorized?.(headers.get("X-Admin-Token"));
    return response;
  };
}
