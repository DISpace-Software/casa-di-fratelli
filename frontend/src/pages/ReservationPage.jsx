import React from "react";
import ThemeToggleIcon from "../components/layout/ThemeToggleIcon";
import { API_BASE_URL } from "../config/api";
import {
  defaultGardenTables,
  defaultIndoorTables,
  defaultOpenTerraceTables,
  reservationTimes,
} from "../domain/reservations/tableConfig";
import {
  getAvailableReservationTimesForDate,
  getDateInputValueAfterDays,
  getTodayInputValue,
  isDateBeyondReservationWindow,
  isPastTimeForDate,
  isWithinReservationBuffer,
} from "../domain/reservations/dateTimeRules";

const birthdayDays = Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, "0"));
const birthdayMonths = {
  bg: [
    ["01", "Януари"],
    ["02", "Февруари"],
    ["03", "Март"],
    ["04", "Април"],
    ["05", "Май"],
    ["06", "Юни"],
    ["07", "Юли"],
    ["08", "Август"],
    ["09", "Септември"],
    ["10", "Октомври"],
    ["11", "Ноември"],
    ["12", "Декември"],
  ],
  en: [
    ["01", "January"],
    ["02", "February"],
    ["03", "March"],
    ["04", "April"],
    ["05", "May"],
    ["06", "June"],
    ["07", "July"],
    ["08", "August"],
    ["09", "September"],
    ["10", "October"],
    ["11", "November"],
    ["12", "December"],
  ],
};

function buildBirthdayDate(day, month) {
  if (!day || !month) return null;
  const daysInMonth = new Date(2000, Number(month), 0).getDate();
  const safeDay = String(Math.min(Number(day), daysInMonth)).padStart(2, "0");
  return `2000-${month}-${safeDay}`;
}

function normalizeDateForApi(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }

  const raw = String(value).trim();
  const isoDateMatch = raw.match(/\d{4}-\d{2}-\d{2}/);
  return isoDateMatch ? isoDateMatch[0] : raw;
}

function getReservationErrorMessage(result, rawText, language) {
  const fallback =
    language === "bg"
      ? "Възникна проблем при изпращането на резервацията. Проверете датата, часа и опитайте отново."
      : "There was a problem submitting the reservation. Check the date, time and try again.";

  if (result?.message) return result.message;

  const errors = result?.errors;
  if (errors?.reservedDate || errors?.ReservedDate || errors?.["$.reservedDate"]) {
    return language === "bg"
      ? "Датата на резервацията не е валидна. Изберете дата от календара и опитайте отново."
      : "Reservation date is not valid. Choose a date from the calendar and try again.";
  }

  if (errors && typeof errors === "object") {
    return fallback;
  }

  if (rawText && !rawText.trim().startsWith("{")) return rawText;
  return fallback;
}

function getBirthdayMonthOptions(day, language) {
  const selectedDay = Number(day || 0);
  if (!selectedDay) return birthdayMonths[language];

  return birthdayMonths[language].filter(([month]) => {
    const daysInMonth = new Date(2000, Number(month), 0).getDate();
    return selectedDay <= daysInMonth;
  });
}

function ZoneCard({ title, subtitle, accent, children }) {
  return (
    <div className="luxury-panel rounded-[28px] p-5 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-[#fff4df]">{title}</h2>
          <p className="mt-1 text-sm text-white/60">{subtitle}</p>
        </div>
        <div className="rounded-full border border-[#c9a56a]/30 bg-[#c9a56a]/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-[#f2d39a]">
          {accent}
        </div>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-white/8 pb-2">
      <span className="info-row-label text-white/55">{label}</span>
      <span className="info-row-value text-right text-white">{value}</span>
    </div>
  );
}

function getPublicTableLabel(language = "bg") {
  return language === "bg" ? "Избрана маса" : "Selected table";
}

function MapWindow({ className = "", label, vertical = false }) {
  return (
    <div className={`pointer-events-none absolute z-10 ${className}`}>
      <div
        className={`relative h-full w-full overflow-hidden rounded-full border border-sky-200/35 bg-sky-100/[0.065] shadow-[0_0_26px_rgba(125,211,252,0.14)] backdrop-blur ${
          vertical ? "" : ""
        }`}
      >
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.22),transparent_36%),repeating-linear-gradient(90deg,transparent_0_18%,rgba(186,230,253,0.2)_18%_19%,transparent_19%_38%)]" />
        <div className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-sky-100/35" />
        <div className="absolute bottom-1 left-3 right-3 h-px bg-white/16" />
        <div
          className={`relative flex h-full w-full items-center justify-center text-[8px] font-bold uppercase tracking-[0.28em] text-sky-100/86 ${
            vertical ? "-rotate-90 whitespace-nowrap" : ""
          }`}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

function TerraceEntry({ label }) {
  return (
    <div className="pointer-events-none absolute bottom-1 left-1/2 z-10 w-[24%] -translate-x-1/2 text-center">
      <div className="mx-auto h-6 w-16 rounded-t-full border-x border-t border-[#d6b278]/55 bg-[radial-gradient(circle_at_50%_100%,rgba(214,178,120,0.28),transparent_62%)] shadow-[0_0_18px_rgba(214,178,120,0.16)]" />
      <div className="mx-auto h-1 w-20 rounded-full bg-[#d6b278]/55" />
      <div className="mx-auto mt-0.5 max-w-[96px] rounded-full border border-[#c9a56a]/28 bg-black/48 px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.16em] text-[#f2d39a] backdrop-blur">
        {label}
      </div>
    </div>
  );
}

function TopRestaurantEntry({ label }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-2 z-10 w-[32%] -translate-x-1/2 text-center">
      <div className="mx-auto h-6 w-16 rounded-b-full border-x border-b border-[#d6b278]/55 bg-[radial-gradient(circle_at_50%_0%,rgba(214,178,120,0.28),transparent_62%)] shadow-[0_0_18px_rgba(214,178,120,0.16)]" />
      <div className="mx-auto h-1 w-20 rounded-full bg-[#d6b278]/55" />
      <div className="mx-auto mt-0.5 max-w-[116px] rounded-full border border-[#c9a56a]/28 bg-black/48 px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.14em] text-[#f2d39a] backdrop-blur">
        {label}
      </div>
    </div>
  );
}

function SideEntry({ label }) {
  return (
    <div className="pointer-events-none absolute left-1 top-[60%] z-10 flex -translate-y-1/2 items-center">
      <div className="h-14 w-5 rounded-r-full border-y border-r border-[#d6b278]/55 bg-[radial-gradient(circle_at_0%_50%,rgba(214,178,120,0.32),transparent_68%)] shadow-[0_0_18px_rgba(214,178,120,0.16)]" />
      <div className="h-12 w-1 rounded-full bg-[#d6b278]/55" />
      <div className="ml-1 rounded-full border border-[#c9a56a]/28 bg-black/48 px-2 py-1 text-[7px] font-bold uppercase tracking-[0.16em] text-[#f2d39a] backdrop-blur">
        {label}
      </div>
    </div>
  );
}

function IndoorPartitionWall({ label }) {
  return (
    <div className="pointer-events-none absolute right-5 top-[51%] z-10 h-4 w-[50%] -translate-y-1/2">
      <div className="relative h-full w-full rounded-full border border-stone-200/14 bg-[linear-gradient(180deg,rgba(255,244,223,0.18),rgba(63,47,34,0.78),rgba(255,244,223,0.12))] shadow-[0_0_28px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.2)]">
        <div className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-[#f2d39a]/20" />
        <div className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-white/12" />
      </div>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/35 px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.18em] text-white/55 backdrop-blur">
        {label}
      </div>
    </div>
  );
}

function IndoorTerraceEntry({ label }) {
  return (
    <div className="pointer-events-none absolute bottom-1 left-[25%] z-10 w-[28%] -translate-x-1/2 text-center">
      <div className="mx-auto h-6 w-16 rounded-t-full border-x border-t border-emerald-200/45 bg-[radial-gradient(circle_at_50%_100%,rgba(110,231,183,0.2),transparent_64%)] shadow-[0_0_18px_rgba(110,231,183,0.14)]" />
      <div className="mx-auto h-1 w-20 rounded-full bg-emerald-200/45" />
      <div className="mx-auto mt-0.5 max-w-[104px] rounded-full border border-emerald-200/20 bg-black/48 px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.14em] text-emerald-100/90 backdrop-blur">
        {label}
      </div>
    </div>
  );
}

function WallTv({ label }) {
  return (
    <div className="pointer-events-none absolute left-[4%] top-[50%] z-10">
      <div className="relative h-16 w-6 rounded-lg border border-white/18 bg-[#080706] shadow-[0_0_24px_rgba(0,0,0,0.42)]">
        <div className="absolute inset-1 rounded-lg bg-[linear-gradient(160deg,rgba(56,189,248,0.28),rgba(255,255,255,0.08)_42%,rgba(20,184,166,0.16))]" />
        <div className="absolute left-1/2 top-1/2 h-8 w-px -translate-x-1/2 -translate-y-1/2 bg-white/25" />
      </div>
      <div className="mt-1 -translate-x-4 rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[7px] font-bold uppercase tracking-[0.16em] text-white/60">
        {label}
      </div>
    </div>
  );
}

function MergedTableRail({ tables, selectedIds, groups }) {
  const selectedSet = new Set(selectedIds);

  return groups
    .map((group) => {
      const selectedInGroup = group.filter((id) => selectedSet.has(id));
      if (selectedInGroup.length < 2) return null;

      const selectedTables = selectedInGroup
        .map((id) => tables.find((table) => table.id === id))
        .filter(Boolean);

      if (selectedTables.length < 2) return null;

      const x = selectedTables.reduce((sum, table) => sum + table.x, 0) / selectedTables.length;
      const minY = Math.min(...selectedTables.map((table) => table.y));
      const maxY = Math.max(...selectedTables.map((table) => table.y));

      return (
        <div
          key={group.join("-")}
          className="pointer-events-none absolute z-[4] w-9 -translate-x-1/2 rounded-[18px] border border-[#f2d39a]/38 bg-[linear-gradient(180deg,rgba(246,217,158,0.32),rgba(91,64,40,0.56),rgba(246,217,158,0.24))] shadow-[0_0_36px_rgba(201,165,106,0.24),inset_0_1px_0_rgba(255,255,255,0.2)] md:w-11"
          style={{
            left: `${x}%`,
            top: `calc(${minY}% - 24px)`,
            height: `calc(${maxY - minY}% + 48px)`,
          }}
        >
          <div className="absolute inset-1 rounded-[14px] border border-white/10" />
          <div className="absolute left-1/2 top-3 bottom-3 w-px -translate-x-1/2 bg-[#fff4df]/20" />
        </div>
      );
    })
    .filter(Boolean);
}

function MergedHorizontalTableRail({ tables, selectedIds, groups }) {
  const selectedSet = new Set(selectedIds);

  return groups
    .map((group) => {
      const selectedInGroup = group.filter((id) => selectedSet.has(id));
      if (selectedInGroup.length < 2) return null;

      const selectedTables = selectedInGroup
        .map((id) => tables.find((table) => table.id === id))
        .filter(Boolean);

      if (selectedTables.length < 2) return null;

      const y = selectedTables.reduce((sum, table) => sum + table.y, 0) / selectedTables.length;
      const minX = Math.min(...selectedTables.map((table) => table.x));
      const maxX = Math.max(...selectedTables.map((table) => table.x));

      return (
        <div
          key={group.join("-")}
          className="pointer-events-none absolute z-[4] h-10 -translate-y-1/2 rounded-[18px] border border-[#f2d39a]/38 bg-[linear-gradient(90deg,rgba(246,217,158,0.3),rgba(91,64,40,0.56),rgba(246,217,158,0.24))] shadow-[0_0_36px_rgba(201,165,106,0.24),inset_0_1px_0_rgba(255,255,255,0.2)] md:h-11"
          style={{
            left: `calc(${minX}% - 24px)`,
            top: `${y}%`,
            width: `calc(${maxX - minX}% + 48px)`,
          }}
        >
          <div className="absolute inset-1 rounded-[14px] border border-white/10" />
          <div className="absolute left-3 right-3 top-1/2 h-px -translate-y-1/2 bg-[#fff4df]/20" />
        </div>
      );
    })
    .filter(Boolean);
}

function GardenTable({ table, selected, reserved, onSelect, area = "garden" }) {
  const commonClass = `absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ${
    reserved
      ? "cursor-not-allowed scale-90 opacity-75 md:scale-100"
      : selected
      ? "scale-95 md:scale-110"
      : "scale-90 hover:scale-95 md:scale-100 md:hover:scale-105"
  }`;

  if (table.special) {
    return (
      <button
        type="button"
        disabled={reserved}
        onClick={() => onSelect(table, area)}
        className={commonClass}
        style={{ left: `${table.x}%`, top: `${table.y}%` }}
      >
        <div className="relative h-11 w-14">
          <div
            className={`absolute left-1/2 top-0 h-3.5 w-5 -translate-x-1/2 rounded-[7px] border border-[#c9a56a]/20 ${
              reserved ? "garden-special-chair bg-[#3b1d1d]" : "garden-special-chair bg-[#2f241c]"
            }`}
          />
          <div
            className={`absolute bottom-0 left-1/2 h-3.5 w-5 -translate-x-1/2 rounded-[7px] border border-[#c9a56a]/20 ${
              reserved ? "garden-special-chair bg-[#3b1d1d]" : "garden-special-chair bg-[#2f241c]"
            }`}
          />
          <div
            className={`garden-table-surface absolute left-1/2 top-1/2 flex h-8 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border text-[10px] font-semibold shadow-lg ${
              selected
                ? "border-[#d7b57f] bg-[linear-gradient(145deg,#f6d99e,#b88b4d)] text-black"
                : reserved
                ? "border-red-400/30 bg-red-500/10 text-red-200"
                : "border-[#c9a56a]/35 bg-[linear-gradient(145deg,#4d3829,#251b15)] text-white/88"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-75" />
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={reserved}
      onClick={() => onSelect(table, area)}
      className={commonClass}
      style={{ left: `${table.x}%`, top: `${table.y}%` }}
    >
      <div className="relative h-[64px] w-[64px]">
        {[{ x: 26, y: -2 }, { x: 26, y: 54 }, { x: -2, y: 26 }, { x: 54, y: 26 }].map(
          (chair, index) => (
            <div
              key={index}
              className={`garden-chair absolute h-3.5 w-3.5 rounded-[6px] border shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_4px_10px_rgba(0,0,0,0.22)] ${
                reserved
                  ? "border-red-400/20 bg-[#3b1d1d]"
                  : "border-[#d8b377]/30 bg-[linear-gradient(145deg,#4a382b,#211914)]"
              }`}
              style={{ left: chair.x, top: chair.y }}
            />
          )
        )}

        <div
          className={`garden-table-surface absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[15px] text-[11px] font-semibold transition-all duration-300 ${
            selected
              ? "bg-[linear-gradient(145deg,#f6d99e,#b88b4d)] text-black shadow-[0_14px_30px_rgba(201,165,106,0.3)] ring-4 ring-[#d7b57f]/15"
              : reserved
              ? "border border-red-400/30 bg-[#4a1f1f] text-red-100"
              : "border border-[#c9a56a]/40 bg-[linear-gradient(145deg,#5a4332,#2a1f18)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_24px_rgba(0,0,0,0.28)]"
          }`}
        >
          <span className="absolute inset-1 rounded-[11px] border border-white/8" />
          <span className="relative h-1.5 w-1.5 rounded-full bg-current opacity-75" />
        </div>
      </div>
    </button>
  );
}

function OpenTerraceMap({ tables, allTables, selectedIds, onSelect, labels }) {
  return (
    <div className="reservation-map-surface open-terrace-map relative min-h-[440px] overflow-hidden rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(110,231,183,0.13),_transparent_34%),radial-gradient(circle_at_50%_100%,rgba(201,165,106,0.13),transparent_38%),linear-gradient(180deg,rgba(30,34,25,0.96),rgba(14,16,11,0.96))] shadow-inner md:min-h-[520px]">
      <div className="map-grid absolute inset-5 rounded-[22px] border border-[#c9a56a]/14 bg-[linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[length:42px_42px]" />
      <TopRestaurantEntry label={labels.restaurantEntrance} />
      {tables.map((table) => (
        <GardenTable
          key={table.id}
          table={table}
          selected={selectedIds.includes(table.id)}
          reserved={false}
          onSelect={onSelect}
          area="openTerrace"
        />
      ))}
    </div>
  );
}

function GardenMap({ tables, allTables, selectedIds, onSelect, labels }) {
  return (
    <div className="reservation-map-surface garden-map relative min-h-[560px] overflow-hidden rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(60,169,126,0.13),_transparent_34%),linear-gradient(180deg,rgba(34,40,28,0.96),rgba(16,18,13,0.96))] shadow-inner md:min-h-[800px]">
      <div className="map-grid absolute inset-5 rounded-[22px] border border-[#c9a56a]/14 bg-[linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[length:42px_42px]" />
      <MapWindow className="left-5 right-5 top-3 h-4" label={labels.windows} />
      <MapWindow className="bottom-5 left-3 top-5 w-4" label={labels.windows} vertical />
      <MapWindow className="bottom-5 right-3 top-5 w-4" label={labels.windows} vertical />
      <WallTv label={labels.tv} />
      <TerraceEntry label={labels.terraceEntrance} />
      {tables.map((table) => (
        <GardenTable
          key={table.id}
          table={table}
          selected={selectedIds.includes(table.id)}
          reserved={false}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function SixSeatChairs({ reserved }) {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div
          key={`top-${i}`}
          className={`indoor-chair absolute h-3 w-4 rounded-[6px] border border-[#c9a56a]/20 ${reserved ? "bg-[#3b1d1d]" : "bg-[#2f241c]"}`}
          style={{ left: i * 18 + 10, top: -8 }}
        />
      ))}
      {[0, 1, 2].map((i) => (
        <div
          key={`bottom-${i}`}
          className={`indoor-chair absolute h-3 w-4 rounded-[6px] border border-[#c9a56a]/20 ${reserved ? "bg-[#3b1d1d]" : "bg-[#2f241c]"}`}
          style={{ left: i * 18 + 10, top: 36 }}
        />
      ))}
    </>
  );
}

function FourSeatChairs({ reserved }) {
  return (
    <>
      <div className={`indoor-chair absolute h-3 w-4 rounded-[6px] border border-[#c9a56a]/20 ${reserved ? "bg-[#3b1d1d]" : "bg-[#2f241c]"}`} style={{ left: "50%", top: -8, transform: "translateX(-50%)" }} />
      <div className={`indoor-chair absolute h-3 w-4 rounded-[6px] border border-[#c9a56a]/20 ${reserved ? "bg-[#3b1d1d]" : "bg-[#2f241c]"}`} style={{ left: "50%", top: 36, transform: "translateX(-50%)" }} />
      <div className={`indoor-chair absolute h-4 w-3 rounded-[6px] border border-[#c9a56a]/20 ${reserved ? "bg-[#3b1d1d]" : "bg-[#2f241c]"}`} style={{ left: 0, top: 14 }} />
      <div className={`indoor-chair absolute h-4 w-3 rounded-[6px] border border-[#c9a56a]/20 ${reserved ? "bg-[#3b1d1d]" : "bg-[#2f241c]"}`} style={{ right: 0, top: 14 }} />
    </>
  );
}

function IndoorTable({ table, selected, reserved, onSelect, labels }) {
  return (
    <button
      type="button"
      disabled={reserved}
      onClick={() => onSelect(table, "indoor")}
      className={`absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ${
        reserved
          ? "cursor-not-allowed scale-[0.86] opacity-75 md:scale-100"
          : selected
          ? "scale-[0.92] md:scale-110"
          : "scale-[0.86] hover:scale-90 md:scale-100 md:hover:scale-105"
      }`}
      style={{ left: `${table.x}%`, top: `${table.y}%` }}
    >
      <div className="relative flex min-w-[70px] flex-col items-center">
        {table.seats === 6 && <SixSeatChairs reserved={reserved} />}
        {table.seats === 4 && <FourSeatChairs reserved={reserved} />}

        <div
          className={`indoor-table-surface flex items-center justify-center rounded-xl font-semibold transition-all duration-300 ${
            table.wide ? "h-[40px] w-[70px]" : "h-[40px] w-[50px]"
          } ${
            selected
              ? "bg-[linear-gradient(145deg,#f6d99e,#b88b4d)] text-black shadow-lg ring-4 ring-[#d7b57f]/15"
              : reserved
              ? "border border-red-400/30 bg-[#4a1f1f] text-red-100"
              : "border border-[#c9a56a]/35 bg-[linear-gradient(145deg,#5a4332,#2a1f18)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_10px_22px_rgba(0,0,0,0.26)]"
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-75" />
        </div>

        <div className="map-seat-label mt-2 text-center text-[10px] text-white/45">
  {table.seats} {labels.seats}
</div>
      </div>
    </button>
  );
}

function IndoorMap({ tables, allTables, selectedIds, onSelect, labels }) {
  return (
    <div className="reservation-map-surface indoor-map relative min-h-[760px] overflow-hidden rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(201,165,106,0.16),_transparent_34%),radial-gradient(circle_at_18%_60%,rgba(125,211,252,0.08),transparent_25%),linear-gradient(180deg,rgba(39,27,21,0.96),rgba(16,12,10,0.96))] md:min-h-[830px]">
      <div className="map-grid absolute inset-5 rounded-[22px] border border-[#c9a56a]/14 bg-[linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[length:42px_42px]" />
      <MapWindow className="left-3 top-5 h-[50%] w-4" label={labels.windows} vertical />
      <MapWindow className="bottom-5 left-3 top-[70%] w-4" label={labels.windows} vertical />
      <SideEntry label={labels.entrance} />
      <IndoorPartitionWall label={labels.wall} />
      <IndoorTerraceEntry label={labels.terraceEntrance} />
      {tables.map((table) => (
        <IndoorTable
          key={table.id}
          table={table}
          selected={selectedIds.includes(table.id)}
          reserved={false}
          onSelect={onSelect}
          labels={labels}
        />
      ))}
    </div>
  );
}

function BookingModal({
  t,
  language,
  selectedTables,
  selectedArea,
  selectedTime,
  reservationDate,
  guestCount,
  onClose,
  onSubmit,
  isSubmitting,
  submitError,
  submitSuccess,
  onOpenPrivacy,
}) {
  const formRef = React.useRef(null);
  const [isFormReady, setIsFormReady] = React.useState(false);
  const [birthDay, setBirthDay] = React.useState("");
  const [birthMonth, setBirthMonth] = React.useState("");
  const availableBirthdayMonths = React.useMemo(
    () => getBirthdayMonthOptions(birthDay, language),
    [birthDay, language]
  );
  const areaLabel =
    selectedArea === "garden"
      ? t.smokingSection
      : selectedArea === "openTerrace"
      ? language === "bg"
        ? "Открита тераса / Пушачи"
        : "Open terrace / Smoking"
      : t.familySection;

  const focusNextField = (event) => {
    if (event.key !== "Enter") return;

    const field = event.currentTarget;
    if (field.tagName === "TEXTAREA") return;

    const form = formRef.current;
    if (!form) return;

    const fields = Array.from(
      form.querySelectorAll("input:not([type='hidden']), textarea, button[type='submit']")
    ).filter((item) => !item.disabled && item.offsetParent !== null);
    const currentIndex = fields.indexOf(field);
    const nextField = fields[currentIndex + 1];

    if (!nextField) return;

    event.preventDefault();
    nextField.focus();
  };
  const updateFormReady = React.useCallback(() => {
    const form = formRef.current;
    if (!form) return;

    const formData = new FormData(form);
    setIsFormReady(
      Boolean(String(formData.get("guestName") || "").trim()) &&
        Boolean(String(formData.get("phone") || "").trim()) &&
        Boolean(String(formData.get("email") || "").trim()) &&
        formData.get("privacyConsent") === "on"
    );
  }, []);
  const handleBirthDayChange = (event) => {
    const nextDay = event.target.value;
    setBirthDay(nextDay);

    const monthStillAvailable = getBirthdayMonthOptions(nextDay, language)
      .some(([month]) => month === birthMonth);
    if (!monthStillAvailable) {
      setBirthMonth("");
    }
  };

  return (
    <div className="booking-modal fixed inset-0 z-[70] bg-black/78 backdrop-blur-md">
      <div className="h-full overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-5 sm:px-4 sm:py-6">
        <div className="booking-modal-card luxury-panel mx-auto w-full max-w-2xl rounded-[28px] p-4 text-stone-100 sm:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="section-kicker">
                {t.bookingFormTitle}
              </p>

              <h2 className="mt-3 text-3xl font-semibold text-[#fff4df]">
                {getPublicTableLabel(language)}
              </h2>

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                <p className="text-sm text-stone-300">
                  {areaLabel} · {guestCount} {t.people} · {reservationDate} · {selectedTime}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="ghost-button rounded-full px-4 py-2 text-sm"
            >
              {t.closeForm}
            </button>
          </div>

          <form
            ref={formRef}
            onSubmit={onSubmit}
            onChange={updateFormReady}
            onInput={updateFormReady}
            className="booking-form-grid grid min-w-0 gap-4 sm:grid-cols-2"
          >
            <div className="min-w-0">
              <label className="mb-2 block text-sm text-stone-300">{t.formName}</label>
              <input
                name="guestName"
                required
                autoComplete="name"
                enterKeyHint="next"
                onKeyDown={focusNextField}
                className="quiet-input w-full rounded-2xl px-4 py-3"
                placeholder={t.placeholderName}
              />
            </div>

            <div className="min-w-0">
              <label className="mb-2 block text-sm text-stone-300">{t.formPhone}</label>
              <input
                name="phone"
                required
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                enterKeyHint="next"
                onKeyDown={focusNextField}
                className="quiet-input w-full rounded-2xl px-4 py-3"
                placeholder={t.placeholderPhone}
              />
            </div>

            <div className="min-w-0 sm:col-span-2">
              <label className="mb-2 block text-sm text-stone-300">{t.formEmail}</label>
              <input
                name="email"
                type="email"
                required
                inputMode="email"
                autoComplete="email"
                enterKeyHint="next"
                onKeyDown={focusNextField}
                className="quiet-input w-full rounded-2xl px-4 py-3"
                placeholder={t.placeholderEmail}
              />
            </div>

            <div className="birthday-panel min-w-0 sm:col-span-2 rounded-[1.5rem] border border-amber-400/25 bg-amber-500/10 p-4 sm:p-5">
              <label className="mb-2 block text-sm text-amber-100">
                {language === "bg" ? "Рожден ден (опционално)" : "Birthday (optional)"}
              </label>
              <div className="grid min-w-0 gap-3 sm:grid-cols-[0.75fr_1.25fr]">
                <select
                  name="birthDay"
                  autoComplete="bday-day"
                  enterKeyHint="next"
                  onKeyDown={focusNextField}
                  className="quiet-input w-full rounded-2xl px-4 py-3"
                  value={birthDay}
                  onChange={handleBirthDayChange}
                >
                  <option value="">{language === "bg" ? "Ден" : "Day"}</option>
                  {birthdayDays.map((day) => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
                <select
                  name="birthMonth"
                  autoComplete="bday-month"
                  enterKeyHint="next"
                  onKeyDown={focusNextField}
                  className="quiet-input w-full rounded-2xl px-4 py-3"
                  value={birthMonth}
                  onChange={(event) => setBirthMonth(event.target.value)}
                >
                  <option value="">{language === "bg" ? "Месец" : "Month"}</option>
                  {availableBirthdayMonths.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <p className="mt-3 text-sm text-amber-100/80">
                {language === "bg"
                  ? "Само ден и месец, без година. Очаква ви приятен бонус за вашия празник."
                  : "Day and month only, no year. A special birthday bonus is waiting for you."}
              </p>
            </div>

            <div className="min-w-0 sm:col-span-2">
              <label className="mb-2 block text-sm text-stone-300">
                {t.formRequests}
              </label>
              <textarea
                name="notes"
                rows={4}
                enterKeyHint="done"
                className="quiet-input w-full rounded-2xl px-4 py-3"
                placeholder={t.placeholderRequests}
              />
            </div>

            <div className="reservation-consent-card marketing-consent-card sm:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-4">
              <label className="flex items-start gap-3 text-sm text-stone-300">
                <input name="marketingConsent" type="checkbox" className="mt-1" />
                <span>
                  {language === "bg"
                    ? "Съгласявам се да получавам нови предложения и оферти по имейл."
                    : "I agree to receive offers and promotions by email."}
                </span>
              </label>
            </div>

            <div className="reservation-consent-card privacy-consent-card sm:col-span-2 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4">
              <label className="flex items-start gap-3 text-sm leading-6 text-stone-200">
                <input name="privacyConsent" type="checkbox" required className="mt-1" />
                <span>
                  {language === "bg"
                    ? "Съгласявам се Casa di Fratelli да обработи данните ми за целите на резервацията и приемам "
                    : "I agree that Casa di Fratelli may process my data for this reservation and I accept the "}
                  <button
                    type="button"
                    onClick={onOpenPrivacy}
                    className="font-semibold text-[#f2d39a] underline underline-offset-4 transition hover:text-white"
                  >
                    {language === "bg" ? "Политиката за поверителност" : "Privacy Policy"}
                  </button>
                  .
                </span>
              </label>
            </div>

            {submitError && (
              <div className="sm:col-span-2 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {submitError}
              </div>
            )}

            {submitSuccess && (
              <div className="sm:col-span-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {submitSuccess}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className={`mt-2 w-full rounded-2xl px-6 py-4 font-medium sm:col-span-2 ${
                isSubmitting
                  ? "cursor-not-allowed bg-white/10 text-white/40"
                  : `luxury-button ${isFormReady ? "reservation-submit-ready" : ""}`
              }`}
            >
              <span className="flex items-center justify-center gap-3">
                {isSubmitting && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-[#f2d39a]" />
                )}
                {isSubmitting
                  ? language === "bg"
                    ? "Изпращаме резервацията..."
                    : "Sending reservation..."
                  : t.submit}
              </span>
            </button>
            {isSubmitting && (
              <div className="sm:col-span-2 text-center text-sm text-stone-400" role="status" aria-live="polite">
                {language === "bg"
                  ? "Моля, изчакайте. Проверяваме масата и изпращаме заявката."
                  : "Please wait. We are checking the table and sending the request."}
              </div>
            )}
          </form>

          <div className="h-10" />
        </div>
      </div>
    </div>
  );
}

function normalizeLayoutTables(items, area, fallback) {
  if (!Array.isArray(items)) return fallback;

  const normalized = items
    .filter((item) => (item.area || item.Area) === area)
    .map((item) => ({
      id: String(item.id || item.Id || "").trim(),
      x: Number(item.x ?? item.X ?? 50),
      y: Number(item.y ?? item.Y ?? 50),
      seats: Number(item.seats ?? item.Seats ?? 4),
      special: Boolean(item.special ?? item.Special),
      wide: Boolean(item.wide ?? item.Wide),
      isActive: item.isActive ?? item.IsActive ?? true,
    }))
    .filter((item) => item.id && item.isActive);

  return normalized.length ? normalized : fallback;
}

export default function ReservationPage({ t, language, setLanguage, onBack, onOpenPrivacy, onReservationComplete, theme, onToggleTheme }) {
  const today = React.useMemo(() => getTodayInputValue(), []);
  const maxReservationDate = React.useMemo(() => getDateInputValueAfterDays(10), []);
  const adminPhone = "088 821 8318";

  const [reservationDate, setReservationDate] = React.useState("");
  const [guestCount, setGuestCount] = React.useState("");
  const [selectedTime, setSelectedTime] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState("");
  const [submitSuccess, setSubmitSuccess] = React.useState("");
  const [emailConfirmationNotice, setEmailConfirmationNotice] = React.useState(null);
  const [autoConfirmationNotice, setAutoConfirmationNotice] = React.useState(null);
  const [dailyLimitNotice, setDailyLimitNotice] = React.useState(false);
  const [selectedArea, setSelectedArea] = React.useState("indoor");
  const [selectedTables, setSelectedTables] = React.useState([]);
  const [showBookingForm, setShowBookingForm] = React.useState(false);
  const [partyNoticeType, setPartyNoticeType] = React.useState("");
  const [blockedSlots, setBlockedSlots] = React.useState([]);
  const [layoutTables, setLayoutTables] = React.useState({
    indoor: defaultIndoorTables,
    garden: defaultGardenTables,
    openTerrace: defaultOpenTerraceTables,
  });
  const timeSelectionRef = React.useRef(null);
  const mapSectionRef = React.useRef(null);

  const indoorTables = layoutTables.indoor;
  const gardenTables = layoutTables.garden;
  const openTerraceTables = layoutTables.openTerrace;

  React.useEffect(() => {
    async function loadBlockedSlots() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/reservations/blocked-slots`);
        const data = await response.json();
        setBlockedSlots(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Failed to load blocked slots", error);
      }
    }

    loadBlockedSlots();
    const intervalId = setInterval(loadBlockedSlots, 10000);

    return () => clearInterval(intervalId);
  }, []);

  React.useEffect(() => {
    async function loadTableLayout() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/table-layouts`);
        if (!response.ok) return;

        const items = await response.json();
        setLayoutTables({
          indoor: normalizeLayoutTables(items, "indoor", defaultIndoorTables),
          garden: normalizeLayoutTables(items, "garden", defaultGardenTables),
          openTerrace: normalizeLayoutTables(items, "openTerrace", defaultOpenTerraceTables),
        });
      } catch (error) {
        console.warn("Using fallback table layout.", error);
      }
    }

    loadTableLayout();
  }, []);

  React.useEffect(() => {
    if (reservationDate && selectedTime && isPastTimeForDate(reservationDate, selectedTime)) {
      setSelectedTime("");
      setSelectedTables([]);
    }
  }, [reservationDate, selectedTime]);

  const availableReservationTimes = reservationDate
    ? getAvailableReservationTimesForDate(reservationTimes, reservationDate)
    : reservationTimes;
  const todayReservationTimes = React.useMemo(
    () => getAvailableReservationTimesForDate(reservationTimes, today),
    [today]
  );
  const isTodayBookable = todayReservationTimes.length > 0;
  const distantDateMessage =
    language === "bg"
      ? `Онлайн резервации се приемат до 10 дни напред. За по-далечна дата се обадете на ${adminPhone}.`
      : `Online reservations are available up to 10 days ahead. For a later date, please call ${adminPhone}.`;

  const labels = {
    perimeter: language === "bg" ? "Периметър" : "Garden perimeter",
    entrance: language === "bg" ? "Вход" : "Entrance",
    restaurantEntrance: language === "bg" ? "Вход в ресторан" : "Restaurant entrance",
    terraceEntrance: language === "bg" ? "Вход към терасата" : "Entrance to terrace",
    windows: language === "bg" ? "Прозорци" : "Windows",
    wall: language === "bg" ? "Стена" : "Wall",
    tv: language === "bg" ? "Телевизор" : "TV",
    gardenTitle: language === "bg" ? "Тераса / Пушачи" : "Terrace / Smoking",
    gardenSubtitle: language === "bg" ? "Подходяща зона за пушачи" : "Smoking area",
    openTerraceTitle: language === "bg" ? "Открита тераса / Пушачи" : "Open terrace / Smoking",
    openTerraceSubtitle: language === "bg" ? "Малка външна зона с 4 маси" : "Small outdoor area with 4 tables",
    indoorTitle: language === "bg" ? "Зала / Непушачи" : "Hall / Non-smoking",
    indoorSubtitle: language === "bg" ? "Комбинация от маси за 4 и 6 души" : "Mix of 4-seat and 6-seat tables",
    selectedTable: language === "bg" ? "Избрана маса" : "Selected table",
    reservationPreview: language === "bg" ? "Детайли за резервацията" : "Reservation details",
    table: language === "bg" ? "Маса" : "Table",
    capacity: language === "bg" ? "Капацитет" : "Capacity",
    reserveSelected: language === "bg" ? "Резервирай" : "Reserve",
    seats: language === "bg" ? "места" : "seats",
  };

  const zoneOptions = [
    {
      value: "indoor",
      title: labels.indoorTitle,
      subtitle: language === "bg" ? "Уютна вътрешна зала" : "Elegant indoor hall",
      capacity: "16",
    },
    {
      value: "garden",
      title: labels.gardenTitle,
      subtitle: language === "bg" ? "Покрита тераса" : "Covered terrace",
      capacity: "24+",
    },
    {
      value: "openTerrace",
      title: labels.openTerraceTitle,
      subtitle: language === "bg" ? "Свежа външна зона" : "Open air corner",
      capacity: "8",
    },
  ];

  const requestedGuests = Number(guestCount || 0);
  const canShowSearchParams = Boolean(selectedArea && reservationDate && selectedTime && guestCount);

  React.useEffect(() => {
    if (requestedGuests >= 9) {
      setSelectedTables([]);
      setPartyNoticeType("phoneReservation");
      return;
    }

    setPartyNoticeType((current) => (current === "phoneReservation" ? "" : current));
  }, [requestedGuests]);

  React.useEffect(() => {
    if (!canShowSearchParams || window.innerWidth >= 1024 || showBookingForm) return;

    const scrollTimeout = setTimeout(() => {
      mapSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 250);

    return () => clearTimeout(scrollTimeout);
  }, [canShowSearchParams, guestCount, reservationDate, selectedArea, selectedTime, showBookingForm]);

  const selectedDateBlockedSlots = blockedSlots.filter((slot) => {
    const slotDate = slot.reservedDate || slot.ReservedDate;
    const slotTime = slot.reservedTime || slot.ReservedTime;

    return slotDate === reservationDate && isWithinReservationBuffer(slotTime, selectedTime);
  });

  const blockedTableIds = new Set(
    selectedDateBlockedSlots.flatMap((slot) => slot.tableIds || slot.TableIds || [])
  );

  const selectedIds = selectedTables.map((table) => table.id);
  const totalSeats = selectedTables.reduce((sum, table) => sum + table.seats, 0);
  const hasEnoughSeats = totalSeats >= requestedGuests;
  const requiresPhoneReservation = canShowSearchParams && requestedGuests >= 9;

  const canShowTable = (table, area) => {
    if (!canShowSearchParams) return false;
    if (requiresPhoneReservation) return false;
    if (area !== selectedArea) return false;
    if (blockedTableIds.has(table.id)) return false;

    const isSelected = selectedTables.some((selected) => selected.id === table.id);

    if (selectedTables.length > 0) {
      return isSelected;
    }

    if (requestedGuests <= 2) return table.seats <= 4;
    return table.seats >= requestedGuests;
  };

  const visibleGardenTables = gardenTables.filter((table) => canShowTable(table, "garden"));
  const visibleIndoorTables = indoorTables.filter((table) => canShowTable(table, "indoor"));
  const visibleOpenTerraceTables = openTerraceTables.filter((table) => canShowTable(table, "openTerrace"));

  const handleSelect = (table, area) => {
    if (!canShowSearchParams) return;
    if (requiresPhoneReservation) return;
    if (blockedTableIds.has(table.id)) return;

    setSelectedArea(area);
    setSelectedTables([table]);

    if (window.innerWidth < 1024) {
      setTimeout(() => {
        timeSelectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 250);
    }
  };

  const noSingleTableAvailable =
    canShowSearchParams &&
    !requiresPhoneReservation &&
    selectedTables.length === 0 &&
    visibleGardenTables.length + visibleIndoorTables.length + visibleOpenTerraceTables.length === 0;
  const canOpenForm = canShowSearchParams && !requiresPhoneReservation && selectedTables.length === 1 && hasEnoughSeats;

  const handleSubmit = async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const birthDay = String(formData.get("birthDay") || "");
    const birthMonth = String(formData.get("birthMonth") || "");
    const normalizedReservationDate = normalizeDateForApi(reservationDate);
    const birthdayDate = buildBirthdayDate(birthDay, birthMonth);

    const payload = {
      guestName: String(formData.get("guestName") || ""),
      phone: String(formData.get("phone") || ""),
      email: String(formData.get("email") || ""),
      birthDate: birthdayDate ? normalizeDateForApi(birthdayDate) : null,
      marketingConsent: formData.get("marketingConsent") === "on",
      privacyConsent: formData.get("privacyConsent") === "on",
      guestCount: Number(guestCount || 0),
      area: selectedArea,
      reservedTime: selectedTime,
      reservedDate: normalizedReservationDate,
      notes: String(formData.get("notes") || ""),
      tableIds: selectedTables.map((table) => table.id),
    };

    setIsSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");

    if (!normalizedReservationDate) {
      setIsSubmitting(false);
      setSubmitError(language === "bg" ? "Изберете дата за резервацията." : "Choose a reservation date.");
      return;
    }

    if (isDateBeyondReservationWindow(normalizedReservationDate, 10)) {
      setIsSubmitting(false);
      setSubmitError(distantDateMessage);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/reservations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const rawText = await response.text();
      let result = null;

      try {
        result = rawText ? JSON.parse(rawText) : null;
      } catch {
        result = null;
      }

      if (!response.ok) {
        if (response.status === 429) {
          setSubmitSuccess("");
          setSubmitError("");
          setDailyLimitNotice(true);
          return;
        }

        setSubmitSuccess("");
        setSubmitError(getReservationErrorMessage(result, rawText, language));
        return;
      }

      const requiresEmailConfirmation = Boolean(result?.requiresEmailConfirmation || result?.RequiresEmailConfirmation);
      const isReturningCustomer = Boolean(result?.isReturningCustomer || result?.IsReturningCustomer);
      const guestName = result?.guestName || result?.GuestName || payload.guestName;

      setSubmitError("");
      setSubmitSuccess(
        requiresEmailConfirmation
          ? language === "bg"
            ? "Изпратихме Ви имейл за потвърждение."
            : "We sent you a confirmation email."
          : language === "bg"
          ? "Резервацията беше изпратена успешно. Връщаме Ви към началото..."
          : "Reservation submitted successfully. Taking you back to the home page..."
      );

      form?.reset?.();

      if (requiresEmailConfirmation) {
        setEmailConfirmationNotice({
          email: payload.email,
          date: normalizedReservationDate,
          time: selectedTime,
        });
        setShowBookingForm(false);
        setSelectedTables([]);
        setSelectedTime("");
        return;
      }

      if (isReturningCustomer) {
        setAutoConfirmationNotice({
          guestName,
          date: normalizedReservationDate,
          time: selectedTime,
        });
        setShowBookingForm(false);
        setSelectedTables([]);
        setSelectedTime("");
        return;
      }

      setTimeout(() => {
        setShowBookingForm(false);
        setSelectedTables([]);
        setSelectedTime("");
        setSubmitSuccess("");
        setSubmitError("");
        onReservationComplete?.();
      }, 900);
    } catch (error) {
      console.error(error);
      setSubmitSuccess("");
      setSubmitError(
        language === "bg"
          ? "Възникна проблем при връзката със сървъра."
          : "There was a problem connecting to the server."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const zoneTitle =
    selectedArea === "garden"
      ? labels.gardenTitle
      : selectedArea === "openTerrace"
      ? labels.openTerraceTitle
      : labels.indoorTitle;
  const zoneSubtitle =
    selectedArea === "garden"
      ? labels.gardenSubtitle
      : selectedArea === "openTerrace"
      ? labels.openTerraceSubtitle
      : labels.indoorSubtitle;
  const zoneAccent = selectedArea === "indoor" ? t.mainLabel : t.smokeLabel;
  const zonePreviewImage = selectedArea === "indoor" ? "/restaurant-interior.webp" : "/restaurant-terrace.jpg";
  const partyNotice =
    partyNoticeType === "openTerraceLarge"
      ? {
          kicker: language === "bg" ? "Откритата тераса е до 8 души" : "Open terrace fits up to 8",
          title: language === "bg" ? "Изберете по-подходяща зона" : "Choose a better area",
          text:
            language === "bg"
              ? "За тази компания може да резервирате залата за непушачи или покритата тераса. Ако поводът е специален, администраторът ще помогне с най-добрата подредба."
              : "For this party size, you can book the non-smoking hall or the covered terrace. For a special occasion, the administrator can help with the best setup.",
          actions: [
            { area: "indoor", label: language === "bg" ? "Зала / Непушачи" : "Hall / Non-smoking" },
            { area: "garden", label: language === "bg" ? "Покрита тераса" : "Covered terrace" },
          ],
        }
      : partyNoticeType === "openTerraceVeryLarge"
      ? {
          kicker: language === "bg" ? "Голяма компания" : "Large party",
          title: language === "bg" ? "Най-подходяща е покритата тераса" : "The covered terrace is the best fit",
          text:
            language === "bg"
              ? "Откритата тераса е малка зона до 8 души, а залата за непушачи се комбинира онлайн до 16 гости. За тази компания може да продължите към покритата тераса или да се обадите на администратор."
              : "The open terrace is a small area for up to 8 guests, and the non-smoking hall can be booked online for up to 16. For this party size, continue with the covered terrace or call an administrator.",
          actions: [
            { area: "garden", label: language === "bg" ? "Покрита тераса" : "Covered terrace" },
          ],
        }
      : partyNoticeType === "indoorTooLarge"
      ? {
          kicker: language === "bg" ? "Голяма компания" : "Large party",
          title: language === "bg" ? "Преместихме ви към терасата" : "We moved you to the terrace",
          text:
            language === "bg"
              ? "В залата за непушачи онлайн могат да се комбинират маси до 16 гости. За по-голяма компания може да разгледате покритата тераса или да се свържете с администратор за събитие."
              : "The non-smoking hall can be booked online for up to 16 guests. For a larger party, view the covered terrace or contact an administrator to arrange an event.",
          actions: [
            { area: "garden", label: language === "bg" ? "Виж терасата" : "View terrace" },
          ],
        }
      : null;

  return (
    <>
      <div className="reservation-page luxury-shell min-h-screen px-4 pb-0 pt-4 text-white md:p-8">
        <div className="mx-auto max-w-7xl space-y-8">
          <div className="luxury-panel rounded-[28px] p-5 md:p-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <img
                src="/casa-di-fratelli-logo.svg"
                alt="Casa di Fratelli"
                className="brand-logo mb-4 h-16 w-[220px] object-left"
              />
              <div className="section-kicker mb-3">
                Luxury reservation map
              </div>
              <h1 className="text-4xl font-semibold leading-tight text-[#fff4df] md:text-6xl">Casa di Fratelli</h1>
              <p className="mt-3 max-w-2xl text-sm text-white/70 md:text-base">
                {language === "bg"
                  ? "Изберете зона, дата, час и брой гости, след което ще видите подходящите свободни маси."
                  : "Select area, date, time and number of guests, then view suitable available tables."}
              </p>
            </div>

            <div className="flex flex-wrap gap-3 text-sm">
              <button type="button" onClick={() => setLanguage("bg")} className={`rounded-full px-4 py-2 ${language === "bg" ? "bg-[#c9a56a] text-black" : "border border-white/15 bg-white/5 text-white"}`}>
                BG
              </button>

              <button type="button" onClick={() => setLanguage("en")} className={`rounded-full px-4 py-2 ${language === "en" ? "bg-[#c9a56a] text-black" : "border border-white/15 bg-white/5 text-white"}`}>
                EN
              </button>

              {onToggleTheme ? (
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="ghost-button flex h-10 w-10 items-center justify-center rounded-full"
                  title={theme === "light" ? "Dark" : "Light"}
                  aria-label={theme === "light" ? "Dark" : "Light"}
                >
                  <ThemeToggleIcon theme={theme} className="h-[18px] w-[18px]" />
                </button>
              ) : null}

              <button type="button" onClick={onBack} className="ghost-button rounded-full px-4 py-2">
                {t.backToSite}
              </button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.3fr_0.8fr]">
            <div ref={timeSelectionRef} className="luxury-panel order-first rounded-[28px] p-5 md:p-6 lg:order-last">
              <div className="section-kicker mb-2">
                {labels.reservationPreview}
              </div>

              <h3 className="mb-4 text-2xl font-semibold text-[#fff4df]">
                {language === "bg" ? "Данни за посещението" : "Visit details"}
              </h3>

              <div className="mb-5 grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm text-white/60">
                    {language === "bg" ? "Зона" : "Area"}
                  </label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {zoneOptions.map((zone) => (
                      <button
                        key={zone.value}
                        type="button"
                        onClick={() => {
                          setSelectedArea(zone.value);
                          setSelectedTables([]);
                        }}
                        className={`rounded-2xl border p-3 text-left transition active:scale-[0.98] ${
                          selectedArea === zone.value
                            ? "border-[#f2d39a]/55 bg-[#c9a56a]/16 shadow-[0_0_28px_rgba(201,165,106,0.16)]"
                            : "border-white/10 bg-white/[0.04] hover:border-[#c9a56a]/35 hover:bg-[#c9a56a]/8"
                        }`}
                      >
                        <span className="block text-sm font-semibold text-[#fff4df]">{zone.title}</span>
                        <span className="mt-1 block text-xs leading-5 text-white/55">{zone.subtitle}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm text-white/60">
                    {language === "bg" ? "Дата" : "Date"}
                  </label>
                  <input
                    type="date"
                    min={today}
                    max={maxReservationDate}
                    value={reservationDate}
                    onChange={(e) => {
                      const nextDate = e.target.value;
                      if (isDateBeyondReservationWindow(nextDate, 10)) {
                        setSubmitError(distantDateMessage);
                        setReservationDate("");
                        setSelectedTime("");
                        setSelectedTables([]);
                        return;
                      }

                      setSubmitError("");
                      setReservationDate(nextDate);
                      setSelectedTime("");
                      setSelectedTables([]);
                    }}
                    className="quiet-input w-full cursor-pointer rounded-2xl px-4 py-3 [color-scheme:dark]"
                  />
                  <p className="mt-2 text-xs leading-5 text-white/45">{distantDateMessage}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      [today, language === "bg" ? "Днес" : "Today", !isTodayBookable],
                      [
                        (() => {
                          const tomorrow = new Date();
                          tomorrow.setDate(tomorrow.getDate() + 1);
                          return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
                        })(),
                        language === "bg" ? "Утре" : "Tomorrow",
                        false,
                      ],
                    ].map(([value, label, disabled]) => (
                      <button
                        key={value}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (disabled) return;
                          setSubmitError("");
                          setReservationDate(value);
                          setSelectedTime("");
                          setSelectedTables([]);
                        }}
                        className={`rounded-xl px-3 py-2 text-sm transition ${
                          reservationDate === value
                            ? "luxury-button"
                            : disabled
                            ? "cursor-not-allowed border border-white/8 bg-white/[0.02] text-white/30"
                            : "border border-white/10 bg-white/[0.04] text-white/70 hover:border-[#c9a56a]/40"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-white/60">
                    {language === "bg" ? "Час" : "Time"}
                  </label>
                  <select
                    value={selectedTime}
                    onChange={(e) => {
                      setSelectedTime(e.target.value);
                      setSelectedTables([]);
                    }}
                    className="quiet-input w-full cursor-pointer rounded-2xl px-4 py-3 [color-scheme:dark]"
                  >
                    <option value="">{language === "bg" ? "Избери час" : "Select time"}</option>
                    {availableReservationTimes.map((time) => (
                      <option
                        key={time}
                        value={time}
                      >
                        {time}
                      </option>
                    ))}
                  </select>
                  {reservationDate === today && availableReservationTimes.length === 0 && (
                    <p className="mt-2 text-xs text-red-200/80">
                      {language === "bg"
                        ? "За днес няма останали часове за резервация."
                        : "There are no reservation times left for today."}
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm text-white/60">
                    {language === "bg" ? "Брой гости" : "Guests"}
                  </label>
                  <select
                    value={guestCount}
                    onChange={(e) => {
                      setGuestCount(e.target.value);
                      setSelectedTables([]);
                    }}
                    className="quiet-input w-full cursor-pointer rounded-2xl px-4 py-3 [color-scheme:dark]"
                  >
                    <option value="">{language === "bg" ? "Избери" : "Select"}</option>
                    {Array.from({ length: 24 }, (_, i) => i + 1).map((count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="zone-preview-card relative mb-4 aspect-[4/3] overflow-hidden rounded-[24px] border border-white/10 bg-[#1a1411] shadow-2xl shadow-black/25">
                <img src={zonePreviewImage} alt="Restaurant zone preview" className="absolute inset-0 h-full w-full scale-[1.04] object-cover object-center opacity-55 blur-[1px] transition duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="mb-2 text-xs uppercase tracking-[0.25em] text-[#d8b377]">
                    {canShowSearchParams
                      ? language === "bg"
                        ? "Свободни маси"
                        : "Available tables"
                      : language === "bg"
                      ? "Първо изберете детайли"
                      : "Select details first"}
                  </div>
                  <div className="text-2xl font-serif">
                    {selectedTables.length
                      ? getPublicTableLabel(language)
                      : language === "bg"
                      ? "Няма избрана маса"
                      : "No table selected"}
                  </div>
                  <div className="mt-1 text-sm text-white/70">
                    {zoneTitle} · {guestCount || "—"} {t.people}
                  </div>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <InfoRow label={labels.table} value={selectedTables.length ? getPublicTableLabel(language) : "—"} />
                <InfoRow label={labels.capacity} value={`${totalSeats || 0} / ${guestCount || 0} ${t.people}`} />
              </div>

              {!hasEnoughSeats && selectedTables.length > 0 && (
                <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {language === "bg"
                    ? "Избраните маси не са достатъчни за броя гости."
                    : "Selected tables are not enough for the number of guests."}
                </div>
              )}

              <button
                type="button"
                disabled={!canOpenForm}
                onClick={() => {
                  setSubmitError("");
                  setSubmitSuccess("");
                  setShowBookingForm(true);
                }}
                className={`mt-6 hidden w-full rounded-2xl lg:block py-3 font-medium transition-transform ${
                  !canOpenForm
                    ? "reservation-disabled-submit cursor-not-allowed bg-white/10 text-white/40"
                    : "luxury-button"
                }`}
              >
                {!canShowSearchParams
                  ? language === "bg"
                    ? "Избери зона, дата, час и гости"
                    : "Choose area, date, time and guests"
                  : !selectedTables.length
                  ? language === "bg"
                    ? "Избери маса"
                    : "Choose table"
                  : labels.reserveSelected}
              </button>
            </div>

            {requiresPhoneReservation || noSingleTableAvailable ? (
              <div className="flex min-h-[520px] items-center justify-center rounded-[28px] border border-[#c9a56a]/25 bg-[radial-gradient(circle_at_top_left,rgba(201,165,106,0.18),transparent_36%),rgba(0,0,0,0.24)] p-8 text-center">
                <div className="max-w-md">
                  <div className="mb-3 text-xs uppercase tracking-[0.3em] text-[#c9a56a]">
                    {language === "bg" ? "Телефонна резервация" : "Phone reservation"}
                  </div>
                  <h2 className="text-2xl font-serif text-[#fff4df]">
                    {language === "bg"
                      ? "За този брой гости ще Ви помогнем лично."
                      : "For this party size, we will assist you personally."}
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-white/65">
                    {language === "bg"
                      ? "Моля, обадете се на администратора, за да изберем най-подходящата маса и час за Вашата компания."
                      : "Please call the host so we can choose the best table and time for your group."}
                  </p>
                  <a href={`tel:${adminPhone.replace(/\s/g, "")}`} className="luxury-button mt-6 inline-flex rounded-2xl px-6 py-3 font-semibold">
                    {adminPhone}
                  </a>
                </div>
              </div>
            ) : canShowSearchParams ? (
              <div ref={mapSectionRef}>
                <ZoneCard title={zoneTitle} subtitle={zoneSubtitle} accent={zoneAccent}>
                  {selectedArea === "garden" ? (
                    <GardenMap tables={visibleGardenTables} allTables={gardenTables} selectedIds={selectedIds} onSelect={handleSelect} labels={labels} />
                  ) : selectedArea === "openTerrace" ? (
                    <OpenTerraceMap tables={visibleOpenTerraceTables} allTables={openTerraceTables} selectedIds={selectedIds} onSelect={handleSelect} labels={labels} />
                  ) : (
                    <IndoorMap tables={visibleIndoorTables} allTables={indoorTables} selectedIds={selectedIds} onSelect={handleSelect} labels={labels} />
                  )}
                </ZoneCard>
              </div>
            ) : (
              <div className="flex min-h-[520px] items-center justify-center rounded-[28px] border border-[#c9a56a]/20 bg-white/5 p-8 text-center">
                <div>
                  <div className="mb-3 text-xs uppercase tracking-[0.3em] text-[#c9a56a]">
                    {language === "bg" ? "Първа стъпка" : "First step"}
                  </div>
                  <h2 className="text-2xl font-serif">
                    {language === "bg"
                      ? "Изберете зона, дата, час и брой гости"
                      : "Select area, date, time and number of guests"}
                  </h2>
                  <p className="mt-3 max-w-md text-sm leading-7 text-white/60">
                    {language === "bg"
                      ? "След това ще покажем само подходящите свободни маси."
                      : "Then we will show only suitable available tables."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {canOpenForm && !showBookingForm && (
          <div className="sticky bottom-0 z-[60] -mx-4 mt-5 border-t border-white/10 bg-[#0f0b08]/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl lg:hidden">
            <button
              type="button"
              onClick={() => {
                setSubmitError("");
                setSubmitSuccess("");
                setShowBookingForm(true);
              }}
              className="w-full rounded-2xl bg-[#c9a56a] py-4 font-semibold text-black"
            >
              {language === "bg"
                ? "Резервирай избраната маса"
                : "Reserve selected table"}
            </button>
          </div>
        )}
      </div>

      {partyNotice && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/72 px-4 backdrop-blur-xl">
          <div className="relative w-full max-w-md overflow-hidden rounded-[30px] border border-[#c9a56a]/24 bg-[radial-gradient(circle_at_top_left,rgba(201,165,106,0.22),transparent_38%),linear-gradient(145deg,rgba(31,24,19,0.98),rgba(11,9,7,0.98))] p-6 text-center text-white shadow-2xl shadow-black/50">
            <button
              type="button"
              onClick={() => setPartyNoticeType("")}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:text-white"
              aria-label={language === "bg" ? "Затвори" : "Close"}
            >
              ×
            </button>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[#c9a56a]/30 bg-[#c9a56a]/12 text-2xl text-[#f2d39a]">
              {requestedGuests}
            </div>
            <div className="section-kicker mb-3">
              {partyNotice.kicker}
            </div>
            <h3 className="text-2xl font-semibold text-[#fff4df]">
              {partyNotice.title}
            </h3>
            <p className="mt-3 text-sm leading-7 text-white/68">
              {partyNotice.text}
            </p>
            <div className={`mt-6 grid gap-3 ${partyNotice.actions.length > 1 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              {partyNotice.actions.map((action) => (
                <button
                  key={action.area}
                  type="button"
                  onClick={() => {
                    setSelectedArea(action.area);
                    setSelectedTables([]);
                    setPartyNoticeType("");
                  }}
                  className="luxury-button rounded-2xl px-5 py-3 text-sm font-semibold"
                >
                  {action.label}
                </button>
              ))}
              <a
                href="tel:+359888218318"
                className="ghost-button rounded-2xl px-5 py-3 text-sm font-semibold"
              >
                {language === "bg" ? "Позвъни на администратор" : "Call administrator"}
              </a>
            </div>
          </div>
        </div>
      )}

      {showBookingForm && canOpenForm && (
        <BookingModal
          t={t}
          language={language}
          selectedTables={selectedTables}
          selectedArea={selectedArea}
          selectedTime={selectedTime}
          reservationDate={reservationDate}
          guestCount={guestCount}
          totalSeats={totalSeats}
          onClose={() => {
            setShowBookingForm(false);
            setSubmitError("");
            setSubmitSuccess("");
          }}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          submitError={submitError}
          submitSuccess={submitSuccess}
          onOpenPrivacy={onOpenPrivacy}
        />
      )}

      {dailyLimitNotice && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 px-4 backdrop-blur-md" role="dialog" aria-modal="true">
          <div className="luxury-panel w-full max-w-md rounded-[28px] p-6 text-center text-white shadow-2xl md:p-8">
            <p className="section-kicker">Casa di Fratelli</p>
            <h2 className="mt-3 text-2xl font-semibold text-[#fff4df]">
              Лимит за резервации
            </h2>
            <p className="mt-4 text-sm leading-7 text-stone-300">
              Опитвате се да направите трета резервация за днес със същия телефон или имейл.
              За повече резервации, моля, свържете се с администратор.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <a
                href="tel:+359888218318"
                className="luxury-button rounded-2xl px-5 py-3 text-sm font-semibold"
              >
                Позвъни
              </a>
              <button
                type="button"
                onClick={() => setDailyLimitNotice(false)}
                className="ghost-button rounded-2xl px-5 py-3 text-sm font-semibold"
              >
                Разбрах
              </button>
            </div>
          </div>
        </div>
      )}

      {emailConfirmationNotice && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 px-4 backdrop-blur-md" role="dialog" aria-modal="true">
          <div className="luxury-panel w-full max-w-md rounded-[30px] p-6 text-center text-white shadow-2xl md:p-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#c9a56a]/30 bg-[#c9a56a]/12 text-3xl text-[#f2d39a]">
              ✓
            </div>
            <p className="section-kicker mt-5">Casa di Fratelli</p>
            <h2 className="mt-3 text-2xl font-semibold text-[#fff4df]">
              {language === "bg" ? "Потвърдете от имейла" : "Confirm from your email"}
            </h2>
            <p className="mt-4 text-sm leading-7 text-stone-300">
              {language === "bg"
                ? `Изпратихме писмо на ${emailConfirmationNotice.email}. Отворете го и натиснете бутона за потвърждение, за да запазим резервацията окончателно.`
                : `We sent an email to ${emailConfirmationNotice.email}. Open it and press the confirmation button to finalize your reservation.`}
            </p>
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-stone-300">
              {emailConfirmationNotice.date} · {emailConfirmationNotice.time}
            </div>
            <button
              type="button"
              onClick={() => {
                setEmailConfirmationNotice(null);
                setSubmitSuccess("");
                onReservationComplete?.();
              }}
              className="luxury-button mt-6 w-full rounded-2xl px-5 py-3 text-sm font-semibold"
            >
              {language === "bg" ? "Разбрах" : "Got it"}
            </button>
          </div>
        </div>
      )}

      {autoConfirmationNotice && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 px-4 backdrop-blur-md" role="dialog" aria-modal="true">
          <div className="luxury-panel w-full max-w-md rounded-[30px] p-6 text-center text-white shadow-2xl md:p-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-400/12 text-3xl text-emerald-200">
              ✓
            </div>
            <p className="section-kicker mt-5">Casa di Fratelli</p>
            <h2 className="mt-3 text-2xl font-semibold text-[#fff4df]">
              {language === "bg"
                ? `Добре дошли отново, ${autoConfirmationNotice.guestName}!`
                : `Welcome back, ${autoConfirmationNotice.guestName}!`}
            </h2>
            <p className="mt-4 text-sm leading-7 text-stone-300">
              {language === "bg"
                ? "Вашата резервация е автоматично потвърдена, защото вече сте клиент на нашия ресторант."
                : "Your reservation is automatically confirmed because you are already a guest of our restaurant."}
            </p>
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-stone-300">
              {autoConfirmationNotice.date} · {autoConfirmationNotice.time}
            </div>
            <button
              type="button"
              onClick={() => {
                setAutoConfirmationNotice(null);
                setSubmitSuccess("");
                setSubmitError("");
                onReservationComplete?.();
              }}
              className="luxury-button mt-6 w-full rounded-2xl px-5 py-3 text-sm font-semibold"
            >
              {language === "bg" ? "Готово" : "Done"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
