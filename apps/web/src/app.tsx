import { useCallback, useEffect, useMemo, useState } from "react";
import { titleFromAsk } from "@deepburrow/types";
import { useReactFlow } from "@xyflow/react";
import { apiFetch, onAuthExpired, type Session } from "@/lib/api";
import { AuthScreen } from "@/components/auth-screen";
import { BurrowSidebar } from "@/components/burrow-sidebar";
import { Landing } from "@/components/landing";
import { AskPopover } from "@/components/ask-popover";
import { Canvas } from "@/components/canvas";
import { Lightbox } from "@/components/markdown";
import type { CardActions } from "@/components/node-card";
import { NewBurrowDialog } from "@/components/new-burrow-dialog";
import { EmptyCanvas, Shortcuts } from "@/components/overlays";
import { Palette } from "@/components/palette";
import { SettingsSheet } from "@/components/settings-sheet";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toolbar } from "@/components/toolbar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Toaster, toast } from "@/components/ui/sonner";
import { cardMarkdown } from "@/lib/copy";
import { exportBurrowHtml } from "@/lib/export";
import { CARD_HEIGHT, CARD_WIDTH } from "@/lib/layout";
import { loadSettings, presetsFor, resetSettings, toggleTheme, useSettings } from "@/lib/settings";
import { usePassageSelection } from "@/lib/use-passage";
import { useShortcuts } from "@/lib/use-shortcuts";
import { useBurrow } from "@/lib/use-burrow";
import { recallBurrow, rememberBurrow, useBurrows } from "@/lib/use-burrows";
import { ask as askApi } from "@/lib/stream";

const FIT = { padding: 0.12, duration: 250 };
type Overlay = "palette" | "settings" | "shortcuts";

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

const readPath = () => window.location.pathname;

export function AuthGate() {
  const [session, setSession] = useState<Session | null>();
  const [notice, setNotice] = useState("");
  const [path, setPath] = useState(readPath);

  const navigate = useCallback((next: string) => {
    if (window.location.pathname !== next) window.history.pushState({}, "", next);
    setPath(next);
  }, []);

  useEffect(() => {
    const sync = () => setPath(readPath());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  useEffect(() => {
    let live = true;
    const expired = onAuthExpired(() => {
      resetSettings();
      if (live) setSession(null);
    });
    void apiFetch("/api/auth/me")
      .then(async (response) => {
        if (!live) return;
        setSession(response.ok ? ((await response.json()) as Session) : null);
      })
      .catch(() => live && setSession(null));
    return () => {
      live = false;
      expired();
    };
  }, []);

  // The landing page is public and never redirects. The workspace sends signed-out
  // visitors to sign in, and a signed-in visitor on sign-in goes to the workspace.
  useEffect(() => {
    if (session === undefined) return;
    if (session && path === "/sign-in") navigate("/app");
    if (!session && path !== "/" && path !== "/sign-in") navigate("/sign-in");
  }, [session, path, navigate]);

  if (path === "/") return <Landing signedIn={Boolean(session)} />;
  if (session === undefined) return <Notice>Loading account…</Notice>;
  if (session === null) {
    return (
      <AuthScreen
        notice={notice}
        onSession={(next) => {
          setNotice("");
          setSession(next);
          navigate("/app");
        }}
      />
    );
  }
  if (path === "/sign-in") return <Notice>Opening workspace…</Notice>;

  return (
    <App
      session={session}
      onSignOut={(message = "") => {
        void fetch("/api/auth/logout", { method: "POST" });
        resetSettings();
        setNotice(message);
        setSession(null);
        navigate("/sign-in");
      }}
    />
  );
}

export function App({
  session,
  onSignOut,
}: {
  session: Session;
  onSignOut: (notice?: string) => void;
}) {
  const { burrows, loading, loadError, reload, create, rename } = useBurrows();
  const [selectedId, setSelectedId] = useState(() => recallBurrow(session.user.id));
  const [created, setCreated] = useState<{ burrowId: string; nodeId: string } | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [modelConfigured, setModelConfigured] = useState<boolean>();
  const [promptDismissed, setPromptDismissed] = useState(false);

  // One provider-status read per app load, shared with the settings prompt.
  useEffect(() => {
    void loadSettings().then((providers) => setModelConfigured(providers?.model));
  }, []);

  // The stored id wins when it still exists; otherwise the account's first
  // burrow. Selecting writes the id for this user on this device only.
  const selected = useMemo(
    () =>
      burrows.find((burrow) => burrow.id === selectedId) ??
      burrows.find((burrow) => burrow.id === session.burrowId) ??
      burrows[0] ??
      null,
    [burrows, selectedId, session.burrowId],
  );

  const select = useCallback(
    (id: string) => {
      setCreated((current) => (current?.burrowId === id ? current : null));
      setSelectedId(id);
      rememberBurrow(session.user.id, id);
    },
    [session.user.id],
  );

  // A new burrow starts with its first question. The row is stored by the first
  // pending event; the canvas then loads it and attaches to the same run.
  const startBurrow = async (question: string) => {
    const result = await create(titleFromAsk(question) || "New burrow");
    if ("error" in result) return result.error;
    const burrowId = result.burrow.id;
    const controller = new AbortController();
    let nodeId = "";
    await new Promise<void>((resolve) => {
      void askApi(
        { parentId: null, burrowId, origin: { question } },
        controller.signal,
        (event) => {
          if (event.type !== "node.pending") return;
          nodeId = event.nodeId;
          controller.abort();
          resolve();
        },
      )
        .catch(() => undefined)
        .finally(resolve);
    });
    setCreated({ burrowId, nodeId });
    select(burrowId);
    return null;
  };

  if (loading) return <Notice>Loading burrows…</Notice>;
  if (loadError) {
    return (
      <Notice>
        Couldn&apos;t load burrows.
        <Button size="sm" variant="outline" onClick={reload}>
          Retry
        </Button>
      </Notice>
    );
  }
  if (!selected) return <Notice>No burrows yet.</Notice>;

  return (
    <div data-testid="app" className="h-dvh w-full overflow-hidden">
      <SidebarProvider>
        <BurrowSidebar
          burrows={burrows}
          selectedId={selected.id}
          selectedTitle={selected.title}
          onSelect={select}
          onNew={() => setNewOpen(true)}
          onRename={rename}
        />
        <SidebarInset>
          <Workspace
            key={selected.id}
            session={session}
            burrowId={selected.id}
            title={selected.title}
            onNew={() => setNewOpen(true)}
            onSignOut={onSignOut}
            showModelPrompt={modelConfigured === false && !promptDismissed}
            onDismissPrompt={() => setPromptDismissed(true)}
            onModelSaved={() => setModelConfigured(true)}
            initialFocusId={selected.id === created?.burrowId ? created.nodeId : null}
          />
        </SidebarInset>
        <NewBurrowDialog open={newOpen} onOpenChange={setNewOpen} onCreate={startBurrow} />
        <Toaster />
      </SidebarProvider>
    </div>
  );
}

function Workspace({
  session,
  burrowId,
  title,
  onNew,
  onSignOut,
  showModelPrompt,
  onDismissPrompt,
  onModelSaved,
  initialFocusId,
}: {
  session: Session;
  burrowId: string;
  title: string;
  onNew: () => void;
  onSignOut: (notice?: string) => void;
  showModelPrompt: boolean;
  onDismissPrompt: () => void;
  onModelSaved: () => void;
  initialFocusId: string | null;
}) {
  const burrow = useBurrow(burrowId, initialFocusId);
  const settings = useSettings();
  const { fitView, setCenter } = useReactFlow();

  const [overlay, setOverlay] = useState<Overlay | null>(null);

  const byId = useMemo(() => new Map(burrow.nodes.map((node) => [node.id, node])), [burrow.nodes]);
  const { passage, clearPassage } = usePassageSelection();

  // The server owns the camera: the canvas starts at the stored viewport and
  // every later move writes back. Writes stay off until React Flow is ready.
  const [cameraReady, setCameraReady] = useState(false);

  // Nodes carry a seed size, so the camera can center before measurement.
  const center = useCallback(
    (id: string, duration = 300) => {
      const at = byId.get(id)?.position;
      if (!at) return;
      void setCenter(at.x + CARD_WIDTH / 2, at.y + CARD_HEIGHT / 2, { zoom: 0.9, duration });
    },
    [byId, setCenter],
  );

  // One focus target for every card this client creates: the first card of a
  // new burrow and every later branch take the same path. Opening a burrow
  // reads its stored camera instead, because nothing requested focus.
  const { focusId, clearFocus } = burrow;
  useEffect(() => {
    // setCenter is a no-op until React Flow has sized the pane.
    if (!cameraReady || !focusId || !byId.has(focusId)) return;
    center(focusId, 0);
    clearFocus();
  }, [cameraReady, focusId, byId, center, clearFocus]);

  const actions: CardActions = {
    onFollowUp: burrow.followUp,
    onRetry: burrow.retry,
    onStop: burrow.stop,
    onRename: (id, title) => void burrow.rename(id, title),
    onDelete: async (id) => {
      const ids = await burrow.remove(id);
      if (!ids) return;
      toast(ids.length > 1 ? `Branch deleted · ${ids.length} cards` : "Card deleted", {
        duration: 8000,
        action: { label: "Undo", onClick: () => void burrow.restore(id) },
      });
    },
    onCopyCard: (id) => {
      const node = byId.get(id);
      if (node) void navigator.clipboard.writeText(cardMarkdown(node)).then(() => toast("Card copied", { duration: 2000 }));
    },
    onSettings: () => setOverlay("settings"),
  };

  const download = () => exportBurrowHtml(title);

  useShortcuts({
    palette: () => setOverlay((open) => (open === "palette" ? null : "palette")),
    help: () => setOverlay((open) => (open === "shortcuts" ? null : "shortcuts")),
    escape: () => {
      setOverlay(null);
      clearPassage();
    },
  });

  if (burrow.loading) return <Notice>Loading burrow…</Notice>;
  if (burrow.loadError) {
    return (
      <Notice>
        Couldn&apos;t load the burrow.
        <Button size="sm" variant="outline" onClick={burrow.reload}>
          Retry
        </Button>
      </Notice>
    );
  }

  return (
    <div data-testid="workspace" className="relative h-full w-full">
      {burrow.nodes.length === 0 ? (
        <EmptyCanvas onNew={onNew} />
      ) : (
        <Canvas
          nodes={burrow.nodes}
          presets={presetsFor(settings, "followUp")}
          actions={actions}
          onMove={burrow.moveNode}
          onMoveEnd={(next) => {
            if (cameraReady) burrow.saveViewport(next);
          }}
          viewport={burrow.viewport}
          onReady={() => setCameraReady(true)}
        />
      )}

      <Toolbar
        onFit={() => void fitView(FIT)}
        onSettings={() => setOverlay("settings")}
        onPalette={() => setOverlay("palette")}
        onShortcuts={() => setOverlay("shortcuts")}
        onExport={download}
        canExport={burrow.nodes.length > 0}
      />

      <Dialog open={showModelPrompt} onOpenChange={(next) => !next && onDismissPrompt()}>
        <DialogContent
          data-testid="model-prompt"
          aria-describedby={undefined}
          className="top-1/2 w-[420px] -translate-y-1/2 p-4"
        >
          <DialogTitle className="text-sm font-semibold">Add a model to start asking</DialogTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Model is required to ask; Search is optional. You can keep browsing without one.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button data-testid="model-prompt-dismiss" size="sm" variant="ghost" onClick={onDismissPrompt}>
              Not now
            </Button>
            <Button
              data-testid="model-prompt-open"
              size="sm"
              onClick={() => {
                onDismissPrompt();
                setOverlay("settings");
              }}
            >
              Open settings
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {passage && (
        <AskPopover
          text={passage.text}
          presets={presetsFor(settings, "selection")}
          style={{ left: passage.left, top: passage.top }}
          onAsk={(question, preset) => {
            burrow.ask(passage.sourceId, question, preset, passage.text);
            clearPassage();
          }}
          onClose={clearPassage}
        />
      )}

      <Palette
        open={overlay === "palette"}
        nodes={burrow.nodes}
        onClose={() => setOverlay(null)}
        onJump={center}
        commands={[
          { label: "Fit to screen", run: () => void fitView(FIT) },
          { label: "Toggle theme", run: toggleTheme },
          { label: "Open settings", run: () => setOverlay("settings") },
          { label: "Export as HTML", run: download },
        ]}
      />

      <SettingsSheet
        open={overlay === "settings"}
        onClose={() => setOverlay(null)}
        user={session.user}
        onSignOut={onSignOut}
        onModelSaved={onModelSaved}
      />
      <Shortcuts open={overlay === "shortcuts"} onClose={() => setOverlay(null)} />
      <Lightbox />
    </div>
  );
}
