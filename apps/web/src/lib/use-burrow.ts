import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Burrow,
  type Coords,
  type Event,
  type Node as BurrowNode,
  type Origin,
  type Preset,
  type Viewport,
} from "@deepburrow/types";
import { apiFetch } from "./api";
import { liveContent } from "./live-content";
import { ask as askApi, attach as attachApi, cancel } from "./stream";

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };
const SETTLED: ReadonlySet<Event["type"]> = new Set(["node.done", "node.error"]);

const reason = (cause: unknown) => (cause instanceof Error ? cause.message : "Failed");

// One payload for a new ask and a retry; a retry only pins the existing row.
const payload = (origin: Origin, parentId: string | null, nodeId?: string) => ({
  nodeId,
  parentId,
  origin,
});

const send = (path: string, method: "PATCH" | "POST" | "DELETE", body?: unknown) =>
  apiFetch(`/api${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

export function useBurrow(burrowId: string) {
  const [nodes, setNodes] = useState<BurrowNode[]>([]);
  const [title, setTitle] = useState("");
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const controllers = useRef(new Map<string, AbortController>());
  const viewportTimer = useRef<number>(undefined);

  const patch = (id: string, next: Partial<BurrowNode>) =>
    setNodes((current) => current.map((node) => (node.id === id ? { ...node, ...next } : node)));

  const upsert = (node: BurrowNode) =>
    setNodes((current) =>
      current.some((item) => item.id === node.id)
        ? current.map((item) => (item.id === node.id ? node : item))
        : [...current, node],
    );

  const applyEvent = (id: string, event: Event) => {
    switch (event.type) {
      // The server sends the row it wrote, so placement and defaults live once.
      case "node.pending":
        upsert(event.node);
        break;
      case "node.meta":
        patch(id, { title: event.title, sources: event.sources, followups: event.followups });
        break;
      case "node.progress":
        liveContent.progress(id, event.line);
        break;
      case "node.token":
        liveContent.token(id, event.text);
        break;
      case "node.done":
      case "node.error":
        liveContent.reset(id);
        setNodes((current) => current.map((node) => (node.id === id ? event.node : node)));
        break;
    }
  };

  // One owner for a node's controller: the first settled event wins, and a
  // stream that ends without one is a failure rather than a silent hang.
  const track = (
    current: () => string | null,
    controller: AbortController,
    run: (onEvent: (event: Event) => void) => Promise<void>,
  ) => {
    let settled = false;
    void run((event) => {
      if (SETTLED.has(event.type)) settled = true;
      applyEvent(current() ?? event.nodeId, event);
    })
      .then(() => {
        const id = current();
        if (id && !settled) patch(id, { status: "failed", error: "Stream ended" });
      })
      .catch((cause) => {
        const id = current();
        if (id && !controller.signal.aborted) patch(id, { status: "failed", error: reason(cause) });
      })
      .finally(() => {
        const id = current();
        if (id && controllers.current.get(id) === controller) controllers.current.delete(id);
      });
    return controller;
  };

  const begin = (
    id: string,
    run: (signal: AbortSignal, onEvent: (event: Event) => void) => Promise<void>,
  ) => {
    const controller = new AbortController();
    controllers.current.set(id, controller);
    track(() => id, controller, (onEvent) => run(controller.signal, onEvent));
  };

  const ask = (parentId: string | null, question: string, preset?: Preset, selectedText?: string) => {
    const origin: Origin = { question: question.trim(), preset, selectedText };
    const controller = new AbortController();
    let id: string | null = null;

    track(() => id, controller, (onEvent) =>
      askApi(payload(origin, parentId), controller.signal, (event) => {
        // The first event is the stored row: adopt its id, then follow it.
        if (!id) {
          id = event.nodeId;
          controllers.current.set(id, controller);
        }
        onEvent(event);
      }),
    );
  };

  const followUp = (id: string, preset?: Preset, text?: string) => {
    if (!text?.trim() && !preset) return;
    ask(id, text ?? "", preset);
  };

  // Retrying reuses the row; the run's pending event restores its empty state.
  const retry = (id: string) => {
    const node = nodes.find((item) => item.id === id);
    if (!node) return;
    liveContent.reset(id);
    const origin = node.origin;
    begin(id, (signal, onEvent) =>
      askApi(payload(origin, node.parentId, id), signal, onEvent),
    );
  };

  const stop = (id: string) => void cancel(id);

  // Rename is optimistic; a rejected write falls back to the stored title.
  const rename = async (id: string, next: string) => {
    const before = nodes.find((node) => node.id === id)?.title;
    patch(id, { title: next });
    const response = await send(`/nodes/${id}`, "PATCH", { title: next });
    if (!response.ok && before) patch(id, { title: before });
  };

  const remove = async (id: string) => {
    const response = await send(`/nodes/${id}`, "DELETE");
    if (!response.ok) return null;
    const { ids } = (await response.json()) as { ids: string[] };
    for (const gone of ids) {
      controllers.current.get(gone)?.abort();
      controllers.current.delete(gone);
    }
    setNodes((current) => current.filter((node) => !ids.includes(node.id)));
    return ids;
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await apiFetch(`/api/burrows/${burrowId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { burrow: Burrow; nodes: BurrowNode[] };
      setTitle(data.burrow.title);
      setViewport(data.burrow.viewport);
      setNodes(data.nodes);
    } catch (cause) {
      setLoadError(reason(cause));
    } finally {
      setLoading(false);
    }
  }, [burrowId]);

  const restore = async (id: string) => {
    await send(`/nodes/${id}/restore`, "POST");
    await load();
  };

  // Drag stop writes one position; the server is the only source of layout.
  const moveNode = (id: string, position: Coords) => {
    patch(id, { position });
    void send(`/nodes/${id}`, "PATCH", { position });
  };

  // One shared camera per burrow, so pan and zoom survive a reload.
  const saveViewport = (next: Viewport) => {
    setViewport(next);
    window.clearTimeout(viewportTimer.current);
    viewportTimer.current = window.setTimeout(() => {
      void send(`/burrows/${burrowId}`, "PATCH", { viewport: next });
    }, 300);
  };

  useEffect(() => {
    void load();
  }, [load]);

  // Reattach to anything still running, e.g. after a refresh.
  useEffect(() => {
    for (const node of nodes) {
      if (node.status !== "pending" || controllers.current.has(node.id)) continue;
      begin(node.id, (signal, onEvent) => attachApi(node.id, signal, onEvent));
    }
  }, [nodes]);

  useEffect(() => {
    const active = controllers.current;
    return () => {
      active.forEach((controller) => controller.abort());
      window.clearTimeout(viewportTimer.current);
    };
  }, []);

  return {
    title,
    viewport,
    nodes,
    loading,
    loadError,
    reload: load,
    ask,
    followUp,
    retry,
    stop,
    rename,
    remove,
    restore,
    moveNode,
    saveViewport,
  };
}
