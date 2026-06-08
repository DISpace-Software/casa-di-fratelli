self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: "Casa di Fratelli",
      body: event.data ? event.data.text() : "Имате ново известие.",
    };
  }

  const title = data.title || "Casa di Fratelli";
  const options = {
    body: data.body || "Имате ново известие.",
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    tag: data.tag || "casa-di-fratelli-admin",
    renotify: true,
    data: {
      url: data.url || "/admin",
      reservationId: data.reservationId || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || "/admin", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const adminClient = clientList.find((client) => client.url.includes("/admin"));
      if (adminClient?.focus) {
        return adminClient.focus();
      }

      return self.clients.openWindow(targetUrl);
    })
  );
});
