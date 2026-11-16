import { useCallback, useEffect, useRef, useState } from "react";
import {
  titleFromOrigin,
  type Burrow,
  type Event,
  type Node as BurrowNode,
  type Origin,
  type Preset,
} from "@deepburrow/types";
import { buildAsk } from "./ask";
import { ask as askApi, attach as attachApi, cancel } from "./stream";

type Listener = (event: Event) => void;
type Run = (signal: AbortSignal, onEvent: Listener) => Promise<void>;

const reason = (cause: unknown) => (cause instanceof Error ? cause.message : "Failed");

export function useBurrow(burrowId: string) {
  const [nodes, setNodes] = useState<BurrowNode[]>([]);
  // Progress is live-only: never part of a Node, never reloaded.
  const [progress, setProgress] = useState<Record<string, string[]>>({});
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const controllers = useRef(new Map<string, AbortController>());

  const patch = (id: string, next: Partial<BurrowNode>) =>
    setNodes((current) => current.map((node) => (node.id === id ? { ...node, ...next } : node)));

  const clearProgress = (id: string) =>
    setProgress((current) => (current[id]?.length ? { ...current, [id]: [] } : current));

  const applyEvent = (id: string, event: Event) => {
    switch (event.type) {
      case "node.pending":
        patch(id, { status: "pending" });
        break;
      case "node.meta":
        patch(id, { title: event.title, sources: event.sources, followups: event.followups });
        break;
      case "node.progress":
        setProgress((current) => ({ ...current, [id]: [...(current[id] ?? []), event.line] }));
        break;
      case "node.token":
        clearProgress(id);
        setNodes((current) =>
          current.map((node) =>
            node.id === id ? { ...node, markdown: node.markdown + event.text } : node,
          ),
        );
        break;
      case "node.done":
      case "node.error":
        clearProgress(id);
        setNodes((current) => current.map((node) => (node.id === id ? event.node : node)));
        break;
    }
  };

  const finish = (id: string | null, controller: AbortController, terminal: boolean) => {
    if (!id) return;
    if (!terminal) patch(id, { status: "failed", error: "Stream ended" });
    if (controllers.current.get(id) === controller) controllers.current.delete(id);
  };

  const fail = (id: string | null, controller: AbortController, cause: unknown) => {
    if (!id) return;
    if (!controller.signal.aborted) patch(id, { status: "failed", error: reason(cause) });
    if (controllers.current.get(id) === controller) controllers.current.delete(id);
  };

  // One stream per node, whichever endpoint feeds it.
  const track = async (id: string, run: Run) => {
    const controller = new AbortController();
    controllers.current.set(id, controller);
    let terminal = false;
    try {
      await run(controller.signal, (event) => {
        if (event.type === "node.done" || event.type === "node.error") terminal = true;
        applyEvent(id, event);
      });
      finish(id, controller, terminal);
    } catch (cause) {
      fail(id, controller, cause);
    }
  };

  const ask = (parentId: string | null, question: string, preset?: Preset, selectedText?: string) => {
    const origin: Origin = { question: question.trim(), preset, selectedText };
    const controller = new AbortController();
    let id: string | null = null;
    let terminal = false;

    const onEvent = (event: Event) => {
      if (!id) {
        const created = event.nodeId;
        const now = Date.now();
        id = created;
        controllers.current.set(created, controller);
        setNodes((current) => [
          ...current,
          {
            id: created,
            burrowId,
            parentId,
            title: titleFromOrigin(origin),
            markdown: "",
            origin,
            sources: [],
            followups: [],
            status: "pending",
            error: "",
            createdAt: now,
            updatedAt: now,
          },
        ]);
      }
      if (event.type === "node.done" || event.type === "node.error") terminal = true;
      applyEvent(id, event);
    };

    void askApi(
      { parentId, ask: buildAsk(origin.question, preset, selectedText), origin },
      controller.signal,
      onEvent,
    ).then(
      () => finish(id, controller, terminal),
      (cause) => fail(id, controller, cause),
    );
  };

  const followUp = (id: string, preset?: Preset, text?: string) => {
    if (!text?.trim() && !preset) return;
    ask(id, text ?? "", preset);
  };

  const retry = (id: string) => {
    const node = nodes.find((item) => item.id === id);
    if (!node) return;
    setProgress((current) => ({ ...current, [id]: [] }));
    patch(id, {
      status: "pending",
      markdown: "",
      sources: [],
      followups: [],
      error: "",
      title: titleFromOrigin(node.origin),
    });
    void track(id, (signal, onEvent) =>
      askApi(
        {
          nodeId: id,
          parentId: node.parentId,
          ask: buildAsk(node.origin.question, node.origin.preset, node.origin.selectedText),
          origin: node.origin,
        },
        signal,
        onEvent,
      ),
    );
  };

  const stop = (id: string) => void cancel(id);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/burrows/${burrowId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { burrow: Burrow; nodes: BurrowNode[] };
      setTitle(data.burrow.title);
      setNodes(data.nodes);
    } catch (cause) {
      setLoadError(reason(cause));
    } finally {
      setLoading(false);
    }
  }, [burrowId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reattach to anything still running, e.g. after a refresh.
  useEffect(() => {
    for (const node of nodes) {
      if (node.status === "pending" && !controllers.current.has(node.id)) {
        void track(node.id, (signal, onEvent) => attachApi(node.id, signal, onEvent));
      }
    }
  }, [nodes]);

  useEffect(() => {
    const active = controllers.current;
    return () => active.forEach((controller) => controller.abort());
  }, []);

  return { title, nodes, progress, loading, loadError, reload: load, ask, followUp, retry, stop };
}
