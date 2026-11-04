const sharedTenant = new URL(self.location.href).searchParams.get("tenant");
const tenantId = /^[a-z0-9][a-z0-9-]{0,63}$/.test(sharedTenant || "") ? sharedTenant : null;
const adminPath = tenantId ? `/r/${tenantId}/admin` : "/admin";

self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: tenantId ? "Restaurant" : "Casa di Fratelli",
      body: event.data ? event.data.text() : "Имате ново известие.",
    };
  }

  if (tenantId && data.tenantId !== tenantId) return;
  const isCasa = !tenantId || tenantId === "casa-di-fratelli";
  const title = data.title || (isCasa ? "Casa di Fratelli" : "Restaurant");
  const options = {
    body: data.body || "Имате ново известие.",
    icon: isCasa ? "/casa-fratelli-icon-192.png" : "/restaurant-generic.svg",
    badge: isCasa ? "/favicon-96x96.png" : "/restaurant-generic.svg",
    tag: `${tenantId || "casa-di-fratelli"}:${data.tag || "admin"}`,
    renotify: true,
    data: {
      url: adminPath,
      reservationId: data.reservationId || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(adminPath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const adminClient = clientList.find((client) => {
        const url = new URL(client.url);
        return url.origin === self.location.origin && url.pathname.replace(/\/$/, "") === adminPath;
      });
      if (adminClient?.focus) {
        return adminClient.focus();
      }

      return self.clients.openWindow(targetUrl);
    })
  );
});
