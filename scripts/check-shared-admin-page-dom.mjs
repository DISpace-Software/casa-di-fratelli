// Full existing AdminPage integration in a simulated DOM against disposable local
// API fixtures. This verifies runtime/data wiring, not browser layout/screenshots.
// node scripts/check-shared-admin-page-dom.mjs <happy-dom> <esbuild> <state.json> <report.json>
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const [happyDomModule, esbuildModule, stateFile, reportFile] = process.argv.slice(2);
const { Window } = await import(pathToFileURL(path.resolve(happyDomModule)).href);
const { build } = await import(pathToFileURL(path.resolve(esbuildModule)).href);
const state = JSON.parse(await readFile(stateFile, "utf8"));
assert.equal(state.localOnly, true);
assert.ok(["localhost", "127.0.0.1"].includes(new URL(state.apiUrl).hostname));
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(path.join(os.tmpdir(), "shared-admin-page-dom-"));
const bundle = path.join(temporary, "page.mjs");
const baselineBundle = path.join(temporary, "baseline.mjs");
const nativeFetch = globalThis.fetch;
const originalError = console.error;
const checks = [];
let baselineHeader;
async function compile(source, output) { await build({
  stdin: { contents: `export {default as AdminPage} from './src/pages/AdminPage.jsx';
    export {default as TenantBrandingProvider} from './src/context/TenantBrandingProvider.jsx';
    export {default as SeasonalZonesProvider} from './src/context/SeasonalZonesProvider.jsx';
    export {act, StrictMode, createElement} from 'react';
    export {createRoot} from 'react-dom/client';`, resolveDir: path.join(source, "frontend"), sourcefile: "page-test-entry.jsx", loader: "jsx" },
  nodePaths: [path.join(repo, "frontend/node_modules")], bundle: true, format: "esm", platform: "node", jsx: "automatic", outfile: output, logLevel: "silent",
  define: { "import.meta.env.VITE_SHARED_ADMIN": '"true"', "import.meta.env.VITE_API_BASE_URL": JSON.stringify(state.apiUrl) },
}); }
await compile(repo, bundle);
await compile("/tmp/cofein-backend-release-20261103", baselineBundle);
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
const json = value => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });

async function scenario(tenantId, baseline = false) {
  const window = new Window({ url: `${state.origin}/r/${tenantId}/admin` });
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "HTMLTextAreaElement", "Node", "Element", "Event", "CustomEvent", "MouseEvent", "KeyboardEvent", "ResizeObserver"])
    Object.defineProperty(globalThis, key, { value: key === "window" ? window : key === "document" ? window.document : window[key], configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let permissionRequests = 0, notifications = 0, registrations = 0, pending = 0;
  class Notification { static permission = "default"; static async requestPermission() { permissionRequests++; return "granted"; } constructor() { notifications++; } }
  Object.defineProperty(window, "Notification", { value: Notification, configurable: true });
  Object.defineProperty(globalThis, "Notification", { value: Notification, configurable: true });
  Object.defineProperty(window, "PushManager", { value: class {}, configurable: true });
  Object.defineProperty(window.navigator, "serviceWorker", { value: { async getRegistration() { return null; }, async register() { registrations++; throw new Error("Unexpected worker registration"); } }, configurable: true });
  const runtimeErrors = [];
  const requests = [];
  console.error = (...args) => runtimeErrors.push(args.map(String).join(" "));
  const expected = {};
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const headers = new Headers(options.headers);
    assert.equal(url.origin, state.apiUrl);
    if (baseline) headers.set("X-Tenant-Id", tenantId);
    else assert.equal(headers.get("X-Tenant-Id"), tenantId);
    assert.equal(options.method || "GET", "GET", "This DOM verification never writes fixture data");
    headers.set("Origin", state.origin);
    requests.push(url.pathname);
    pending++;
    try {
      const response = await nativeFetch(url, { ...options, headers });
      assert.ok(response.ok, `${tenantId} ${url.pathname}: HTTP ${response.status}`);
      if (["/api/floor-plan", "/api/menu", "/api/branding", "/api/admin/context"].includes(url.pathname)) {
        const value = await response.json();
        expected[url.pathname] = value;
        if (url.pathname === "/api/menu" && value[0]) value[0] = { ...value[0], imageUrl: "/local-dom-preview.jpg" };
        return json(value);
      }
      return response;
    } finally { pending--; }
  };
  const { act, StrictMode, createElement, createRoot, AdminPage, TenantBrandingProvider, SeasonalZonesProvider } = await import(`${pathToFileURL(baseline ? baselineBundle : bundle).href}?tenant=${tenantId}`);
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const settle = async () => {
    for (let i = 0; i < 100; i++) {
      await act(async () => { await tick(15); });
      if (!pending && !container.querySelector('[aria-busy="true"]')) { await act(async () => { await tick(15); }); if (!pending) return; }
    }
    throw new Error("UI did not settle");
  };
  const click = async element => { assert.ok(element, "Required control missing"); await act(async () => { element.click(); await tick(); }); await settle(); };
  const button = label => [...container.querySelectorAll("button")].find(element => element.textContent.trim() === label || [...element.querySelectorAll("span, div")].some(span => span.textContent.trim() === label));
  const tab = async label => {
    if (!container.querySelector(".admin-hero-title")) await click(button("← Назад"));
    await click(button(label));
  };
  try {
    const auth = state.tenants[tenantId].auth;
    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(TenantBrandingProvider, null,
        createElement(SeasonalZonesProvider, null, createElement(AdminPage, { adminToken: auth.token, adminUser: auth.user,
          onAdminLogout() {}, onMenuChanged() {}, onEventsChanged() {}, theme: "dark", onToggleTheme() {} })))));
      await tick();
    });
    await settle();
    assert.match(container.textContent, new RegExp(`${expected["/api/branding"].name} Admin OS`));
    assert.equal(container.querySelector(".admin-hero-title").textContent, "Restaurant CRM");
    const header = {
      classes: [".admin-page", ".admin-hero-panel", ".admin-hero-title", ".admin-header-controls"].map(selector => container.querySelector(selector).className),
      controls: [...container.querySelectorAll(".admin-hero-panel button")].map(button => ({ className: button.className, text: button.textContent.trim(), label: button.getAttribute("aria-label") })),
      navigation: [...container.querySelectorAll("section button")].filter(button => button.querySelector("span.block.truncate")).map(button => ({ className: button.className, text: button.textContent.trim() })),
    };
    if (baselineHeader) assert.deepEqual(header, baselineHeader, "Casa and Cofein must use identical dashboard shell classes");
    else baselineHeader = header;
    if (baseline) { checks.push({ name: "Published 7a80d4f Casa dashboard/header/navigation captured from actual component", passed: true }); return; }
    checks.push({ name: `${tenantId}: same existing dashboard/header and all management sections`, passed: true });

    await tab("Карта");
    const plan = expected["/api/floor-plan"];
    const tableIds = new Set();
    for (const zone of plan.zones) {
      await click(button(zone.names?.bg || zone.name));
      for (const table of plan.tables.filter(item => item.area === zone.id)) {
        assert.ok([...container.querySelectorAll("button")].some(element => element.textContent.trim() === table.id), `Missing ${zone.id}/${table.id}`);
        tableIds.add(table.id);
      }
    }
    assert.equal(tableIds.size, plan.tables.length);
    if (tenantId === "cofein") {
      assert.equal(tableIds.size, 30);
      assert.equal(plan.tables.reduce((total, table) => total + table.seats, 0), 150);
      assert.deepEqual(plan.combinations, []);
      assert.equal(container.textContent.includes("Зала / Непушачи"), false);
    }
    checks.push({ name: `${tenantId}: actual plan zones/tables and capacity loaded into unchanged editor`, passed: true, tableCount: tableIds.size });

    await tab("Меню");
    assert.ok(expected["/api/menu"].length > 0);
    const imageItem = expected["/api/menu"][0];
    if (imageItem.department === "Bar") await click(button("Напитки"));
    const sourceGroups = tenantId === "cofein" ? JSON.parse(await readFile("/Users/macbookpro/casa-di-fratelli/frontend/src/cofein/data/menu-food.json", "utf8")).concat(JSON.parse(await readFile("/Users/macbookpro/casa-di-fratelli/frontend/src/cofein/data/menu-drinks.json", "utf8"))) : [];
    await click(button(sourceGroups.find(group => group.id === imageItem.category)?.label || imageItem.category));
    const preview = [...container.querySelectorAll("img")].find(image => image.getAttribute("src")?.includes("local-dom-preview.jpg"));
    const imageBase = expected["/api/admin/context"].frontendUrl;
    assert.equal(preview?.src, new URL("/local-dom-preview.jpg", imageBase).href);
    const card = preview.closest(".rounded-3xl");
    await click([...card.querySelectorAll("button")].find(element => element.textContent.trim() === "Редакция"));
    assert.ok([...container.querySelectorAll("input")].some(input => input.value === "/local-dom-preview.jpg"), "Editing preserves the original relative image value");
    assert.ok([...container.querySelectorAll("img")].some(image => image.src === new URL("/local-dom-preview.jpg", imageBase).href), "Edit preview resolves at restaurant origin");
    await click(button("Назад към списъка"));
    checks.push({ name: `${tenantId}: relative restaurant photos resolve correctly and edit values stay unchanged`, passed: true });
    if (tenantId === "cofein") {
      if (imageItem.department === "Bar") await click(button("Кухня"));
      assert.equal(expected["/api/menu"].length, 290);
      assert.match(container.textContent, /Пици/);
      assert.match(container.textContent, /Разядки/);
      assert.equal(container.textContent.includes("BBQ Josper"), false);
      await click(button("Добави ястие"));
      assert.ok(button("Салати").className.includes("bg-[#c9a56a]/15"), "Cofein starts in its salads category");
    }
    checks.push({ name: `${tenantId}: real tenant menu/categories render; Cofein defaults to salads`, passed: true });

    for (const label of ["Резервации", "Поръчки", "Блокирай зала", "Клиенти", "Отчети", "Склад", "Събития", "Маркетинг", "Обратна връзка", "Админи", "Поддръжка"]) {
      await tab(label);
      assert.ok(container.querySelector(".admin-page"), `Failed ${label}`);
      assert.equal(container.querySelector('[role="alert"]')?.textContent || "", "", `Unexpected alert in ${label}`);
    }
    checks.push({ name: `${tenantId}: all existing admin tabs mount and load local API data`, passed: true });

    await tab("Карта на резервациите");
    assert.ok(window.document.querySelector('[data-admin-reservation-map-shell="true"]'));
    checks.push({ name: `${tenantId}: operational reservation map mounts with full plan context`, passed: true });
    if (tenantId === "cofein") {
      await click(container.querySelector('[aria-label="Моят профил"]'));
      await click(button("Включи известия"));
      assert.match(container.textContent, /Известията са изключени/);
      assert.equal(permissionRequests, 0);
      assert.equal(notifications, 0);
      assert.equal(registrations, 0);
      checks.push({ name: "Cofein: disabled notifications never request native permission or register a worker", passed: true });
    }
    assert.deepEqual(runtimeErrors, [], "React reported a render/effect error");
    assert.ok(requests.every(request => request.startsWith("/api/")));
  } catch (error) {
    checks.push({ name: `${tenantId}: full AdminPage integration`, passed: false, error: error.message, runtimeErrors });
  } finally {
    await act(async () => root.unmount());
    window.happyDOM.abort();
    console.error = originalError;
  }
}
try {
  await scenario("casa-di-fratelli", true);
  await scenario("casa-di-fratelli");
  await scenario("cofein");
  const report = { simulatedDom: true, visualBrowserTest: false, localApiOnly: true, databaseWrites: false, passed: checks.every(check => check.passed), checks };
  await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ passed: report.passed, checks: checks.length, report: reportFile }));
  if (!report.passed) { console.log(JSON.stringify(checks.filter(check => !check.passed))); process.exitCode = 1; }
} finally {
  globalThis.fetch = nativeFetch;
  console.error = originalError;
  await rm(temporary, { recursive: true, force: true });
}

// React/DOM emulation can retain MessagePorts; this standalone check is done.
process.exit(process.exitCode || 0);
