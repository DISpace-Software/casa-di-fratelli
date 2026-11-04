// UI integration checks using a simulated DOM, not a browser/visual test.
// Dependencies are supplied explicitly; nothing is installed into the application.
// node scripts/check-shared-admin-dom.mjs <happy-dom module> <esbuild module> <report.json>
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
const temporary = await mkdtemp(path.join(os.tmpdir(), "shared-admin-dom-"));
const bundle = path.join(temporary, "auth.mjs");
const checks = [];
const nativeFetch = globalThis.fetch;
const originalError = console.error;
const apiBase = "https://api.example.test";
let scenario = 0;

await build({
  stdin: { contents: `export {default as AdminApp} from './src/admin/AdminApp.jsx';
    export {default as TenantBrandingProvider} from './src/context/TenantBrandingProvider.jsx';
    export {apiFetch} from './src/config/api.js';
    export {act, StrictMode, createElement} from 'react';
    export {createRoot} from 'react-dom/client';`, resolveDir: path.join(repo, "frontend"), sourcefile: "auth-test-entry.jsx", loader: "jsx" },
  bundle: true, format: "esm", platform: "node", jsx: "automatic", outfile: bundle, logLevel: "silent",
  define: { "import.meta.env.VITE_SHARED_ADMIN": '"true"', "import.meta.env.VITE_API_BASE_URL": JSON.stringify(apiBase) },
  plugins: [{ name: "isolate-admin-shell", setup(builder) {
    builder.onResolve({ filter: /\/pages\/AdminPage$/ }, () => ({ path: "AdminPage", namespace: "test" }));
    builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ loader: "jsx", resolveDir: path.join(repo, "frontend"), contents: `import React from 'react';
      export default function AdminPage(props) { return <section data-testid="admin"><span data-testid="role">{props.adminUser.role}</span><span data-testid="name">{props.adminUser.name}</span><button onClick={props.onAdminLogout}>Test logout</button></section>; }` }));
  } }],
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

async function test(name, setup, exercise) {
  const window = new Window({ url: "https://admin.example.test/r/cofein/admin" });
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "Node", "Element", "Event", "CustomEvent", "MouseEvent", "KeyboardEvent"])
    Object.defineProperty(globalThis, key, { value: key === "window" ? window : key === "document" ? window.document : window[key], configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const requests = [];
  const runtimeErrors = [];
  console.error = (...args) => { runtimeErrors.push(args.map(String).join(" ")); };
  const context = { window, requests, handler: null, contextTenant: "cofein", branding: { name: "Cofein", logoUrl: "" } };
  setup?.(context);
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const headers = new Headers(options.headers);
    assert.equal(url.origin, apiBase);
    assert.equal(headers.get("X-Tenant-Id"), "cofein");
    assert.equal(options.redirect, "error");
    requests.push({ path: url.pathname, method: options.method || "GET" });
    if (url.pathname === "/api/branding") return json(context.branding);
    if (url.pathname === "/api/admin/context") return json({ tenantId: context.contextTenant, frontendUrl: "https://cofein.example.test", name: "Cofein", notificationsEnabled: false });
    const response = await context.handler?.(url.pathname, options);
    assert.ok(response, `Unexpected request: ${url.pathname}`);
    return response;
  };
  const imported = await import(`${pathToFileURL(bundle).href}?scenario=${++scenario}`);
  const { act, StrictMode, createElement, createRoot, AdminApp, TenantBrandingProvider } = imported;
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const flush = async () => act(async () => { await tick(); await tick(); });
  const click = async (element) => { assert.ok(element, "Missing button"); await act(async () => { element.click(); await tick(); }); };
  const input = async (element, value) => { assert.ok(element, "Missing input"); await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(element, value);
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
    element.dispatchEvent(new window.Event("change", { bubbles: true }));
    await tick();
  }); };
  const submit = async () => { await act(async () => {
    container.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await tick();
  }); };
  try {
    await act(async () => { root.render(createElement(StrictMode, null, createElement(TenantBrandingProvider, null, createElement(AdminApp)))); await tick(); });
    await flush();
    await exercise({ ...context, ...imported, container, flush, click, input, submit });
    assert.deepEqual(runtimeErrors, [], "React reported a render/effect error");
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
  await test("Cofein login ignores legacy and other restaurant credentials", ({ window }) => {
    window.sessionStorage.setItem("admin-token", "legacy-casa");
    window.sessionStorage.setItem("seatmap:casa-di-fratelli:admin-token", "other-restaurant");
  }, ({ container, requests }) => {
    assert.match(container.textContent, /Cofein Admin OS/);
    assert.ok(container.querySelector("form"));
    assert.equal(container.querySelector('input[type="email"]').value, "");
    assert.equal(requests.some((request) => request.path === "/api/admin/me"), false);
  });

  await test("Unverified tenant identity never exposes the login form", (context) => { context.contextTenant = "casa-di-fratelli"; }, ({ container }) => {
    assert.equal(container.querySelector("form"), null);
    assert.match(container.textContent, /Не успяхме да заредим ресторанта/);
  });

  await test("Restored session waits for /me and uses server role, then logout preserves the other tenant", (context) => {
    context.window.sessionStorage.setItem("seatmap:cofein:admin-token", "restored");
    context.window.sessionStorage.setItem("seatmap:cofein:admin-user", JSON.stringify({ id: 1, name: "Forged cached user", role: "Developer" }));
    context.window.sessionStorage.setItem("seatmap:casa-di-fratelli:admin-token", "casa-existing");
    context.me = deferred();
    context.handler = (url) => url === "/api/admin/me" ? context.me.promise.then((payload) => json(payload)) : null;
  }, async ({ container, me, flush, act, click, window }) => {
    assert.equal(container.querySelector('[data-testid="admin"]'), null);
    await act(async () => { me.resolve({ id: 1, name: "Actual owner", role: "Owner" }); await tick(); });
    await flush();
    assert.equal(container.querySelector('[data-testid="role"]').textContent, "Owner");
    assert.equal(container.querySelector('[data-testid="name"]').textContent, "Actual owner");
    await click(container.querySelector('[data-testid="admin"] button'));
    assert.ok(container.querySelector("form"));
    assert.equal(window.sessionStorage.getItem("seatmap:cofein:admin-token"), null);
    assert.equal(window.sessionStorage.getItem("seatmap:cofein:admin-user"), null);
    assert.equal(window.sessionStorage.getItem("seatmap:casa-di-fratelli:admin-token"), "casa-existing");
  });

  await test("Expired saved session is cleared and returns the same login form", (context) => {
    context.window.sessionStorage.setItem("seatmap:cofein:admin-token", "expired");
    context.window.sessionStorage.setItem("seatmap:cofein:admin-user", JSON.stringify({ id: 1, role: "Owner" }));
    context.handler = (url) => url === "/api/admin/me" ? json({}, 401) : null;
  }, ({ container, window }) => {
    assert.ok(container.querySelector("form"));
    assert.equal(window.sessionStorage.getItem("seatmap:cofein:admin-token"), null);
    assert.equal(window.sessionStorage.getItem("seatmap:cofein:admin-user"), null);
  });

  await test("Unavailable session endpoint does not trust cached role or delete credentials", (context) => {
    context.window.sessionStorage.setItem("seatmap:cofein:admin-token", "network-retry");
    context.window.sessionStorage.setItem("seatmap:cofein:admin-user", JSON.stringify({ id: 1, role: "Developer" }));
    context.handler = (url) => url === "/api/admin/me" ? Promise.reject(new Error("Disconnected")) : null;
  }, ({ container, window }) => {
    assert.equal(container.querySelector('[data-testid="admin"]'), null);
    assert.equal(container.querySelector("form"), null);
    assert.match(container.textContent, /Не успяхме да проверим сесията/);
    assert.equal(window.sessionStorage.getItem("seatmap:cofein:admin-token"), "network-retry");
  });

  await test("Late401 from previous login cannot clear a newly authenticated session", (context) => {
    context.oldRequest = deferred();
    context.handler = (url, options) => {
      if (url === "/api/admin/login") {
        const payload = JSON.parse(options.body);
        assert.equal(payload.email, "owner@example.test");
        assert.equal(payload.password, "local-test-password");
        return json({ token: "new-session", user: { id: 1, name: "New login", role: "Owner" } });
      }
      if (url === "/api/reservations") return context.oldRequest.promise;
      return null;
    };
  }, async ({ container, window, apiFetch, oldRequest, input, submit, act, flush }) => {
    const oldResponse = apiFetch(`${apiBase}/api/reservations`, { headers: { "X-Admin-Token": "previous-session" } });
    await input(container.querySelector('input[type="email"]'), "owner@example.test");
    await input(container.querySelector('input[type="password"]'), "local-test-password");
    await submit();
    await flush();
    assert.equal(container.querySelector('[data-testid="name"]').textContent, "New login");
    await act(async () => { oldRequest.resolve(json({}, 401)); await oldResponse; await tick(); });
    assert.equal(window.sessionStorage.getItem("seatmap:cofein:admin-token"), "new-session");
    assert.ok(container.querySelector('[data-testid="admin"]'));
    await act(async () => { window.dispatchEvent(new window.CustomEvent("seatmap:session-expired", { detail: { token: "new-session" } })); await tick(); });
    assert.equal(window.sessionStorage.getItem("seatmap:cofein:admin-token"), null);
    assert.ok(container.querySelector("form"));
  });

  const report = { simulatedDom: true, visualBrowserTest: false, passed: checks.every((check) => check.passed), checks };
  await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ passed: report.passed, checks: checks.length, report: reportFile }));
  if (!report.passed) { console.log(JSON.stringify(checks.filter((check) => !check.passed))); process.exitCode = 1; }
} finally {
  globalThis.fetch = nativeFetch;
  console.error = originalError;
  await rm(temporary, { recursive: true, force: true });
}
// React's simulated-window scheduler retains MessagePorts after unmount.
process.exit(process.exitCode || 0);
