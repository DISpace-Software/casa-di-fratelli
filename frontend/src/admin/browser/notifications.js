/** Browser-only notification adapter. Registrations remain tenant-scoped. */
import { getTenantPushRegistration } from '../../domain/adminMap/pushRegistration';
import { tenantContext } from '../../config/tenantRuntime';

export function showBrowserNotification(title, body, icon) {
  if (typeof window === "undefined" || !("Notification" in window)) return;

  if (Notification.permission === "granted") {
    new Notification(title, { body, icon });
    return;
  }

  if (Notification.permission === "default") {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        new Notification(title, { body, icon });
      }
    });
  }
}

export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

export function getReadyAdminPushRegistration() {
  return getTenantPushRegistration(navigator.serviceWorker, tenantContext);
}

