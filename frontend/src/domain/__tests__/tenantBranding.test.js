import test from "node:test";
import assert from "node:assert/strict";
import { CASA_BRANDING, initialTenantBranding, normalizeTenantBranding, brandingPayload, brandTranslations } from "../../config/tenantBranding.js";

test("unavailable or malformed branding preserves Casa defaults", () => {
  for (const input of [null, undefined, [], "bad"]) {
    assert.equal(normalizeTenantBranding(input).name, CASA_BRANDING.name);
    assert.equal(normalizeTenantBranding(input).phone, CASA_BRANDING.phone);
  }
});
test("a different tenant cannot inherit Casa contacts or links", () => {
  const branding = normalizeTenantBranding({ name: "Bistro", phone: "", logoUrl: "" });
  assert.equal(branding.isCasa, false);
  assert.equal(branding.phone, "");
  assert.equal(branding.facebookUrl, "");
  assert.equal(branding.googleReviewUrl, "");
  assert.equal(branding.logoUrl, "");
});
test("branding refuses unsafe links and PUT excludes derived or unknown fields", () => {
  const branding = normalizeTenantBranding({ name: "Bistro", logoUrl: "javascript:alert(1)", facebookUrl: "//other.example", instagramUrl: "/\\other.example" });
  assert.equal(branding.logoUrl, "");
  assert.equal(branding.facebookUrl, "");
  assert.equal(branding.instagramUrl, "");
  assert.deepEqual(Object.keys(brandingPayload({ ...branding, secret: "never send" })), Object.keys(CASA_BRANDING));
});
test("translated name and hours follow tenant content without mutating translations", () => {
  const source = { brand: "Casa di Fratelli", footer: "© Casa di Fratelli", hoursValue: "old" };
  const branding = normalizeTenantBranding({ name: "Bistro", openingHoursEn: "Daily 12–22" });
  assert.equal(brandTranslations(source, branding, "en").hoursValue, "Daily 12–22");
  assert.equal(brandTranslations(source, branding).footer, "© Bistro");
  assert.equal(source.brand, "Casa di Fratelli");
});

test("Cofein gets its original local artwork without changing saved API branding", () => {
  const branding = normalizeTenantBranding({ name: "Cofein", logoUrl: "", phone: "0893300305" }, { tenantId: "cofein" });
  assert.equal(branding.name, "Cofein");
  assert.equal(branding.phone, "0893300305");
  assert.equal(branding.isCasa, false);
  assert.equal(branding.isCofein, true);
  assert.equal(branding.fallbackLogoUrl, "/cofein/brand/cofein-lockup.svg");
  assert.equal(branding.faviconUrl, "/cofein/favicon.svg");
  assert.equal(brandingPayload(branding).logoUrl, "");
  assert.equal("fallbackLogoUrl" in brandingPayload(branding), false);
});

test("API name, custom logo, contact and opening hours remain authoritative for Cofein", () => {
  for (const logoUrl of ["/uploads/new-logo.svg", "https://cdn.example.test/brand.png"]) {
    const branding = normalizeTenantBranding({ name: "Cofein Coffee Bar", logoUrl, phone: "555", openingHoursBg: "08:00 – 22:00" }, { tenantId: "cofein" });
    assert.equal(branding.logoUrl, logoUrl);
    assert.equal(branding.name, "Cofein Coffee Bar");
    assert.equal(branding.phone, "555");
    assert.equal(branding.openingHoursText, "08:00 – 22:00");
  }
});

test("tenant identity, not a matching display name, controls fallback assets and Casa defaults", () => {
  for (const name of ["Cofein", CASA_BRANDING.name]) {
    const branding = normalizeTenantBranding({ name }, { tenantId: "another-restaurant" });
    assert.equal(branding.fallbackLogoUrl, "");
    assert.equal(branding.isCasa, false);
    assert.equal(branding.isCofein, false);
    assert.equal(branding.phone, "");
  }
  const casa = normalizeTenantBranding(null, { tenantId: "casa-di-fratelli" });
  assert.equal(casa.logoUrl, CASA_BRANDING.logoUrl);
  assert.equal(casa.faviconUrl, "/favicon-48x48.png");
});

test("initial branding identifies the selected tenant before network requests complete", () => {
  const cofein = initialTenantBranding({ shared: true, tenantId: "cofein" });
  assert.equal(cofein.name, "Cofein");
  assert.equal(cofein.fallbackLogoUrl, "/cofein/brand/cofein-lockup.svg");
  assert.equal(cofein.phone, "");
  const unknown = initialTenantBranding({ shared: true, tenantId: "unknown" });
  assert.equal(unknown.isCasa, false);
  assert.equal(unknown.fallbackLogoUrl, "");
  assert.equal(initialTenantBranding({ shared: false, tenantId: "casa-di-fratelli" }).name, CASA_BRANDING.name);
});
