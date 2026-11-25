import { apiFetch } from "./api";

export type PushState = "loading" | "unsupported" | "off" | "on" | "blocked";

const pushSupported = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const ensureRegistration = async () => {
  const existing = await navigator.serviceWorker.getRegistration();
  return existing ?? navigator.serviceWorker.register("/sw.js");
};

const currentSubscription = async () => {
  if (!pushSupported()) return null;
  const registration = await ensureRegistration();
  return registration.pushManager.getSubscription();
};

const urlBase64ToUint8Array = (value: string) => {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
};

export function registerPwa() {
  if (!("serviceWorker" in navigator)) return;
  void ensureRegistration().catch(() => undefined);
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  try {
    const subscription = await currentSubscription();
    if (!subscription) {
      return Notification.permission === "denied" ? "blocked" : "off";
    }
    const response = await apiFetch(
      `/api/push/status?endpoint=${encodeURIComponent(subscription.endpoint)}`,
    );
    if (!response.ok) return "unsupported";
    return ((await response.json()) as { subscribed: boolean }).subscribed ? "on" : "off";
  } catch {
    return "unsupported";
  }
}

export async function enablePush() {
  if (!pushSupported()) throw new Error("Notifications aren't supported in this browser");
  if (Notification.permission !== "granted") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Notifications were not allowed");
  }

  const key = (await (await fetch("/api/push/key")).json()) as { key?: string };
  if (!key.key) throw new Error("Notifications are not configured");
  const registration = await ensureRegistration();
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key.key),
    }));
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("Could not create a push subscription");
  }
  const response = await apiFetch("/api/push/subscription", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    }),
  });
  if (!response.ok) throw new Error("Could not save this device");
}

export async function sendTestPush(testId: string) {
  const subscription = await currentSubscription();
  if (!subscription) throw new Error("Enable notifications on this device first");
  const response = await apiFetch("/api/push/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint, testId }),
  });
  if (!response.ok) throw new Error("Could not send a test notification");
}

export function waitForTestPush(testId: string) {
  return new Promise<boolean>((resolve) => {
    let timer = 0;
    const finish = (received: boolean) => {
      window.clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("message", onMessage);
      resolve(received);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "push-received" && event.data.testId === testId) finish(true);
    };
    timer = window.setTimeout(() => finish(false), 8000);
    navigator.serviceWorker.addEventListener("message", onMessage);
  });
}

export const removePush = async () => {
  try {
    const subscription = await currentSubscription();
    if (!subscription) return;
    // Plain fetch: detaching must not trigger the expired-session refresh loop.
    await fetch("/api/push/subscription", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => undefined);
    await subscription.unsubscribe().catch(() => undefined);
  } catch {
    // A stale endpoint is removed by the next failed push.
  }
};
