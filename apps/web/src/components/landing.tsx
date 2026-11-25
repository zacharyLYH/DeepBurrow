import type { ReactNode } from "react";
import { INSTALL_STEPS, InstallSteps } from "@/components/install";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const primary =
  "inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90";
const secondary =
  "inline-flex h-10 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium transition-colors hover:bg-accent";

function BrowserFrame() {
  return (
    <figure data-testid="walkthrough-desktop" className="min-w-0">
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b bg-muted/60 px-3 py-2">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2 rounded-full bg-muted-foreground/30" />
            <span className="size-2 rounded-full bg-muted-foreground/30" />
            <span className="size-2 rounded-full bg-muted-foreground/30" />
          </span>
          <span className="mx-auto rounded-md border bg-background px-3 py-0.5 text-[10px] text-muted-foreground">
            deepburrow.dev
          </span>
          <span className="w-9" aria-hidden />
        </div>
        <video
          data-testid="walkthrough-desktop-video"
          className="aspect-video w-full bg-black"
          controls
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          poster="/walkthrough-desktop-poster.png"
          aria-label="DeepBurrow desktop walkthrough"
        >
          <source src="/walkthrough-desktop.webm" type="video/webm" />
          <track
            kind="captions"
            src="/walkthrough-desktop.vtt"
            srcLang="en"
            label="English"
            default
          />
        </video>
      </div>
      <figcaption className="mt-2 text-center text-xs text-muted-foreground">Desktop</figcaption>
    </figure>
  );
}

function PhoneFrame() {
  return (
    <figure
      data-testid="walkthrough-mobile"
      className="mx-auto w-full max-w-[280px] md:mx-0 md:justify-self-end"
    >
      <div className="relative rounded-[2.75rem] bg-zinc-950 p-[3px] shadow-xl ring-1 ring-black/10">
        <div className="relative overflow-hidden rounded-[2.6rem] bg-black">
          <video
            data-testid="walkthrough-mobile-video"
            className="block w-full bg-black"
            style={{ aspectRatio: "390 / 844" }}
            controls
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            poster="/walkthrough-mobile-poster.png"
            aria-label="DeepBurrow mobile walkthrough"
          >
            <source src="/walkthrough-mobile.webm" type="video/webm" />
            <track
              kind="captions"
              src="/walkthrough-mobile.vtt"
              srcLang="en"
              label="English"
              default
            />
          </video>
          <span
            className="pointer-events-none absolute left-1/2 top-2.5 h-6 w-24 -translate-x-1/2 rounded-full bg-zinc-950/95 shadow-sm"
            aria-hidden
          />
        </div>
      </div>
      <figcaption className="mt-2 text-center text-xs text-muted-foreground">Mobile</figcaption>
    </figure>
  );
}

function Svg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </Svg>
  );
}

function ChevronIcon({
  direction,
  className,
}: {
  direction: "left" | "right";
  className?: string;
}) {
  return (
    <Svg className={className}>
      <path d={direction === "left" ? "m15 5-7 7 7 7" : "m9 5 7 7-7 7"} />
    </Svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2Z" />
      <path d="M4 19a2 2 0 0 1 2-2h12" />
    </Svg>
  );
}

function TabsIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <rect x="4" y="8" width="12" height="12" rx="2" />
      <path d="M8 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2" />
    </Svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M12 5h.01M12 12h.01M12 19h.01" strokeWidth="3" />
    </Svg>
  );
}

function Callout({
  children,
  align = "center",
}: {
  children: ReactNode;
  align?: "center" | "right";
}) {
  return (
    <span
      className={cn(
        "absolute -top-9 z-10 whitespace-nowrap rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white shadow-sm",
        align === "center" ? "left-1/2 -translate-x-1/2" : "right-0",
      )}
    >
      {children}
      <span
        className={cn(
          "absolute top-full size-2 -translate-y-1/2 rotate-45 bg-emerald-600",
          align === "center" ? "left-1/2 -translate-x-1/2" : "right-3",
        )}
        aria-hidden
      />
    </span>
  );
}

function SafariToolbar() {
  return (
    <div
      role="img"
      aria-label="Safari toolbar with the Share button highlighted"
      className="mt-3 rounded-xl border bg-muted/30 px-4 pb-3 pt-12"
    >
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="flex size-8 items-center justify-center">
          <ChevronIcon direction="left" className="size-4" />
        </span>
        <span className="flex size-8 items-center justify-center">
          <ChevronIcon direction="right" className="size-4" />
        </span>
        <span className="relative flex size-8 items-center justify-center">
          <Callout>Tap Share</Callout>
          <span className="flex size-8 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm ring-4 ring-emerald-500/20">
            <ShareIcon className="size-4" />
          </span>
        </span>
        <span className="flex size-8 items-center justify-center">
          <BookIcon className="size-4" />
        </span>
        <span className="flex size-8 items-center justify-center">
          <TabsIcon className="size-4" />
        </span>
      </div>
    </div>
  );
}

function ChromeToolbar() {
  return (
    <div
      role="img"
      aria-label="Chrome address bar with the menu button highlighted"
      className="mt-3 rounded-xl border bg-muted/30 px-3 pb-3 pt-12"
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-full border bg-background px-3 text-[11px] text-muted-foreground">
          <LockIcon className="size-3 shrink-0" />
          <span className="truncate">deepburrow.dev</span>
        </div>
        <span className="relative flex size-8 shrink-0 items-center justify-center">
          <Callout align="right">Tap menu</Callout>
          <span className="flex size-8 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm ring-4 ring-emerald-500/20">
            <MenuIcon className="size-4" />
          </span>
        </span>
      </div>
    </div>
  );
}

export function Landing({ signedIn }: { signedIn: boolean }) {
  return (
    <div data-testid="landing" className="min-h-dvh bg-background">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-5">
        <a href="/" className="flex items-center gap-2.5">
          <img
            src="/deepburrow_logo.png"
            alt=""
            className="size-9 rounded-lg object-contain"
            width={36}
            height={36}
          />
          <span className="text-sm font-semibold tracking-tight">DeepBurrow</span>
        </a>
        <nav className="flex items-center gap-3 text-sm">
          {signedIn ? (
            <a href="/app" data-testid="open-workspace" className={secondary}>
              Open workspace
            </a>
          ) : (
            <a
              href="/sign-in"
              data-testid="landing-signin"
              className="font-medium underline-offset-4 hover:underline"
            >
              Sign in
            </a>
          )}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pb-16">
        <section className="mx-auto max-w-2xl pt-10 text-center md:pt-16">
          <Badge variant="secondary" className="mb-4">
            Cloud-synced · Bring your own model
          </Badge>
          <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-5xl">
            Deep research with AI the{" "}
            <span className="text-emerald-600 dark:text-emerald-400">smarter</span> way. Chat
            bubbles don&apos;t cut it.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-sm text-muted-foreground md:text-base">
            DeepBurrow gives you a canvas,  where every rabbithole becomes a branch you can grow,
            with your own model and search keys.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {signedIn ? (
              <a href="/app" data-testid="landing-open" className={primary}>
                Continue to workspace
              </a>
            ) : (
              <>
                <a href="/sign-in" data-testid="landing-signup" className={primary}>
                  Start a burrow
                </a>
              </>
            )}
          </div>
        </section>

        <section aria-labelledby="walkthrough-title" className="mt-12 md:mt-16">
          <h2 id="walkthrough-title" className="text-lg font-semibold tracking-tight">
            Walkthrough
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The same burrow on desktop and mobile.
          </p>
          <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_280px] md:items-start md:gap-5">
            <BrowserFrame />
            <PhoneFrame />
          </div>
        </section>

        <section aria-labelledby="install-title" className="mt-12">
          <h2 id="install-title" className="text-lg font-semibold tracking-tight">
            Install on your phone
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            DeepBurrow runs in the browser; add it to your home screen for a full-screen window.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Card data-testid="install-ios">
              <CardContent className="py-4">
                <h3 className="text-sm font-semibold">iOS and iPadOS</h3>
                <SafariToolbar />
                <InstallSteps steps={INSTALL_STEPS.ios} />
              </CardContent>
            </Card>
            <Card data-testid="install-android">
              <CardContent className="py-4">
                <h3 className="text-sm font-semibold">Android</h3>
                <ChromeToolbar />
                <InstallSteps steps={INSTALL_STEPS.android} />
                <p className="mt-2 text-xs text-muted-foreground">
                  Menus can vary by browser.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>DeepBurrow · Cloud-synced · BYOK</span>
          <nav>
            <a href={signedIn ? "/app" : "/sign-in"} className="underline-offset-4 hover:underline">
              {signedIn ? "Workspace" : "Sign in"}
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
