import { createContext, useContext } from "react";
import { CASA_BRANDING } from "../config/tenantBranding";
export const TenantBrandingContext = createContext({ branding: CASA_BRANDING, reloadBranding: async () => {} });
export const useTenantBranding = () => useContext(TenantBrandingContext);
