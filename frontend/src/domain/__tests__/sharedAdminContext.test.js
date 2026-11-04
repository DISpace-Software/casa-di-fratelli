import test from "node:test";
import assert from "node:assert/strict";
import { resolveTenantContext, storageKeyForTenant } from "../../config/tenantRuntime.js";
import { createTenantFetch } from "../../config/tenantApi.js";
import { normalizeTenantBranding } from "../../config/tenantBranding.js";

const context = (id) => resolveTenantContext({ shared: true, pathname: `/r/${id}/admin` });
const baseUrl = "https://api.example.test";

test("shared admin requires an explicit, exact tenant route; it never defaults to Casa", () => {
  for (const pathname of ["/", "/admin", "/admin.html", "/r//admin", "/r/cofein/admin/extra", "/r/Cofein/admin", "/r/cofein%2fother/admin", "/r/../admin", "/r/-cofein/admin"]) {
    assert.equal(resolveTenantContext({ shared: true, pathname }).valid, false, pathname);
  }
  assert.equal(context("cofein").tenantId, "cofein");
  assert.equal(context("new-restaurant").valid, true);
  assert.equal(resolveTenantContext({ shared: true, pathname: "/r/cofein/admin/" }).adminPath, "/r/cofein/admin");
});

test("same-origin restaurants have different session, remembered email, device and map storage", () => {
  for (const key of ["admin-token", "admin-user", "admin-email", "admin-device-token", "casa-admin-map-view-mode", "casa-admin-unified-map-camera"]) {
    assert.notEqual(storageKeyForTenant(key, context("cofein")), storageKeyForTenant(key, context("casa-di-fratelli")));
    assert.equal(storageKeyForTenant(key, resolveTenantContext()), key);
  }
  assert.throws(() => storageKeyForTenant("admin-token", resolveTenantContext({ shared: true })));
});

test("all API requests merge tenant headers while retaining auth, body, concurrency and abort signal", async () => {
  let observed;
  const controller = new AbortController();
  const client = createTenantFetch({ baseUrl, context: context("cofein"), request: async (url, options) => {
    observed = { url, options }; return new Response("{}", { status: 200 });
  } });
  await client("/api/table-layouts", { method: "PUT", headers: new Headers({ "X-Admin-Token": "local-session", "If-Match": '"revision-1"', "Content-Type": "application/json" }), body: "[]", signal: controller.signal });
  assert.equal(observed.url, `${baseUrl}/api/table-layouts`);
  assert.equal(observed.options.headers.get("X-Tenant-Id"), "cofein");
  assert.equal(observed.options.headers.get("X-Admin-Token"), "local-session");
  assert.equal(observed.options.headers.get("If-Match"), '"revision-1"');
  assert.equal(observed.options.method, "PUT");
  assert.equal(observed.options.body, "[]");
  assert.equal(observed.options.signal, controller.signal);
  assert.equal(observed.options.redirect, "error");
});

test("no credentials leave the API origin or cross a conflicting tenant context", async () => {
  let calls = 0;
  const client = createTenantFetch({ baseUrl, context: context("cofein"), request: async () => { calls++; } });
  await assert.rejects(client("https://another.example.test/api/admin/me"));
  await assert.rejects(client(`${baseUrl}/assets/anything`));
  await assert.rejects(client(`${baseUrl}/api/admin/me`, { headers: { "X-Tenant-Id": "casa-di-fratelli" } }));
  const invalid = createTenantFetch({ baseUrl, context: resolveTenantContext({ shared: true }), request: async () => { calls++; } });
  await assert.rejects(invalid(`${baseUrl}/api/admin/login`));
  assert.equal(calls, 0);
});

test("restored sessions expire on authenticated401, but incorrect login passwords do not trigger logout", async () => {
  const expired = [];
  const client = createTenantFetch({ baseUrl, context: context("cofein"), onUnauthorized: (token) => expired.push(token), request: async () => new Response("{}", { status: 401 }) });
  await client(`${baseUrl}/api/admin/login`, { method: "POST" });
  assert.deepEqual(expired, []);
  await client(new Request(`${baseUrl}/api/admin/me`, { headers: { "X-Admin-Token": "expired" } }));
  assert.deepEqual(expired, ["expired"]);
});

test("tenant identity controls Casa branding defaults even if a restaurant name is changed", () => {
  const renamed = normalizeTenantBranding({ name: "Casa di Fratelli" }, { isCasa: false });
  assert.equal(renamed.isCasa, false);
  assert.equal(renamed.logoUrl, "");
  assert.equal(renamed.phone, "");
});
