import test from "node:test";
import assert from "node:assert/strict";
import { getTenantPushRegistration } from "../adminMap/pushRegistration.js";

class TrackedTarget extends EventTarget {
  listeners = new Set();
  addEventListener(type, listener) { this.listeners.add(listener); super.addEventListener(type, listener); }
  removeEventListener(type, listener) { this.listeners.delete(listener); super.removeEventListener(type, listener); }
}
const context = { shared: true, tenantId: "cofein" };

function fixture(active = null) {
  const registration = new TrackedTarget();
  registration.active = active;
  const requests = [];
  return { registration, requests, serviceWorker: {
    get ready() { throw new Error("Root worker must never be used."); },
    async register(script, options) { requests.push({ script, options }); return registration; },
  } };
}

test("push uses the returned tenant registration, never the root ready promise", async () => {
  const { registration, requests, serviceWorker } = fixture({ state: "activated" });
  assert.equal(await getTenantPushRegistration(serviceWorker, context), registration);
  assert.deepEqual(requests, [{ script: "/admin-push-sw.js?tenant=cofein", options: { scope: "/r/cofein/" } }]);
});

test("push waits for its installing worker and removes listeners on activation", async () => {
  const { registration, serviceWorker } = fixture();
  const worker = new TrackedTarget();
  worker.state = "installing";
  registration.installing = worker;
  const result = getTenantPushRegistration(serviceWorker, context, { timeoutMs: 1000 });
  await Promise.resolve();
  assert.equal(worker.listeners.size, 1);
  registration.active = worker;
  registration.installing = null;
  worker.state = "activated";
  worker.dispatchEvent(new Event("statechange"));
  assert.equal(await result, registration);
  assert.equal(worker.listeners.size, 0);
  assert.equal(registration.listeners.size, 0);
});

test("push activation timeout rejects and removes all listeners", async () => {
  const { registration, serviceWorker } = fixture();
  const worker = new TrackedTarget();
  registration.waiting = worker;
  worker.state = "installed";
  await assert.rejects(getTenantPushRegistration(serviceWorker, context, { timeoutMs: 10 }), /did not activate/);
  assert.equal(worker.listeners.size, 0);
  assert.equal(registration.listeners.size, 0);
});

test("existing Casa installation retains its original root scope", async () => {
  const { serviceWorker, requests } = fixture({ state: "activated" });
  await getTenantPushRegistration(serviceWorker, { shared: false });
  assert.deepEqual(requests, [{ script: "/admin-push-sw.js", options: { scope: "/" } }]);
});
