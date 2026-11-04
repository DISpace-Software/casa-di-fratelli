// Registration must belong to the current tenant scope. serviceWorker.ready can
// still resolve the old root worker while the tenant worker is installing.
export async function getTenantPushRegistration(serviceWorker, context, { timeoutMs = 15000 } = {}) {
  const script = context.shared ? `/admin-push-sw.js?tenant=${encodeURIComponent(context.tenantId)}` : "/admin-push-sw.js";
  const scope = context.shared ? `/r/${context.tenantId}/` : "/";
  const registration = await serviceWorker.register(script, { scope });
  if (registration.active?.state === "activated") return registration;

  await new Promise((resolve, reject) => {
    const workers = new Set();
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      registration.removeEventListener("updatefound", inspect);
      for (const worker of workers) worker.removeEventListener("statechange", inspect);
    };
    const inspect = () => {
      if (registration.active?.state === "activated") {
        cleanup();
        resolve();
        return;
      }
      for (const worker of [registration.installing, registration.waiting, registration.active]) {
        if (!worker || workers.has(worker)) continue;
        workers.add(worker);
        worker.addEventListener("statechange", inspect);
      }
    };
    timer = setTimeout(() => {
      cleanup();
      reject(new Error("Service worker did not activate. Please try again."));
    }, timeoutMs);
    registration.addEventListener("updatefound", inspect);
    inspect();
  });
  return registration;
}
