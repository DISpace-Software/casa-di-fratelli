import { useId, useState } from "react";
import { getZoneName } from "../../domain/reservations/floorPlanNames.js";

const copy = {
  bg: { title: "Зали", intro: "Добавете зала, после подредете масите в нея. Промените се публикуват заедно с „Запази картата“.", name: "Име на залата", add: "Добави зала", active: "Активна зала", empty: "Все още няма зали.", limit: "Достигнат е лимитът от 50 зали.", selected: "Редактиране", seats: "места", tables: "маси", hint: "За временно затваряне използвайте сезонното затваряне на зони. Неактивните зали не приемат резервации." },
  en: { title: "Halls", intro: "Add a hall, then arrange its tables. All changes are published together when you save the map.", name: "Hall name", add: "Add hall", active: "Active hall", empty: "No halls yet.", limit: "The limit of 50 halls has been reached.", selected: "Editing", seats: "seats", tables: "tables", hint: "For temporary closures, use seasonal area closure. Inactive halls do not accept reservations." },
  ru: { title: "Залы", intro: "Добавьте зал, затем расставьте в нём столы. Все изменения публикуются вместе при сохранении карты.", name: "Название зала", add: "Добавить зал", active: "Активный зал", empty: "Залов пока нет.", limit: "Достигнут лимит в 50 залов.", selected: "Редактирование", seats: "мест", tables: "столов", hint: "Для временного закрытия используйте сезонное закрытие зон. Неактивные залы не принимают бронирования." },
};

export default function FloorPlanZonesEditor({ plan, language = "bg", selectedArea, onSelect, onChange }) {
  const [newName, setNewName] = useState("");
  const inputId = useId();
  const text = copy[language] || copy.bg;
  const selected = plan.zones.find(zone => zone.id === selectedArea);
  const updateZone = patch => onChange(current => ({ ...current, zones: current.zones.map(zone => zone.id === selectedArea ? { ...zone, ...patch } : zone) }));

  function addHall(event) {
    event.preventDefault();
    const name = newName.trim();
    if (!name || plan.zones.length >= 50) return;
    const id = `hall-${crypto.randomUUID()}`;
    onChange(current => ({ ...current, zones: [...current.zones, { id, name, names: { [language]: name }, presentation: "plain", isActive: true }] }));
    onSelect(id);
    setNewName("");
  }

  return <section className="mb-5 rounded-2xl border border-[#c9a56a]/25 bg-black/20 p-4 sm:p-5" aria-label={text.title}>
    <h3 className="text-xl font-semibold text-[#fff4df]">{text.title}</h3>
    <p className="mt-2 max-w-3xl text-sm text-white/65">{text.intro}</p>
    <form onSubmit={addHall} className="mt-4 flex flex-wrap items-end gap-3">
      <label htmlFor={inputId} className="min-w-0 flex-1 text-sm text-white/70">{text.name}
        <input id={inputId} value={newName} onChange={event => setNewName(event.target.value)} maxLength={100} autoComplete="off" className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-black/20 px-3 text-white" />
      </label>
      <button type="submit" disabled={!newName.trim() || plan.zones.length >= 50} className="luxury-button min-h-[44px] rounded-xl px-4 py-2 text-sm disabled:opacity-40">{text.add}</button>
    </form>
    {plan.zones.length >= 50 && <p role="status" className="mt-2 text-sm text-amber-100">{text.limit}</p>}
    <div className="my-4 flex max-h-60 flex-wrap gap-2 overflow-y-auto" role="group" aria-label={text.title}>
      {plan.zones.map(zone => {
        const tables = plan.tables.filter(table => table.area === zone.id && table.isActive);
        return <button type="button" key={zone.id} onClick={() => onSelect(zone.id)} aria-pressed={zone.id === selectedArea} className={`${zone.id === selectedArea ? "luxury-button" : "ghost-button"} min-h-[44px] max-w-full rounded-xl px-3 py-2 text-left text-sm`}>
          <span className="block break-words">{getZoneName(zone, language)}{!zone.isActive ? " · ○" : ""}</span>
          <span className="text-xs opacity-65">{tables.length} {text.tables} · {zone.isActive ? tables.reduce((sum, table) => sum + table.seats, 0) : 0} {text.seats}</span>
        </button>;
      })}
      {!plan.zones.length && <p className="text-sm text-white/65">{text.empty}</p>}
    </div>
    {selected && <div className="grid gap-3 rounded-xl border border-white/10 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <label className="min-w-0 text-sm text-white/70">{text.selected}: {text.name}
        <input name="hall.name" value={selected.names?.[language] ?? selected.name ?? ""} maxLength={100} onChange={event => updateZone({ name: event.target.value, names: { ...selected.names, [language]: event.target.value } })} className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-black/20 px-3 text-white" />
      </label>
      <label className="flex min-h-[44px] items-center gap-2 text-sm text-white/80"><input name="hall.isActive" type="checkbox" checked={selected.isActive} onChange={event => updateZone({ isActive: event.target.checked })} />{text.active}</label>
      <p className="text-xs text-white/55 sm:col-span-2">{text.hint}</p>
    </div>}
  </section>;
}
