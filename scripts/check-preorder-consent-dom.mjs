// Isolated React integration checks using a simulated DOM, not a browser/visual test.
// Dependencies are supplied explicitly; nothing is installed into the application.
// node scripts/check-preorder-consent-dom.mjs <happy-dom module> <esbuild module> <report.json>
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
const temporary = await mkdtemp(path.join(os.tmpdir(), "preorder-consent-dom-"));
const bundle = path.join(temporary, "preorders.mjs");
const apiBase = "https://api.example.test";
const checks = [];
const originalError = console.error;
let scenario = 0;

await build({
  stdin: {
    contents: `export {default as PreorderSettings} from './src/components/admin/PreorderSettings.jsx';
      export {act, StrictMode, createElement} from 'react';
      export {createRoot} from 'react-dom/client';`,
    resolveDir: path.join(repo, "frontend"), sourcefile: "preorders-test-entry.jsx", loader: "jsx",
  },
  bundle: true, format: "esm", platform: "node", jsx: "automatic", outfile: bundle, logLevel: "silent",
  define: { "import.meta.env.VITE_SHARED_ADMIN": '"true"', "import.meta.env.VITE_API_BASE_URL": JSON.stringify(apiBase) },
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const settings = (commissionBasisPoints, termsVersion, optedIn = false, consentNeedsRenewal = false) => ({
  platform: { enabled: true, commissionBasisPoints },
  restaurant: { optedIn, acceptedCommissionBasisPoints: optedIn ? commissionBasisPoints : null },
  termsVersion,
  consentNeedsRenewal,
  cardPaymentsAvailable: false,
  fullPrepaymentRequired: true,
  currency: "EUR",
  settlement: "Monthly",
});

async function test(name, setup, exercise) {
  const window = new Window({ url: "https://admin.example.test/r/cofein/admin" });
  for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "Node", "Element", "Event", "CustomEvent", "MouseEvent", "KeyboardEvent"])
    Object.defineProperty(globalThis, key, { value: key === "window" ? window : key === "document" ? window.document : window[key], configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const runtimeErrors = [];
  const requests = [];
  console.error = (...args) => { runtimeErrors.push(args.map(String).join(" ")); };
  const context = { window, requests, role: "Owner", language: "en", handler: null };
  setup(context);
  const adminFetch = async (input, options = {}) => {
    const url = new URL(input);
    assert.equal(url.origin, apiBase);
    const request = { path: url.pathname, search: url.search, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : null };
    requests.push(request);
    const response = await context.handler(request);
    assert.ok(response, `Unexpected request: ${request.method} ${url.pathname}${url.search}`);
    return response;
  };
  const imported = await import(`${pathToFileURL(bundle).href}?scenario=${++scenario}`);
  const { act, StrictMode, createElement, createRoot, PreorderSettings } = imported;
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const flush = async () => act(async () => { await tick(); await tick(); });
  const click = async (element) => { assert.ok(element, "Missing control"); await act(async () => { element.click(); await tick(); }); };
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
  const checkbox = (label) => [...container.querySelectorAll("label")].find((element) => element.textContent.includes(label))?.querySelector('input[type="checkbox"]');
  const saveButton = () => container.querySelector("form button");
  const consentRequests = () => requests.filter((request) => request.method === "PUT" && request.path === "/api/preorders/consent");
  try {
    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(PreorderSettings, { adminFetch, role: context.role, language: context.language })));
      await tick();
    });
    await flush();
    await exercise({ ...context, ...imported, container, flush, click, input, submit, checkbox, saveButton, consentRequests });
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
  await test("Developer activation alone makes preorders available after saving, with no owner acceptance request", (context) => {
    context.role = "Developer";
    context.saved = deferred();
    context.handler = (request) => {
      if (request.path === "/api/preorders/settings") return json({ ...settings(1000, "old-terms"), platform: { enabled: false, commissionBasisPoints: 1000 } });
      if (request.path === "/api/preorders/platform" && request.method === "PUT") return context.saved.promise;
      return null;
    };
  }, async ({ container, click, checkbox, submit, saveButton, requests, saved, act, flush }) => {
    assert.ok(container.querySelector('[data-preorder-status="disabled"]'));
    assert.equal(checkbox("I accept full prepayment"), undefined);
    await click(checkbox("Enabled by the platform"));
    assert.ok(container.querySelector('[data-preorder-status="disabled"]'), "Unsaved activation must not claim availability");
    assert.equal(requests.some((request) => request.method === "PUT"), false);
    await submit();
    assert.equal(saveButton().disabled, true);
    assert.equal(checkbox("Enabled by the platform").disabled, true);
    assert.equal(container.querySelector('input[type="number"]').disabled, true);
    assert.ok(container.querySelector('[data-preorder-status="disabled"]'), "Pending saves must retain the server state");
    await act(async () => { saved.resolve(json(settings(1000, "old-terms", false))); await tick(); });
    await flush();
    const status = container.querySelector('[data-preorder-status="available"]');
    assert.ok(status, "Developer activation must work when the historical owner optedIn field is false");
    assert.match(status.textContent, /Unpaid drafts only.*card payment is unavailable/);
    assert.match(status.textContent, /After a new reservation/);
    assert.equal(container.querySelector('[role="status"]').textContent, "Saved");
    assert.deepEqual(requests.filter((request) => request.method === "PUT").map(({ path, body }) => ({ path, body })), [{
      path: "/api/preorders/platform", body: { enabled: true, commissionBasisPoints: 1000 },
    }]);
  });

  await test("Changing the agreed commission keeps availability independent of historical consent and terms", (context) => {
    context.role = "Developer";
    context.handler = (request) => {
      if (request.path === "/api/preorders/settings") return json(settings(1000, "old-terms", true, true));
      if (request.path === "/api/preorders/platform" && request.method === "PUT") return json({
        ...settings(1800, "new-terms", true, true), restaurant: { optedIn: true, acceptedCommissionBasisPoints: 1000, version: "old-terms" },
      });
      return null;
    };
  }, async ({ container, requests, input, submit, flush }) => {
    assert.ok(container.querySelector('[data-preorder-status="available"]'), "Historical renewal flags must not disable availability");
    await input(container.querySelector('input[type="number"]'), "18");
    assert.ok(container.querySelector('[data-preorder-status="available"]'));
    await submit();
    await flush();
    assert.equal(container.querySelector('input[type="number"]').value, "18");
    assert.ok(container.querySelector('[data-preorder-status="available"]'));
    assert.doesNotMatch(container.textContent, /waiting for owner|consent must be renewed|owner must accept/i);
    assert.deepEqual(requests.filter((request) => request.method === "PUT").map(({ path, body }) => ({ path, body })), [{
      path: "/api/preorders/platform", body: { enabled: true, commissionBasisPoints: 1800 },
    }]);
  });

  await test("Developer disabling hides preorders only after the saved response", (context) => {
    context.role = "Developer";
    context.handler = (request) => {
      if (request.path === "/api/preorders/settings") return json(settings(1000, "preorders-v1", true));
      if (request.path === "/api/preorders/platform") return json({ ...settings(1000, "preorders-v1", true), platform: { enabled: false, commissionBasisPoints: 1000 } });
      return null;
    };
  }, async ({ container, click, checkbox, submit, requests, flush }) => {
    await click(checkbox("Enabled by the platform"));
    assert.ok(container.querySelector('[data-preorder-status="available"]'));
    await submit();
    await flush();
    assert.match(container.querySelector('[data-preorder-status="disabled"]').textContent, /Guests do not see the preorder offer/);
    assert.equal(requests.find((request) => request.method === "PUT").body.enabled, false);
    assert.equal(requests.some((request) => request.path === "/api/preorders/consent"), false);
  });

  await test("A failed activation save keeps the effective status disabled", (context) => {
    context.role = "Developer";
    context.handler = (request) => {
      if (request.path === "/api/preorders/settings") return json({ ...settings(1000, "preorders-v1"), platform: { enabled: false, commissionBasisPoints: 1000 } });
      if (request.path === "/api/preorders/platform") return json({ message: "Unavailable" }, 503);
      return null;
    };
  }, async ({ container, click, checkbox, submit, flush }) => {
    await click(checkbox("Enabled by the platform"));
    await submit();
    await flush();
    assert.ok(container.querySelector('[data-preorder-status="disabled"]'));
    assert.match(container.querySelector('[role="status"]').textContent, /Settings were not saved/);
  });

  await test("Owner sees active status and the agreed fee without activation or acceptance controls", (context) => {
    context.handler = (request) => request.path === "/api/preorders/settings" ? json(settings(1000, "old-terms", false, true)) : null;
  }, async ({ container, requests, saveButton }) => {
    assert.ok(container.querySelector('[data-preorder-status="available"]'));
    assert.match(container.textContent, /Agreed commission \(%\): 10%/);
    assert.match(container.textContent, /No additional confirmation is required/);
    assert.equal(container.querySelector("form"), null);
    assert.equal(container.querySelector('input[type="checkbox"]'), null);
    assert.equal(container.querySelector('input[type="number"]'), null);
    assert.equal(saveButton(), null);
    assert.ok(container.querySelector('input[type="month"]'));
    assert.equal(requests.some((request) => request.method !== "GET"), false);
  });

  await test("Owner monthly reports stay read-only and lock the selected month while loading", (context) => {
    context.report = deferred();
    context.handler = (request) => {
      if (request.path === "/api/preorders/settings") return json(settings(1250, "preorders-v1"));
      if (request.path === "/api/preorders/settlements") return context.report.promise;
      return null;
    };
  }, async ({ container, requests, report, input, click, act, flush }) => {
    const monthInput = container.querySelector('input[type="month"]');
    await input(monthInput, "2026-10");
    const reportButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Monthly report");
    await click(reportButton);
    assert.equal(monthInput.disabled, true);
    assert.equal(reportButton.disabled, true);
    assert.deepEqual(requests.filter((request) => request.path === "/api/preorders/settlements").map((request) => request.search), ["?month=2026-10"]);
    await click(reportButton);
    assert.equal(requests.filter((request) => request.path === "/api/preorders/settlements").length, 1);
    await act(async () => { report.resolve(json({ grossMinor: 12000, commissionMinor: 1500, restaurantNetMinor: 10500, payments: 2 })); await tick(); });
    await flush();
    assert.equal(monthInput.disabled, false);
    assert.match(container.textContent, /120\.00 €/);
    assert.match(container.textContent, /15\.00 €/);
    assert.match(container.textContent, /105\.00 €/);
    assert.match(container.textContent, /2 confirmed payments/);
    await input(monthInput, "2026-11");
    assert.doesNotMatch(container.textContent, /120\.00 €/);
    assert.equal(requests.some((request) => request.method !== "GET"), false, "Owner report browsing must never submit settings or consent");
  });

  await test("Owner disabled status directs configuration to DEV management without an owner confirmation step", (context) => {
    context.handler = (request) => request.path === "/api/preorders/settings"
      ? json({ ...settings(1000, "preorders-v1", true), platform: { enabled: false, commissionBasisPoints: 1000 } }) : null;
  }, async ({ container, requests }) => {
    assert.match(container.querySelector('[data-preorder-status="disabled"]').textContent, /DEV management → Services & commission/);
    assert.equal(container.querySelector("form"), null);
    assert.equal(container.querySelector('input[type="checkbox"]'), null);
    assert.equal(requests.some((request) => request.method !== "GET"), false);
  });

  for (const [language, title, readonly] of [
    ["bg", "Достъпно в приложението", "Не е нужно допълнително потвърждение."],
    ["ru", "Доступно в приложении", "Дополнительное подтверждение не требуется."],
  ]) {
    await test(`${language} owner status is active without historical acceptance and explains read-only management`, (context) => {
      context.language = language;
      context.handler = (request) => request.path === "/api/preorders/settings" ? json(settings(1000, "old-terms", false, true)) : null;
    }, async ({ container, requests }) => {
      const status = container.querySelector('[data-preorder-status="available"]');
      assert.equal(status.querySelector("h4").textContent, title);
      assert.ok(container.textContent.includes(readonly));
      assert.ok(container.textContent.includes("10%"));
      assert.equal(container.querySelector('input[type="checkbox"]'), null);
      assert.equal(requests.some((request) => request.method !== "GET"), false);
    });
  }

  const report = { simulatedDom: true, visualBrowserTest: false, passed: checks.every((check) => check.passed), checks };
  await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ passed: report.passed, checks: checks.length, report: reportFile }));
  if (!report.passed) { console.log(JSON.stringify(checks.filter((check) => !check.passed))); process.exitCode = 1; }
} finally {
  console.error = originalError;
  await rm(temporary, { recursive: true, force: true });
}
// React's simulated-window scheduler retains MessagePorts after unmount.
process.exit(process.exitCode || 0);
