export const CASA_BRANDING = Object.freeze({
  name: "Casa di Fratelli", phone: "+359888218318", email: "",
  addressBg: "ул. Вечерница 9, Пловдив", addressEn: "9 Vechernitsa St, Plovdiv", addressRu: "ул. Вечерница 9, Пловдив",
  openingHoursBg: "Пон–Нед, 10:00 – 00:00", openingHoursEn: "Mon–Sun, 10:00 – 00:00", openingHoursRu: "Пн–Вс, 10:00 – 00:00",
  publicLeadMinutes: 15, publicMaxReservationDaysAhead: 10, publicLatestReservationTime: "21:00", adminLatestReservationTime: "23:00", walkInOpeningTime: "10:00", walkInLatestTime: "23:30",
  timeZoneId: "Europe/Sofia", logoUrl: "/casa-di-fratelli-logo.svg",
  googleReviewUrl: "https://www.google.com/maps/search/?api=1&query=Casa%20di%20Fratelli%20Vechernitsa%209%20Plovdiv",
  facebookUrl: "https://www.facebook.com/CassadiFratelli", instagramUrl: "https://www.instagram.com/casadifratelli.plovdiv/",
});

export function normalizeTenantBranding(value) {
  const valid = value && typeof value === "object" && !Array.isArray(value);
  const isCasa = !valid || !value.name || value.name.trim() === CASA_BRANDING.name;
  const result = Object.fromEntries(Object.entries(CASA_BRANDING).map(([key, fallback]) => [key,
    typeof fallback === "number" ? valid && Number.isFinite(value[key]) && value[key] >= (key === "publicMaxReservationDaysAhead" ? 1 : 0) && value[key] <= (key === "publicMaxReservationDaysAhead" ? 365 : 1440) ? value[key] : fallback
      : valid && typeof value[key] === "string" ? value[key].trim() : isCasa || key.endsWith("Time") || key === "timeZoneId" ? fallback : "",
  ]));
  result.name ||= "Restaurant";
  for (const key of ["logoUrl", "googleReviewUrl", "facebookUrl", "instagramUrl"]) {
    const url = result[key];
    if (url && (/\\/.test(url) || (!/^https?:\/\//i.test(url) && !/^\/(?!\/)/.test(url)))) result[key] = "";
  }
  return { ...result, isCasa, faviconUrl: isCasa ? "/favicon-48x48.png" : "/restaurant-generic.svg", heroImageUrl: isCasa ? "/restaurant-terrace.jpg" : "", address: result.addressBg, city: isCasa ? "Пловдив" : "", openingHoursText: result.openingHoursBg };
}

export function brandingPayload(branding) {
  return Object.fromEntries(Object.keys(CASA_BRANDING).map((key) => [key, branding[key] ?? ""]));
}

export function brandTranslations(translations, branding, language = "bg") {
  const result = Object.fromEntries(Object.entries(translations).map(([key, value]) => [key,
    typeof value === "string" ? value.replaceAll("Casa di Fratelli", branding.name) : value,
  ]));
  result.brand = branding.name;
  result.hoursValue = branding[`openingHours${language === "en" ? "En" : language === "ru" ? "Ru" : "Bg"}`];
  return result;
}

export function tenantReservationTimes(latestTime, openingTime = "10:00") {
  const minutes = (time) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
    return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  };
  const start = minutes(openingTime), end = minutes(latestTime);
  if (start === null || end === null || end < start) return [];
  return Array.from({ length: Math.floor((end - start) / 15) + 1 }, (_, index) => {
    const minute = start + index * 15;
    return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  });
}
