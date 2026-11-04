// Resolve presentation URLs without changing the value stored in menu/event
// forms. Relative restaurant media belongs to the public restaurant origin.
export function restaurantAssetUrl(value, assetBaseUrl = "") {
  if (typeof value !== "string" || !value.trim()) return "";
  const source = value.trim();
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(source)) return source;
  if (/^[a-z][a-z0-9+.-]*:/i.test(source) || /\\/.test(source)) return "";
  if (!assetBaseUrl) return source;
  try {
    const base = new URL(assetBaseUrl);
    if (!["http:", "https:"].includes(base.protocol)) return "";
    return new URL(source, base.href.endsWith("/") ? base.href : `${base.href}/`).href;
  } catch { return ""; }
}
