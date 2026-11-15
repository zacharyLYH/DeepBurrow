import type { Event, Hole, Node } from "./types.ts";

const T = 1_760_000_000_000;

export const fixtureHole: Hole = {
  id: "hole_fixture",
  userId: "user_fixture",
  title: "TCP congestion control",
  createdAt: T,
  updatedAt: T,
};

export const fixtureNodes: Node[] = [
  {
    id: "node_root",
    holeId: fixtureHole.id,
    parentId: null,
    title: "TCP congestion control",
    markdown:
      "TCP avoids collapse by probing for available bandwidth, then backing off when loss signals congestion.",
    origin: { question: "How does TCP congestion control work?" },
    sources: [{ title: "RFC 5681", url: "https://www.rfc-editor.org/rfc/rfc5681" }],
    followups: ["Why double per RTT in slow start?"],
    status: "answered",
    createdAt: T,
    updatedAt: T,
  },
];

export const fixtureEvents: Event[] = [
  { nodeId: "node_root", type: "node.pending" },
  {
    nodeId: "node_root",
    type: "node.meta",
    title: "TCP congestion control",
    sources: [{ title: "RFC 5681", url: "https://www.rfc-editor.org/rfc/rfc5681" }],
    followups: ["Why double per RTT in slow start?"],
  },
  { nodeId: "node_root", type: "node.token", text: "TCP avoids collapse " },
  { nodeId: "node_root", type: "node.token", text: "by probing for available bandwidth." },
  { nodeId: "node_root", type: "node.done" },
];
