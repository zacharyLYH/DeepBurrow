import type { ReactNode } from "react";

type InstallOs = "ios" | "android" | "other";

export const INSTALL_STEPS: Record<InstallOs, ReactNode[]> = {
  ios: [
    <>
      Open DeepBurrow in <strong>Safari</strong>.
    </>,
    <>
      Tap the <strong>Share</strong> icon in the toolbar.
    </>,
    <>
      Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
    </>,
  ],
  android: [
    <>
      Open DeepBurrow in <strong>Chrome</strong>.
    </>,
    <>
      Tap the <strong>⋮</strong> menu in the address bar.
    </>,
    <>
      Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
    </>,
  ],
  other: [
    <>Open DeepBurrow in a browser on your phone.</>,
    <>
      Use <strong>Share → Add to Home Screen</strong> on iPhone or iPad, or the <strong>⋮</strong>{" "}
      menu on Android.
    </>,
  ],
};

export function detectInstallOs(): InstallOs {
  const ua = navigator.userAgent;
  if (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  ) {
    return "ios";
  }
  return /Android/.test(ua) ? "android" : "other";
}

export function InstallSteps({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="mt-4 space-y-2 text-sm text-muted-foreground">
      {steps.map((step, index) => (
        <li key={index} className="flex gap-2.5">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
            {index + 1}
          </span>
          <span className="min-w-0">{step}</span>
        </li>
      ))}
    </ol>
  );
}
