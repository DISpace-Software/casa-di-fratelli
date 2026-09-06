import { useTenantBranding } from "../../context/TenantBrandingContext";
const socials = [
  {
    key: "facebook",
    href: "https://www.facebook.com/CassadiFratelli",
    label: "Facebook",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
        <path
          fill="currentColor"
          d="M14.1 8.1V6.4c0-.8.2-1.3 1.3-1.3h1.7V2.2c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v1.7H7.6v3.2h2.8v8.4h3.4v-8.4h2.8l.4-3.2h-3Z"
        />
      </svg>
    ),
  },
  {
    key: "instagram",
    href: "https://www.instagram.com/casadifratelli.plovdiv/",
    label: "Instagram",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
        <path
          fill="currentColor"
          d="M7.8 2.3h8.4c3 0 5.5 2.5 5.5 5.5v8.4c0 3-2.5 5.5-5.5 5.5H7.8c-3 0-5.5-2.5-5.5-5.5V7.8c0-3 2.5-5.5 5.5-5.5Zm0 2A3.5 3.5 0 0 0 4.3 7.8v8.4a3.5 3.5 0 0 0 3.5 3.5h8.4a3.5 3.5 0 0 0 3.5-3.5V7.8a3.5 3.5 0 0 0-3.5-3.5H7.8Zm4.2 3.4a4.3 4.3 0 1 1 0 8.6 4.3 4.3 0 0 1 0-8.6Zm0 2a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6Zm4.6-2.7a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Z"
        />
      </svg>
    ),
  },
];

export default function ContactSection({ t }) {
  const { branding } = useTenantBranding();
  return (
    <section id="contacts" className="px-5 py-14 md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-5 overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_10%_10%,rgba(201,165,106,0.16),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.32)] md:grid-cols-[1fr_auto] md:items-center md:p-8">
          <div>
            <div className="section-kicker">{t.contactTag}</div>
            <h2 className="mt-3 text-3xl font-semibold text-[#fff4df] md:text-4xl">
              {t.contactTitle}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-300 md:text-base">
              {t.contactText}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
            <a className="text-[#f2d39a]" href={`tel:${branding.phone}`}>{branding.phone}</a>
            {branding.email && <a className="text-[#f2d39a]" href={`mailto:${branding.email}`}>{branding.email}</a>}
            {branding.address && <p>{branding.address} · {branding.city}</p>}
            <p>{branding.openingHoursText}</p>
            {socials.map((social) => ({ ...social, href: branding[`${social.key}Url`] })).filter((social) => social.href).map((social) => (
              <a
                key={social.key}
                href={social.href}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-3 rounded-2xl border border-[#c9a56a]/24 bg-black/24 px-5 py-4 text-[#fff4df] transition hover:-translate-y-0.5 hover:border-[#f2d39a]/45 hover:bg-[#c9a56a]/12"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#f2d39a]/22 bg-[#c9a56a]/14 text-[#f2d39a] transition group-hover:scale-105">
                  {social.icon}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{social.label}</span>
                  <span className="mt-1 block text-xs text-stone-400">{t.contactOpen}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
