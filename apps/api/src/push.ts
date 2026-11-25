import { sendNotification, setVapidDetails } from "web-push";
import type { PushPayload } from "../../../packages/types/src/types.ts";
import { deletePushSubscription, listPushSubscriptions } from "./db.ts";

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT;
const relay = process.env.PUSH_RELAY;
const configured = Boolean((publicKey && privateKey && subject) || relay);
if (publicKey && privateKey && subject && !relay) {
  setVapidDetails(subject, publicKey, privateKey);
}

const gone = (status?: number) => status === 404 || status === 410;

// Push is best-effort; a dead endpoint is removed, everything else is ignored.
export async function sendPush(userId: string, payload: PushPayload, endpoint?: string) {
  if (!configured) return;
  const subscriptions = listPushSubscriptions(userId).filter(
    (item) => !endpoint || item.endpoint === endpoint,
  );
  await Promise.all(
    subscriptions.map(async (subscription) => {
      if (relay) {
        const response = await fetch(relay, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint, payload }),
        });
        if (gone(response.status)) deletePushSubscription(subscription.endpoint);
        return;
      }
      try {
        await sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
        );
      } catch (error) {
        if (gone((error as { statusCode?: number }).statusCode)) {
          deletePushSubscription(subscription.endpoint);
        }
      }
    }),
  );
}

export const notifyCompletion = (userId: string, burrowId: string, nodeId: string) =>
  sendPush(userId, { title: "DeepBurrow", body: "Your answer is ready.", burrowId, nodeId });
