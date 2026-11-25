import { normalizeAdminRole } from '../../admin/presentation/roles.js';

export function Panel({ title, subtitle, children, right, bare = false }) {
  if (bare) return <>{children}</>;

  return (
    <div className="luxury-panel rounded-[26px] p-5 md:p-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[#fff4df]">{title}</h2>
          {subtitle && <p className="mt-2 text-sm text-stone-400">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

export function StatCard({ label, value, hint }) {
  return (
    <div className="luxury-panel rounded-[22px] p-5">
      <div className="text-sm text-stone-400">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-[#fff4df]">{value}</div>
      {hint && <div className="mt-2 text-xs text-stone-500">{hint}</div>}
    </div>
  );
}

export function StatusBadge({ status }) {
  const styles = {
    Pending: "border-amber-400/25 bg-amber-400/15 text-amber-300",
    Approved: "border-emerald-400/25 bg-emerald-400/15 text-emerald-300",
    Cancelled: "border-red-400/25 bg-red-400/15 text-red-300",
    Released: "border-sky-300/25 bg-sky-400/15 text-sky-200",
  };

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${styles[status] || styles.Pending}`}>
      {status}
    </span>
  );
}

export function RefreshIcon({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M20 11a8 8 0 0 0-14.2-4.9" />
      <path d="M5 3v4.8h4.8" />
      <path d="M4 13a8 8 0 0 0 14.2 4.9" />
      <path d="M19 21v-4.8h-4.8" />
    </svg>
  );
}

export function ThemeIcon({ theme, className = "h-5 w-5" }) {
  const isLight = theme === "light";

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {isLight ? (
        <>
          <path d="M21 14.2A8.2 8.2 0 0 1 9.8 3a7 7 0 1 0 11.2 11.2z" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </>
      )}
    </svg>
  );
}

export function RoleProfileIcon({ role, className = "h-12 w-12" }) {
  const normalized = normalizeAdminRole(role);
  const imageByRole = {
    Kitchen: "/admin-role-chef.jpeg",
    Bar: "/admin-role-waiter.jpeg",
    Waiter: "/admin-role-waiter.jpeg",
    Administrator: "/admin-role-admin.jpeg",
    Owner: "/admin-role-owner.jpeg",
    Developer: "/admin-role-developer.jpeg",
  };
  const src = imageByRole[normalized] || imageByRole.Administrator;

  return (
    <span
      className={`relative block overflow-hidden rounded-[22px] border border-[#d8b676]/35 bg-black/60 shadow-[0_12px_32px_rgba(0,0,0,0.35)] ring-1 ring-white/5 ${className}`}
      aria-hidden="true"
    >
      <img
        src={src}
        alt=""
        className="h-full w-full scale-[1.04] object-cover object-center"
        loading="lazy"
      />
      <span className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-b from-white/10 via-transparent to-black/18" />
    </span>
  );
}

export function AdminNavIcon({ type, className = "h-6 w-6" }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      {type === "liveMap" && (
        <>
          <path d="M5 8l7-3 8 3 7-3v19l-7 3-8-3-7 3z" {...common} />
          <path d="M12 5v19M20 8v19" {...common} />
          <circle cx="16" cy="15" r="3" {...common} />
        </>
      )}
      {type === "reservations" && (
        <>
          <rect x="6" y="7" width="20" height="20" rx="4" {...common} />
          <path d="M10 5v5M22 5v5M6 13h20" {...common} />
          <path d="M11 18h4M18 18h3M11 23h7" {...common} />
        </>
      )}
      {type === "block" && (
        <>
          <rect x="6" y="8" width="20" height="18" rx="4" {...common} />
          <path d="M10 13h12M10 18h8" {...common} />
          <path d="M21 23l5-5M26 23l-5-5" {...common} />
        </>
      )}
      {type === "orders" && (
        <>
          <path d="M9 24h14" {...common} />
          <path d="M8 22c1-7 5-11 8-11s7 4 8 11z" {...common} />
          <path d="M16 8v3" {...common} />
          <path d="M11 6h10" {...common} />
        </>
      )}
      {type === "reports" && (
        <>
          <path d="M7 25h18" {...common} />
          <path d="M10 21v-7M16 21V9M22 21v-4" {...common} />
          <path d="M8 8l5 4 5-5 5 3" {...common} />
        </>
      )}
      {type === "menu" && (
        <>
          <path d="M9 6v20M23 6v20" {...common} />
          <path d="M12 9h7M12 14h7M12 19h7" {...common} />
          <path d="M7 6h18v20H7z" {...common} />
        </>
      )}
      {type === "events" && (
        <>
          <rect x="6" y="8" width="20" height="18" rx="4" {...common} />
          <path d="M10 6v5M22 6v5M6 13h20" {...common} />
          <path d="M11 20l3 3 7-8" {...common} />
          <path d="M11 17h3" {...common} />
        </>
      )}
      {type === "marketing" && (
        <>
          <path d="M7 23c6.5-1.5 12.5-6 17-14" {...common} />
          <path d="M22 8l4-1-1 4" {...common} />
          <rect x="7" y="15" width="4" height="9" rx="1.4" {...common} />
          <rect x="14" y="12" width="4" height="12" rx="1.4" {...common} />
          <rect x="21" y="16" width="4" height="8" rx="1.4" {...common} />
        </>
      )}
      {type === "layout" && (
        <>
          <rect x="6" y="7" width="8" height="7" rx="2" {...common} />
          <rect x="18" y="7" width="8" height="7" rx="2" {...common} />
          <rect x="6" y="18" width="8" height="7" rx="2" {...common} />
          <rect x="18" y="18" width="8" height="7" rx="2" {...common} />
        </>
      )}
      {type === "customers" && (
        <>
          <circle cx="13" cy="12" r="4" {...common} />
          <path d="M6 25c1.5-6 5-9 7-9s5.5 3 7 9" {...common} />
          <circle cx="22" cy="14" r="3" {...common} />
          <path d="M19 20c2.5.5 4.5 2.3 5.5 5" {...common} />
        </>
      )}
      {type === "dev" && (
        <>
          <rect x="3" y="5" width="26" height="22" rx="5" {...common} />
          <path d="m11 12-4 4 4 4M21 12l4 4-4 4M18 10l-4 12" {...common} />
        </>
      )}
      {type === "admins" && (
        <>
          <circle cx="16" cy="11" r="4" {...common} />
          <path d="M8 25c2-7 6-10 8-10s6 3 8 10" {...common} />
          <path d="M24 8l2 2 4-5" {...common} />
        </>
      )}
    </svg>
  );
}

