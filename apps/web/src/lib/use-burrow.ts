import { useCallback, useEffect, useRef, useState } from "react";
import {
  titleFromAsk,
  type Burrow,
  type Event,
  type Node as BurrowNode,
  type Origin,
  type Preset,
} from "@deepburrow/types";
import { buildAsk } from "./ask";
import { streamAsk } from "./stream";

type AskArgs = {
  parentId: string | null;
  question: string;
  preset?: Preset;
  selectedText?: string;
};

const titleOf = (origin: Origin) =>
  titleFromAsk(origin.question) || origin.preset?.label || "New branch";

export function useBurrow(burrowId: string) {
  const [nodes, setNodes] = useState<BurrowNode[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const controllers = useRef(new Map<string, AbortController>());

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
      setLoadError(cause instanceof Error ? cause.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [burrowId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const active = controllers.current;
    return () => active.forEach((controller) => controller.abort());
  }, []);

  const patchNode = (id: string, next: Partial<BurrowNode>) =>
    setNodes((current) => current.map((node) => (node.id === id ? { ...node, ...next } : node)));

  const createNode = (id: string, args: AskArgs, origin: Origin): BurrowNode => ({
    id,
    burrowId: nodes[0]?.burrowId ?? "",
    parentId: args.parentId,
    title: titleOf(origin),
    markdown: "",
    origin,
    sources: [],
    followups: [],
    status: "pending",
    error: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const applyEvent = (id: string, event: Event) => {
    switch (event.type) {
      case "node.pending":
        patchNode(id, { status: "pending" });
        break;
      case "node.meta":
        patchNode(id, { title: event.title, sources: event.sources, followups: event.followups });
        break;
      case "node.token":
        setNodes((current) =>
          current.map((node) =>
            node.id === id
              ? { ...node, status: "streaming", markdown: node.markdown + event.text }
              : node,
          ),
        );
        break;
      case "node.done":
        patchNode(id, { status: "answered" });
        break;
      case "node.error":
        patchNode(id, { status: "failed", error: event.reason });
        break;
    }
  };

  const startStream = async (args: AskArgs & { nodeId?: string }) => {
    const origin: Origin = {
      question: args.question.trim(),
      preset: args.preset,
      selectedText: args.selectedText,
    };
    const controller = new AbortController();
    let id = args.nodeId;

    if (id) {
      controllers.current.get(id)?.abort();
      controllers.current.set(id, controller);
      patchNode(id, {
        status: "pending",
        markdown: "",
        sources: [],
        followups: [],
        error: "",
        title: titleOf(origin),
      });
    }

    try {
      await streamAsk(
        {
          nodeId: args.nodeId,
          parentId: args.parentId,
          ask: buildAsk(origin.question, args.preset, args.selectedText),
          origin,
        },
        controller.signal,
        (event) => {
          const eventId = event.nodeId;
          if (!id) {
            id = eventId;
            controllers.current.set(eventId, controller);
            setNodes((current) => [...current, createNode(eventId, args, origin)]);
          }
          if (eventId === id) applyEvent(eventId, event);
        },
      );
      if (id) {
        setNodes((current) =>
          current.map((node) =>
            node.id === id && (node.status === "pending" || node.status === "streaming")
              ? { ...node, status: "failed", error: "Stream ended" }
              : node,
          ),
        );
      }
    } catch (error) {
      if (!id || controllers.current.get(id) !== controller) return;
      if (controller.signal.aborted) {
        patchNode(id, { status: "stopped" });
      } else {
        patchNode(id, {
          status: "failed",
          error: error instanceof Error ? error.message : "Failed",
        });
      }
    } finally {
      if (id && controllers.current.get(id) === controller) controllers.current.delete(id);
    }
  };

  const ask = (parentId: string, question: string, preset?: Preset, selectedText?: string) =>
    startStream({ parentId, question, preset, selectedText });

  const followUp = (id: string, preset?: Preset, text?: string) => {
    const question = (text ?? drafts[id] ?? "").trim();
    if (!question && !preset) return;
    setDrafts((current) => ({ ...current, [id]: "" }));
    void startStream({ parentId: id, question, preset });
  };

  const retry = (id: string) => {
    const node = nodes.find((item) => item.id === id);
    if (!node) return;
    void startStream({
      nodeId: id,
      parentId: node.parentId,
      question: node.origin.question,
      preset: node.origin.preset,
      selectedText: node.origin.selectedText,
    });
  };

  const stop = (id: string) => controllers.current.get(id)?.abort();

  const fillDraft = (id: string, text: string) =>
    setDrafts((current) => ({ ...current, [id]: text }));

  return { title, nodes, drafts, loading, loadError, reload: load, ask, followUp, retry, stop, fillDraft };
}
