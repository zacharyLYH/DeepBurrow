export type NodeStatus = "pending" | "streaming" | "answered" | "failed";

export type Source = { title: string; url: string };

export type Preset = { label: string; instruction: string };

export type Origin = {
  question: string;
  selectedText?: string;
  preset?: Preset;
  anchor?: string;
};

export type Burrow = {
  id: string;
  userId: string;
  title: string;
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
  createdAt: number;
  updatedAt: number;
};

export type State = {
  burrowId: string;
  nodeId: string;
  lineage: string;
  ask: string;
  gaps: string[];
  round: number;
  queries: string[];
  searchRaw: string;
  notes: string;
  answer: string;
  title: string;
  sources: Source[];
  followups: string[];
  error: string | null;
};

export type Meta = { title: string; sources: Source[]; followups: string[] };

export type Event = { nodeId: string } & (
  | { type: "node.pending" }
  | ({ type: "node.meta" } & Meta)
  | { type: "node.token"; text: string }
  | { type: "node.done" }
  | { type: "node.error"; reason: string }
);
