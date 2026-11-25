
export function AdminMapWindow({ className = "", label, vertical = false }) {
  return (
    <div className={`pointer-events-none absolute z-[3] ${className}`}>
      <div className="relative h-full w-full overflow-hidden rounded-full border border-sky-200/35 bg-sky-100/[0.065] shadow-[0_0_26px_rgba(125,211,252,0.14)] backdrop-blur">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.22),transparent_36%),repeating-linear-gradient(90deg,transparent_0_18%,rgba(186,230,253,0.2)_18%_19%,transparent_19%_38%)]" />
        <div className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-sky-100/35" />
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

export function AdminMapDecor({ area, presentation }) {
  if (!presentation?.startsWith("casa-")) return null;
  if (area === "garden") {
    return (
      <>
        <AdminMapWindow className="bottom-5 right-3 top-5 w-4" label="Прозорци" vertical />
        <AdminMapWindow className="left-5 right-5 top-3 h-4" label="" />
        <AdminMapWindow className="bottom-3 left-5 right-5 h-4" label="" />
        <div className="pointer-events-none absolute left-1/2 top-3 z-[3] -translate-x-1/2 -translate-y-1/2">
          <div className="relative h-6 w-16 rounded-lg border border-white/18 bg-[#080706] shadow-[0_0_24px_rgba(0,0,0,0.42)]">
            <div className="absolute inset-1 rounded-lg bg-[linear-gradient(160deg,rgba(56,189,248,0.28),rgba(255,255,255,0.08)_42%,rgba(20,184,166,0.16))]" />
          </div>
          <div className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[7px] font-bold uppercase tracking-[0.16em] text-white/60">
            Телевизор
          </div>
        </div>
        <div className="pointer-events-none absolute left-0 top-[60%] z-[3] w-[150px] -translate-x-1/2 -translate-y-1/2 -rotate-90 text-center">
          <div className="mx-auto h-6 w-16 rounded-t-full border-x border-t border-[#d6b278]/55 bg-[radial-gradient(circle_at_50%_100%,rgba(214,178,120,0.28),transparent_62%)]" />
          <div className="mx-auto h-1 w-20 rounded-full bg-[#d6b278]/55" />
          <div className="mx-auto mt-0.5 max-w-[96px] rounded-full border border-[#c9a56a]/28 bg-black/48 px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.16em] text-[#f2d39a] backdrop-blur">
            Вход към терасата
          </div>
        </div>
      </>
    );
  }

  if (area === "openTerrace") {
    return (
      <div className="pointer-events-none absolute left-1/2 bottom-2 z-[3] w-[32%] -translate-x-1/2 text-center">
        <div className="mx-auto h-6 w-16 rounded-t-full border-x border-t border-[#d6b278]/55 bg-[radial-gradient(circle_at_50%_100%,rgba(214,178,120,0.28),transparent_62%)]" />
        <div className="mx-auto h-1 w-20 rounded-full bg-[#d6b278]/55" />
        <div className="mx-auto mt-0.5 max-w-[116px] rounded-full border border-[#c9a56a]/28 bg-black/48 px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.14em] text-[#f2d39a] backdrop-blur">
          Вход в ресторан
        </div>
      </div>
    );
  }

  return (
    <>
      <AdminMapWindow className="bottom-3 left-5 h-4 w-[50%]" label="Прозорци" />
      <AdminMapWindow className="bottom-3 left-[70%] right-5 h-4" label="Прозорци" />
      <div className="pointer-events-none absolute left-[51%] top-5 z-[3] h-[50%] w-4 -translate-x-1/2">
        <div className="relative h-full w-full rounded-full border border-stone-200/14 bg-[linear-gradient(90deg,rgba(255,244,223,0.18),rgba(63,47,34,0.78),rgba(255,244,223,0.12))] shadow-[0_0_28px_rgba(0,0,0,0.34)]" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap rounded-full border border-white/10 bg-black/35 px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.18em] text-white/55 backdrop-blur">
          Стена
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-0 left-[60%] z-[3] w-[120px] -translate-x-1/2 text-center">
        <div className="mx-auto h-6 w-16 rounded-t-full border-x border-t border-[#d6b278]/55 bg-[radial-gradient(circle_at_50%_100%,rgba(214,178,120,0.32),transparent_68%)]" />
        <div className="mx-auto h-1 w-20 rounded-full bg-[#d6b278]/55" />
        <div className="mx-auto mt-0.5 w-fit rounded-full border border-[#c9a56a]/28 bg-black/48 px-2 py-1 text-[7px] font-bold uppercase tracking-[0.16em] text-[#f2d39a] backdrop-blur">
          Вход
        </div>
      </div>
      <div className="pointer-events-none absolute right-0 top-[60%] z-[3] w-[150px] translate-x-1/2 -translate-y-1/2 rotate-90 text-center">
        <div className="mx-auto h-6 w-16 rounded-t-full border-x border-t border-emerald-200/45 bg-[radial-gradient(circle_at_50%_100%,rgba(110,231,183,0.2),transparent_64%)]" />
        <div className="mx-auto h-1 w-20 rounded-full bg-emerald-200/45" />
        <div className="mx-auto mt-0.5 max-w-[104px] rounded-full border border-emerald-200/20 bg-black/48 px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.14em] text-emerald-100/90 backdrop-blur">
          Вход към терасата
        </div>
      </div>
    </>
  );
}

export function LegacyAdminMapDecor({ area, presentation }) {
  if (!presentation?.startsWith("casa-")) return null;
  if (area === "garden") {
    return (
      <>
        <AdminMapWindow className="left-5 right-5 top-3 h-4" label="Прозорци" />
        <AdminMapWindow className="bottom-5 left-3 top-5 w-4" label="Прозорци" vertical />
        <AdminMapWindow className="bottom-5 right-3 top-5 w-4" label="Прозорци" vertical />
        <div className="pointer-events-none absolute left-[4%] top-[50%] z-[3]">
          <div className="relative h-16 w-6 rounded-lg border border-white/18 bg-[#080706] shadow-[0_0_24px_rgba(0,0,0,0.42)]">
            <div className="absolute inset-1 rounded-lg bg-[linear-gradient(160deg,rgba(56,189,248,0.28),rgba(255,255,255,0.08)_42%,rgba(20,184,166,0.16))]" />
          </div>
          <div className="mt-1 -translate-x-4 rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[7px] font-bold uppercase tracking-[0.16em] text-white/60">
            Телевизор
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-1 left-1/2 z-[3] w-[24%] -translate-x-1/2 text-center">
          <div className="mx-auto h-6 w-16 rounded-t-full border-x border-t border-[#d6b278]/55 bg-[radial-gradient(circle_at_50%_100%,rgba(214,178,120,0.28),transparent_62%)]" />
          <div className="mx-auto h-1 w-20 rounded-full bg-[#d6b278]/55" />
          <div className="mx-auto mt-0.5 max-w-[96px] rounded-full border border-[#c9a56a]/28 bg-black/48 px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.16em] text-[#f2d39a] backdrop-blur">
            Вход към терасата
          </div>
        </div>
      </>
    );
  }

  if (area === "openTerrace") {
    return (
      <div className="pointer-events-none absolute left-1/2 bottom-2 z-[3] w-[32%] -translate-x-1/2 text-center">
        <div className="mx-auto h-6 w-16 rounded-t-full border-x border-t border-[#d6b278]/55 bg-[radial-gradient(circle_at_50%_100%,rgba(214,178,120,0.28),transparent_62%)]" />
        <div className="mx-auto h-1 w-20 rounded-full bg-[#d6b278]/55" />
        <div className="mx-auto mt-0.5 max-w-[116px] rounded-full border border-[#c9a56a]/28 bg-black/48 px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.14em] text-[#f2d39a] backdrop-blur">
          Вход в ресторан
        </div>
      </div>
    );
  }

  return (
    <>
      <AdminMapWindow className="left-3 top-5 h-[50%] w-4" label="Прозорци" vertical />
      <AdminMapWindow className="bottom-5 left-3 top-[70%] w-4" label="Прозорци" vertical />
      <div className="pointer-events-none absolute right-5 top-[51%] z-[3] h-4 w-[50%] -translate-y-1/2">
        <div className="relative h-full w-full rounded-full border border-stone-200/14 bg-[linear-gradient(180deg,rgba(255,244,223,0.18),rgba(63,47,34,0.78),rgba(255,244,223,0.12))] shadow-[0_0_28px_rgba(0,0,0,0.34)]">
          <div className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-[#f2d39a]/20" />
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/35 px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.18em] text-white/55 backdrop-blur">
          Стена
        </div>
      </div>
      <div className="pointer-events-none absolute left-1 top-[60%] z-[3] flex -translate-y-1/2 items-center">
        <div className="h-14 w-5 rounded-r-full border-y border-r border-[#d6b278]/55 bg-[radial-gradient(circle_at_0%_50%,rgba(214,178,120,0.32),transparent_68%)]" />
        <div className="ml-1 rounded-full border border-[#c9a56a]/28 bg-black/48 px-2 py-1 text-[7px] font-bold uppercase tracking-[0.16em] text-[#f2d39a] backdrop-blur">
          Вход
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-1 left-[45%] z-[3] w-[28%] -translate-x-1/2 text-center">
        <div className="mx-auto h-6 w-16 rounded-t-full border-x border-t border-emerald-200/45 bg-[radial-gradient(circle_at_50%_100%,rgba(110,231,183,0.2),transparent_64%)]" />
        <div className="mx-auto h-1 w-20 rounded-full bg-emerald-200/45" />
        <div className="mx-auto mt-0.5 max-w-[104px] rounded-full border border-emerald-200/20 bg-black/48 px-2 py-0.5 text-[7px] font-bold uppercase tracking-[0.14em] text-emerald-100/90 backdrop-blur">
          Вход към терасата
        </div>
      </div>
    </>
  );
}

