export type NodeStatus = "pending" | "answered" | "stopped" | "failed";

export type Source = { title: string; url: string };

export type Preset = { label: string; instruction: string };

export type Origin = {
  question: string;
  selectedText?: string;
  preset?: Preset;
};

// React Flow flow coordinates: top-left of the card, independent of pan and zoom.
export type Coords = { x: number; y: number };
export type Viewport = Coords & { zoom: number };

export type Burrow = {
  id: string;
  userId: string;
  title: string;
  viewport: Viewport;
  createdAt: number;
  updatedAt: number;
};

export type Node = {
  id: string;
  burrowId: string;
  parentId: string | null;
  title: string;
  markdown: string;
  origin: Origin;
  sources: Source[];
  followups: string[];
  status: NodeStatus;
  error: string;
  position: Coords;
  createdAt: number;
  updatedAt: number;
};

export type Meta = { title: string; sources: Source[]; followups: string[] };

export type Event = { nodeId: string } & (
  | { type: "node.pending"; node: Node }
  | ({ type: "node.meta" } & Meta)
  | { type: "node.progress"; line: string }
  | { type: "node.token"; text: string }
  | { type: "node.done"; node: Node }
  | { type: "node.error"; node: Node }
);
