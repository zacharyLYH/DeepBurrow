import type { PushPayload } from "../packages/types/src/types.ts";

export const PUSH_PORT = 2527;
const PUSH_ORIGIN = `http://127.0.0.1:${PUSH_PORT}`;
export const PUSH_RELAY = `${PUSH_ORIGIN}/push`;

export type MockPush = { endpoint: string; payload: PushPayload };

export async function pushEvents() {
  return (await (await fetch(`${PUSH_ORIGIN}/events`)).json()) as MockPush[];
}

export const clearPushEvents = () => fetch(`${PUSH_ORIGIN}/reset`, { method: "DELETE" });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForPush(predicate: (push: MockPush) => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const hit = (await pushEvents()).find(predicate);
    if (hit) return hit;
    await sleep(50);
  }
  throw new Error("no push received");
}
