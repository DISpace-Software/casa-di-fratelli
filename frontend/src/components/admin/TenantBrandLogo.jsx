import { useState } from "react";
import "./tenant-brand-logo.css";

export default function TenantBrandLogo({ branding, className = "" }) {
  const [failedSources, setFailedSources] = useState([]);
  const source = [branding.logoUrl, branding.fallbackLogoUrl].find((url) => url && !failedSources.includes(url));
  const isOriginalCofein = branding.isCofein && source === branding.fallbackLogoUrl;
  const classes = `tenant-brand-logo ${branding.isCasa ? "brand-logo" : ""} ${className}`;

  if (!source) return <span className={`${classes} tenant-brand-logo-name`}>{branding.name}</span>;
  return <img src={source} alt={branding.name} className={classes}
    data-original-cofein={isOriginalCofein || undefined}
    onError={() => setFailedSources((current) => current.includes(source) ? current : [...current, source])} />;
}
