export type NodeStatus = "pending" | "answered" | "stopped" | "failed";

export type Source = { title: string; url: string };

export type Preset = { label: string; instruction: string };

export type UserSettings = {
  theme: "light" | "dark";
  readingSize: number;
  presets: { selection?: Preset[]; followUp?: Preset[]; link: boolean };
};

export type ProviderSummary = { configured: boolean; baseUrl: string; model: string };

export type Origin = {
  question: string;
  selectedText?: string;
  preset?: Preset;
};

// React Flow flow coordinates: top-left of the card, independent of pan and zoom.
export type Coords = { x: number; y: number };
export type Viewport = Coords & { zoom: number };

// Shared contract constants: the API validates with these, the UI mirrors them.
export const TITLE_MAX = 80;
export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

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
