import { tenantContext } from "./tenantRuntime.js";
import { createTenantFetch } from "./tenantApi.js";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://casa-di-fratelli-api.onrender.com";

export const apiFetch = createTenantFetch({
  baseUrl: API_BASE_URL,
  context: tenantContext,
  onUnauthorized: (token) => {
    if (tenantContext.shared && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("seatmap:session-expired", { detail: { token } }));
  },
});
