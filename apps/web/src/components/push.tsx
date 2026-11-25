import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import {
  enablePush,
  pushState,
  removePush,
  sendTestPush,
  waitForTestPush,
  type PushState,
} from "@/lib/push";

const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : "Could not update notifications";

const LABELS: Record<PushState, string> = {
  loading: "Checking…",
  unsupported: "Not supported here",
  off: "Off for this device",
  on: "On for this device",
  blocked: "Blocked in browser settings",
};

export function usePush() {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);

  const refresh = async () => setState(await pushState());

  useEffect(() => {
    void refresh();
  }, []);

  const runTest = async () => {
    const testId = crypto.randomUUID();
    const received = waitForTestPush(testId);
    await sendTestPush(testId);
    toast((await received) ? "Test notification received" : "Test sent; no receipt from this browser");
  };

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (cause) {
      toast(message(cause));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const enable = () =>
    act(async () => {
      await enablePush();
      setState("on");
      await runTest();
    });
  const disable = () =>
    act(async () => {
      await removePush();
      setState("off");
    });
  const test = () => act(runTest);

  return { state, busy, enable, disable, test };
}

export type PushController = ReturnType<typeof usePush>;

export function PushPrompt({ push, userId }: { push: PushController; userId: string }) {
  const { state, busy, enable } = push;
  const key = `deepburrow:push-dismissed:${userId}`;
  const [hidden, setHidden] = useState(() => localStorage.getItem(key) === "1");
  if (hidden || state !== "off") return null;

  return (
    <div
      data-testid="push-prompt"
      className="absolute bottom-4 left-1/2 z-20 flex w-[min(92%,420px)] -translate-x-1/2 items-center gap-2 rounded-lg border bg-card p-2 text-xs shadow-lg"
    >
      <span className="min-w-0 flex-1 text-muted-foreground">
        Get a notification when an answer is ready.
      </span>
      <Button data-testid="push-enable" size="xs" disabled={busy} onClick={() => void enable()}>
        Enable
      </Button>
      <Button
        data-testid="push-later"
        size="xs"
        variant="ghost"
        onClick={() => {
          localStorage.setItem(key, "1");
          setHidden(true);
        }}
      >
        Later
      </Button>
    </div>
  );
}

export function PushSettings({ push }: { push: PushController }) {
  const { state, busy, enable, disable, test } = push;
  const unavailable = state === "blocked" || state === "unsupported" || state === "loading";

  return (
    <div className="space-y-2">
      <div className="db-setting-row">
        <span className="db-setting-label">This device</span>
        <span data-testid="push-state" className="text-xs text-muted-foreground">
          {LABELS[state]}
        </span>
      </div>
      <div className="flex gap-1">
        {state === "on" ? (
          <>
            <Button data-testid="push-test" size="xs" variant="outline" disabled={busy} onClick={() => void test()}>
              Send test
            </Button>
            <Button data-testid="push-disable" size="xs" variant="ghost" disabled={busy} onClick={() => void disable()}>
              Turn off
            </Button>
          </>
        ) : (
          <Button
            data-testid="push-settings-enable"
            size="xs"
            disabled={busy || unavailable}
            onClick={() => void enable()}
          >
            Enable
          </Button>
        )}
      </div>
      <p className="db-hint">
        Completion notifications are generic. They never include your question or answer.
      </p>
    </div>
  );
}
