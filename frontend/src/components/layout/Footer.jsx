import { useTenantBranding } from "../../context/TenantBrandingContext";
export default function Footer({ t, onOpenPrivacy }) {
  const { branding } = useTenantBranding();
  return (
    <footer className="site-footer border-t border-white/10 bg-black/20 px-6 py-10 text-center text-sm text-stone-400">
      <img
        src={branding.logoUrl || "/restaurant-generic.svg"}
        alt={t.brand}
        className="brand-logo footer-logo mx-auto mb-5 h-16 w-[220px]"
      />
      <div className="mb-3 text-xs uppercase tracking-[0.24em] text-[#d8b377]">
        Pizza, Pasta and Grill
      </div>
      <div className="mx-auto mb-5 h-px max-w-sm bg-gradient-to-r from-transparent via-[#c9a56a]/40 to-transparent" />
      <div>{t.footer}</div>
      {onOpenPrivacy && (
        <button
          type="button"
          onClick={onOpenPrivacy}
          className="mt-4 text-[#d8b377] underline-offset-4 transition hover:text-[#fff4df] hover:underline"
        >
          {t.privacyPolicy || "Privacy Policy"}
        </button>
      )}
    </footer>
  );
}
