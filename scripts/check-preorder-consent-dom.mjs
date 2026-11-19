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
  const context = { window, requests, role: "Owner", handler: null };
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
      root.render(createElement(StrictMode, null, createElement(PreorderSettings, { adminFetch, role: context.role, language: "en" })));
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
  await test("A changed commission invalidates owner acceptance and requires explicit acceptance of the refreshed terms", (context) => {
    context.current = settings(1250, "preorders-v1");
    context.refresh = deferred();
    context.changed = false;
    context.puts = 0;
    context.handler = (request) => {
      if (request.path === "/api/preorders/settings") return context.changed ? context.refresh.promise : json(context.current);
      if (request.path === "/api/preorders/consent" && request.method === "PUT") {
        context.puts += 1;
        if (context.puts === 1) {
          context.changed = true;
          return json({ code: "PREORDER_TERMS_CHANGED", message: "Please review the current terms." }, 409);
        }
        return json(settings(1750, "preorders-v2", true));
      }
      return null;
    };
  }, async ({ container, click, checkbox, saveButton, consentRequests, requests, refresh, act, flush }) => {
    assert.match(container.textContent, /Agreed commission \(%\): 12\.5%/);
    await click(checkbox("I want this restaurant"));
    assert.equal(saveButton().disabled, true, "Opting in alone must not authorize the terms");
    await click(checkbox("I accept full prepayment"));
    assert.equal(saveButton().disabled, false);
    await click(saveButton());
    assert.deepEqual(consentRequests().map((request) => request.body), [{
      optedIn: true,
      acceptFullPrepaymentAndMonthlySettlement: true,
      expectedCommissionBasisPoints: 1250,
      expectedTermsVersion: "preorders-v1",
    }], "The first request must bind consent to the terms the owner actually saw");
    assert.ok(requests.filter((request) => request.path === "/api/preorders/settings").length >= 3, "A stale response must trigger a fresh settings request after StrictMode's initial loads");
    assert.equal(saveButton().disabled, true, "Saving must remain blocked during the terms refresh");
    assert.equal(container.querySelector('input[type="month"]').disabled, true);
    await click(saveButton());
    assert.equal(consentRequests().length, 1, "The stale consent must never be silently resubmitted");

    await act(async () => { refresh.resolve(json(settings(1750, "preorders-v2", true, true))); await tick(); });
    await flush();
    assert.match(container.textContent, /Agreed commission \(%\): 17\.5%/);
    assert.equal(checkbox("I accept full prepayment").checked, false, "Accepting the old terms does not accept the replacement terms");
    assert.equal(saveButton().disabled, true);
    assert.match(container.textContent, /(?:commission|terms).*changed|(?:new|updated) terms/i);
    await click(saveButton());
    assert.equal(consentRequests().length, 1, "Refreshed settings still require the owner's new checkbox action");

    await click(checkbox("I accept full prepayment"));
    await click(saveButton());
    await flush();
    assert.deepEqual(consentRequests().map((request) => request.body.expectedCommissionBasisPoints), [1250, 1750]);
    assert.deepEqual(consentRequests().map((request) => request.body.expectedTermsVersion), ["preorders-v1", "preorders-v2"]);
    assert.equal(consentRequests()[1].body.acceptFullPrepaymentAndMonthlySettlement, true);
    assert.equal(container.querySelector('[role="status"]').textContent, "Saved");
    assert.equal(checkbox("I accept full prepayment").checked, false);
  });

  await test("A pending monthly report locks the selected month and settings until the response arrives", (context) => {
    context.report = deferred();
    context.handler = (request) => {
      if (request.path === "/api/preorders/settings") return json(settings(1250, "preorders-v1"));
      if (request.path === "/api/preorders/settlements") return context.report.promise;
      return null;
    };
  }, async ({ container, requests, report, input, click, saveButton, checkbox, act, flush }) => {
    const monthInput = container.querySelector('input[type="month"]');
    await input(monthInput, "2026-10");
    const reportButton = [...container.querySelectorAll("button")].find((button) => button.textContent === "Monthly report");
    await click(reportButton);
    assert.equal(monthInput.disabled, true, "Month must remain fixed while its report is loading");
    assert.equal(reportButton.disabled, true);
    assert.equal(saveButton().disabled, true);
    assert.equal(checkbox("I want this restaurant").disabled, true);
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
    assert.doesNotMatch(container.textContent, /120\.00 €/,
      "Changing the month must clear the previous month's totals");
  });

  await test("Developer changes update the platform policy without submitting owner acceptance", (context) => {
    context.role = "Developer";
    context.handler = (request) => {
      if (request.path === "/api/preorders/settings") return json(settings(1250, "preorders-v1"));
      if (request.path === "/api/preorders/platform" && request.method === "PUT") return json(settings(1800, "preorders-v1"));
      return null;
    };
  }, async ({ container, requests, input, submit, saveButton, checkbox, flush }) => {
    assert.equal(checkbox("I accept full prepayment"), undefined);
    await input(container.querySelector('input[type="number"]'), "18");
    assert.equal(container.querySelector('input[type="number"]').value, "18");
    assert.equal(saveButton().disabled, false);
    // happy-dom's decimal-step validity uses floating-point modulo; submit the
    // form event directly to exercise React's payload without testing that shim.
    await submit();
    await flush();
    const writes = requests.filter((request) => request.method === "PUT");
    assert.deepEqual(writes.map((request) => ({ path: request.path, body: request.body })), [{
      path: "/api/preorders/platform",
      body: { enabled: true, commissionBasisPoints: 1800 },
    }]);
    assert.equal(container.querySelector('[role="status"]').textContent, "Saved");
  });

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
