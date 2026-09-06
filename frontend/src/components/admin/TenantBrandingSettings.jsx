import { brandingPayload } from "../../config/tenantBranding";
import React from "react";
import { useTenantBranding } from "../../context/TenantBrandingContext";
import { API_BASE_URL } from "../../config/api";

export default function TenantBrandingSettings({ adminFetch }) {
  const { branding, reloadBranding } = useTenantBranding();
  const [draft, setDraft] = React.useState(branding);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const fields = { publicLeadMinutes: "Public lead · minutes", publicMaxReservationDaysAhead: "Public days ahead", publicLatestReservationTime: "Last public reservation", adminLatestReservationTime: "Last admin reservation", walkInOpeningTime: "Walk-in opening", walkInLatestTime: "Last walk-in", name: "Име / Name", phone: "Телефон / Phone", email: "Email", logoUrl: "Logo URL", addressBg: "Адрес · BG", addressEn: "Address · EN", addressRu: "Адрес · RU", openingHoursBg: "Работно време · BG", openingHoursEn: "Opening hours · EN", openingHoursRu: "Рабочее время · RU", timeZoneId: "Time zone", googleReviewUrl: "Google reviews URL", facebookUrl: "Facebook URL", instagramUrl: "Instagram URL" };
  async function save(event) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const response = await adminFetch(`${API_BASE_URL}/api/branding`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(brandingPayload(draft)) });
      if (!response.ok) throw new Error("Настройките не са запазени / Settings were not saved.");
      await reloadBranding();
      setMessage("Запазено / Saved");
    } catch (error) { setMessage(error.message || "Connection error"); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} className="mb-6 rounded-3xl border border-[#c9a56a]/25 bg-black/20 p-5">
    <h3 className="text-xl font-semibold">Ресторант и бранд / Restaurant branding</h3>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Object.entries(fields).map(([key, label]) => <label key={key} className="text-xs text-white/65">{label}<input type={typeof draft[key] === "number" ? "number" : "text"} value={draft[key]} required={key === "name"} onChange={(event) => setDraft((current) => ({ ...current, [key]: typeof current[key] === "number" ? Number(event.target.value) : event.target.value }))} className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white" /></label>)}</div>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    <button disabled={busy} className="luxury-button mt-4 rounded-xl px-5 py-3 disabled:opacity-50">{busy ? "Запазване… / Saving…" : "Запази / Save"}</button>
  </form>;
}
