import test from "node:test";
import assert from "node:assert/strict";
import { CASA_BRANDING, normalizeTenantBranding, brandingPayload, brandTranslations } from "../../config/tenantBranding.js";

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
