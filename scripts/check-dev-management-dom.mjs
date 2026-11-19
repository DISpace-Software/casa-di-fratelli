// Integration checks against the actual AdminPage in a simulated DOM.
// This does not perform a browser/visual test or contact any real API.
// node scripts/check-dev-management-dom.mjs <happy-dom module> <esbuild module> <report.json>
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [happyDomModule, esbuildModule, reportFile] = process.argv.slice(2);
assert.ok(happyDomModule && esbuildModule && reportFile, "Supply happy-dom, esbuild module paths and report path");
const { Window } = await import(pathToFileURL(path.resolve(happyDomModule)).href);
const { build } = await import(pathToFileURL(path.resolve(esbuildModule)).href);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(path.join(os.tmpdir(), "dev-management-dom-"));
const bundle = path.join(temporary, "management.mjs");
const apiBase = "https://api.example.test";
const checks = [];
const originalError = console.error;
const originalFetch = globalThis.fetch;
let scenario = 0;

await build({
  stdin: {
    contents: `export {default as AdminPage} from './src/pages/AdminPage.jsx';
      export {SeasonalZonesContext} from './src/context/SeasonalZonesContext.js';
      export {TenantBrandingContext} from './src/context/TenantBrandingContext.js';
      export {CASA_BRANDING} from './src/config/tenantBranding.js';
      export {act, StrictMode, createElement} from 'react';
      export {createRoot} from 'react-dom/client';`,
    resolveDir: path.join(repo, "frontend"), sourcefile: "dev-management-test-entry.jsx", loader: "jsx",
  },
  bundle: true, format: "esm", platform: "node", jsx: "automatic", outfile: bundle, logLevel: "silent",
  define: { "import.meta.env.VITE_SHARED_ADMIN": '"true"', "import.meta.env.VITE_API_BASE_URL": JSON.stringify(apiBase) },
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const json = (value) => new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
const preorderSettings = {
  platform: { enabled: false, commissionBasisPoints: 1200 },
  restaurant: { optedIn: false },
  consentNeedsRenewal: false,
  termsVersion: "preorders-v1",
  cardPaymentsAvailable: false,
};
const emptyLists = new Set([
  "/api/reservations", "/api/blacklist", "/api/reservations/public-table-holds", "/api/customers",
  "/api/events/admin", "/api/feedback", "/api/feedback/emails", "/api/dining-orders", "/api/menu",
  "/api/maintenance/reservations/archive", "/api/maintenance/backups",
]);

async function test(name, { role = "Developer", query = "", tier = "Pro", tenant = "cofein" } = {}, exercise) {
  const window = new Window({ url: `https://admin.example.test/r/${tenant}/admin${query}` });
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "Node", "Element", "Event", "CustomEvent", "MouseEvent", "KeyboardEvent", "MutationObserver", "ResizeObserver"])
    Object.defineProperty(globalThis, key, { value: key === "window" ? window : key === "document" ? window.document : window[key], configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const requests = [];
  const runtimeErrors = [];
  const unexpectedRequests = [];
  console.error = (...args) => { runtimeErrors.push(args.map(String).join(" ")); };
  window.confirm = () => { throw new Error("This test must never trigger a destructive confirmation"); };
  window.prompt = () => { throw new Error("This test must never enter a privileged action code"); };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = options.method || "GET";
    requests.push({ path: url.pathname, method });
    assert.equal(url.origin, apiBase, "All requests must stay on the fake API origin");
    assert.equal(new Headers(options.headers).get("X-Tenant-Id"), tenant);
    assert.equal(new Headers(options.headers).get("X-Admin-Token"), "test-session");
    if (method !== "GET") {
      unexpectedRequests.push(`${method} ${url.pathname}`);
      throw new Error("Management navigation must never mutate data");
    }
    if (emptyLists.has(url.pathname)) return json([]);
    if (url.pathname === "/api/product-tier") return json({ tier, isPro: tier === "Pro" });
    if (url.pathname === "/api/restaurant-closure") return json({ enabled: false });
    if (url.pathname === "/api/admin/push/config") return json({ enabled: false });
    if (url.pathname === "/api/floor-plan") return json({ schemaVersion: 1, revision: "test-plan-1", zones: [], tables: [], combinations: [] });
    if (url.pathname === "/api/preorders/settings") return json(preorderSettings);
    if (url.pathname === "/api/admin/users") return json([{ id: 2, name: "Fixture owner", email: "owner@example.test", role: "Owner", isActive: true }]);
    if (url.pathname === "/api/admin/audit") return json([]);
    if (url.pathname === "/api/maintenance/backups/settings") return json({ enabled: true, intervalDays: 7, runAtLocalTime: "03:00", timeZoneId: "Europe/Sofia" });
    unexpectedRequests.push(`${method} ${url.pathname}`);
    throw new Error(`Unexpected mock API route: ${url.pathname}`);
  };

  const imported = await import(`${pathToFileURL(bundle).href}?scenario=${++scenario}`);
  const { act, StrictMode, createElement, createRoot, AdminPage, SeasonalZonesContext, TenantBrandingContext, CASA_BRANDING } = imported;
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const branding = { ...CASA_BRANDING, name: tenant === "cofein" ? "Cofein fixture" : "Casa fixture", logoUrl: "", phone: "+359000000000" };
  const zones = { closedAreas: [], loaded: true, error: "", reloadZones: async () => {}, updateZones: () => {} };
  const brandingContext = { branding, reloadBranding: async () => {} };
  const renderRole = async (nextRole) => act(async () => {
    root.render(createElement(StrictMode, null,
      createElement(TenantBrandingContext.Provider, { value: brandingContext },
        createElement(SeasonalZonesContext.Provider, { value: zones },
          createElement(AdminPage, { adminToken: "test-session", adminUser: { id: 1, name: "Fixture user", email: "fixture@example.test", role: nextRole }, onAdminLogout: () => {}, onMenuChanged: () => {}, onEventsChanged: () => {} })))));
    await tick(); await tick();
  });
  const flush = async () => act(async () => { await tick(); await tick(); });
  const click = async (element) => { assert.ok(element, "Missing control"); await act(async () => { element.click(); await tick(); await tick(); }); };
  const button = (label) => [...container.querySelectorAll("button")].find((element) => element.textContent.trim() === label || element.querySelector("span.block.truncate")?.textContent.trim() === label);
  const sectionButton = (label) => [...container.querySelectorAll('nav[aria-label] button')].find((element) => element.textContent.startsWith(label));
  const devNav = () => [...container.querySelectorAll('nav[aria-label]')].find((element) => /DEV/.test(element.getAttribute("aria-label")));
  const heading = (text) => [...container.querySelectorAll("h2,h3,h4")].find((element) => element.textContent.trim() === text);
  const apiCount = (route) => requests.filter((request) => request.path === route).length;
  const language = async (value) => { await click(button(value.toUpperCase())); await flush(); };
  try {
    await renderRole(role);
    await flush();
    await exercise({ container, window, requests, click, flush, button, sectionButton, devNav, heading, apiCount, language, renderRole });
    assert.deepEqual(unexpectedRequests, [], "The simulated navigation made an unexpected request");
    assert.deepEqual(runtimeErrors, [], "React reported a rendering or effect error");
    checks.push({ name, passed: true });
  } catch (error) {
    checks.push({ name, passed: false, error: error.message });
  } finally {
    await act(async () => root.unmount());
    await window.happyDOM.close();
    console.error = originalError;
  }
}

try {
  await test("Developer navigation groups service, access, branding, and maintenance inside DEV management", {}, async ({ container, button, click, language, sectionButton, devNav, heading, apiCount }) => {
    assert.ok(button("DEV управление"), "Developer must see the dedicated Bulgarian DEV entry");
    assert.equal(button("Админи"), undefined, "Developer must not retain a standalone Admins entry");
    assert.equal(button("Поддръжка"), undefined, "Developer must not retain a standalone Maintenance entry");
    await click(button("DEV управление"));
    assert.ok(devNav());
    assert.equal(devNav().querySelectorAll("button").length, 4);
    assert.ok(heading("SeatMap · Предварителни поръчки"));
    assert.ok(button("Върни Basic версия"), "The service section must expose the existing Pro/Basic controls");
    assert.ok(apiCount("/api/preorders/settings") > 0);

    await language("en");
    assert.ok(heading("DEV management"));
    assert.ok(sectionButton("Services & commission"));
    assert.ok(heading("SeatMap · Preorders"));
    assert.equal(button("Admins"), undefined);
    assert.equal(button("Maintenance"), undefined);
    assert.match(container.textContent, /Cofein fixture/);
    assert.match(container.textContent, /cofein/);
    assert.ok([...container.querySelectorAll("label")].some((label) => label.textContent.includes("Enabled by the platform")), "DEV preorders must render the Developer policy form");
    assert.equal([...container.querySelectorAll("label")].some((label) => label.textContent.includes("I want this restaurant to accept preorders")), false);

    await click(sectionButton("Access & history"));
    assert.equal(sectionButton("Access & history").getAttribute("aria-pressed"), "true");
    assert.ok(heading("Admins and audit"));
    assert.ok(apiCount("/api/admin/users") > 0);
    assert.ok(apiCount("/api/admin/audit") > 0);
    assert.match(container.textContent, /Fixture owner/);
    assert.equal(heading("SeatMap · Preorders"), undefined);

    await click(sectionButton("Restaurant & brand"));
    assert.ok(heading("Ресторант и бранд / Restaurant branding"));
    assert.ok([...container.querySelectorAll("input")].some((input) => input.value === "Cofein fixture"));
    assert.equal(heading("Admins and audit"), undefined);

    await click(sectionButton("Maintenance & data"));
    assert.ok(apiCount("/api/maintenance/backups") > 0);
    assert.ok(apiCount("/api/maintenance/backups/settings") > 0);
    assert.match(container.textContent, /Backups/);
    const clearButton = button("Clear reservations and orders");
    assert.ok(clearButton);
    assert.equal(clearButton.closest("details")?.open, false, "Operational clearing must stay collapsed until explicitly expanded");
    assert.match(clearButton.closest("details").textContent, /separate confirmation and a code/);

    await language("ru");
    assert.ok(heading("DEV управление"));
    assert.ok(sectionButton("Обслуживание и данные"));
    await click(container.querySelector("button.admin-profile-anchor"));
    assert.equal(devNav(), undefined);
    assert.equal(heading("SeatMap · Предзаказы"), undefined, "Developer policy settings must no longer appear in Profile");
    assert.equal(container.querySelector('input[type="month"]'), null);
  });

  await test("Owner retains standalone administration and maintenance plus consent in Profile", { role: "Owner" }, async ({ container, button, click, language, devNav, heading, apiCount }) => {
    assert.equal(button("DEV управление"), undefined);
    assert.ok(button("Админи"));
    assert.ok(button("Поддръжка"));
    await language("en");
    await click(button("Admins"));
    assert.ok(heading("Admins and audit"));
    assert.ok(apiCount("/api/admin/users") > 0);
    assert.equal(devNav(), undefined);
    assert.equal(button("Return to Basic version"), undefined);
    await click(button("← Back"));
    await click(button("Maintenance"));
    assert.ok(apiCount("/api/maintenance/backups") > 0);
    assert.equal(button("Clear reservations and orders"), undefined);
    await click(container.querySelector("button.admin-profile-anchor"));
    assert.ok(heading("SeatMap · Preorders"));
    assert.ok([...container.querySelectorAll("label")].some((label) => label.textContent.includes("I want this restaurant to accept preorders")));
    assert.equal([...container.querySelectorAll("label")].some((label) => label.textContent.includes("Enabled by the platform")), false);
  });

  await test("Casa DEV deep link uses Casa branding and tenant headers with Basic service controls", { tenant: "casa-di-fratelli", tier: "Basic", query: "?tab=dev" }, async ({ container, button, click, devNav, sectionButton, language, apiCount }) => {
    assert.ok(devNav(), "A Developer deep link must open the DEV section directly");
    assert.match(container.textContent, /Casa fixture/);
    assert.match(container.textContent, /casa-di-fratelli/);
    assert.doesNotMatch(container.textContent, /Cofein fixture/);
    assert.ok(button("Отключи Pro версия"));
    assert.ok(apiCount("/api/preorders/settings") > 0);
    await language("en");
    await click(sectionButton("Access & history"));
    assert.ok(apiCount("/api/admin/users") > 0);
    await click(sectionButton("Maintenance & data"));
    assert.ok(apiCount("/api/maintenance/backups") > 0);
    assert.equal(button("Clear reservations and orders").closest("details").open, false);
  });

  for (const role of ["Owner", "Administrator", "Waiter", "Kitchen", "Bar"]) {
    await test(`${role} cannot open DEV management through a direct ?tab=dev link`, { role, query: "?tab=dev" }, async ({ container, button, devNav, apiCount }) => {
      assert.equal(button("DEV управление"), undefined);
      assert.equal(devNav(), undefined);
      assert.equal(apiCount("/api/preorders/settings"), 0, "A forbidden deep link must not mount Developer settings");
      assert.equal(apiCount("/api/admin/users"), 0, "A forbidden deep link must not load Developer access controls");
      assert.equal(apiCount("/api/maintenance/backups"), 0, "A forbidden deep link must not mount maintenance tools");
      assert.equal(container.querySelector('input[type="month"]'), null);
      assert.ok(container.querySelector(".admin-page"), "The role must still have a usable administration screen");
    });
  }

  await test("Losing Developer access ejects an already open DEV section", { query: "?tab=dev" }, async ({ button, click, devNav, renderRole, flush, container }) => {
    if (!devNav()) await click(button("DEV управление"));
    assert.ok(devNav());
    await renderRole("Administrator");
    await flush();
    assert.equal(devNav(), undefined);
    assert.equal(button("DEV управление"), undefined);
    assert.equal(container.querySelector('input[type="month"]'), null);
    assert.ok(container.querySelector(".admin-page"));
  });

  const report = { simulatedDom: true, visualBrowserTest: false, realNetwork: false, passed: checks.every((check) => check.passed), checks };
  await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ passed: report.passed, checks: checks.length, report: reportFile }));
  if (!report.passed) { console.log(JSON.stringify(checks.filter((check) => !check.passed))); process.exitCode = 1; }
} finally {
  console.error = originalError;
  globalThis.fetch = originalFetch;
  await rm(temporary, { recursive: true, force: true });
}
// React's simulated-window scheduler retains MessagePorts after unmount.
process.exit(process.exitCode || 0);
