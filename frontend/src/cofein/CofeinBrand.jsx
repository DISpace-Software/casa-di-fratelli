/** Restaurant lettering traced from its original printed menu, never typeset. */
export default function CofeinBrand({ compact = false, className = '' }) {
  return <span role="img" aria-label="COFEIN" className={`cofein-brand ${compact ? 'cofein-brand-name' : 'cofein-brand-lockup'} ${className}`} />;
}
