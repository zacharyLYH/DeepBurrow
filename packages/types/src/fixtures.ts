import { NODE_STEP } from "./layout.ts";
import { DEFAULT_VIEWPORT, type Burrow, type Node } from "./types.ts";

const T = 1_760_000_000_000;

// Local/test fixture only; the suite seeds this account before each test.
export const demoCredentials = {
  email: "demo@deepburrow.dev",
  password: "deepburrow-demo-password",
};

// Positions are server-owned: the app never recomputes layout on load.
const ROW = NODE_STEP;

export const fixtureBurrow: Burrow = {
  id: "burrow_fixture",
  userId: "user_fixture",
  title: "TCP congestion control",
  // Wide enough to show the whole seeded row on a laptop without panning.
  viewport: { x: 60, y: 140, zoom: 0.8 },
  createdAt: T,
  updatedAt: T,
};

// The demo account owns several burrows; only the first has cards.
export const fixtureBurrows: Burrow[] = [
  fixtureBurrow,
  {
    id: "burrow_second",
    userId: "user_fixture",
    title: "QUIC transport",
    viewport: { ...DEFAULT_VIEWPORT },
    createdAt: T + 10,
    updatedAt: T + 10,
  },
  {
    id: "burrow_third",
    userId: "user_fixture",
    title: "BBR vs CUBIC",
    viewport: { ...DEFAULT_VIEWPORT },
    createdAt: T + 20,
    updatedAt: T + 20,
  },
];

export const fixtureNodes: Node[] = [
  {
    id: "node_root",
    burrowId: fixtureBurrow.id,
    parentId: null,
    title: "TCP congestion control",
    markdown:
      "TCP avoids collapse by probing for available bandwidth, then backing off when loss signals congestion.",
    origin: { question: "How does TCP congestion control work?" },
    sources: [{ title: "RFC 5681", url: "https://www.rfc-editor.org/rfc/rfc5681" }],
    followups: ["Why double per RTT in slow start?"],
    status: "answered",
    error: "",
    position: { x: 0, y: 0 },
    createdAt: T,
    updatedAt: T,
  },
  {
    id: "node_why",
    burrowId: fixtureBurrow.id,
    parentId: "node_root",
    title: "Why double per RTT?",
    markdown:
      "Each ACK acknowledges two segments once the pipe is full, so the window grows by one per ACK. One RTT of ACKs doubles the window.",
    origin: { question: "Why does slow start double per RTT?" },
    sources: [],
    followups: [],
    status: "answered",
    error: "",
    position: { x: ROW, y: 0 },
    createdAt: T + 1,
    updatedAt: T + 1,
  },
  {
    id: "node_cubic",
    burrowId: fixtureBurrow.id,
    parentId: "node_root",
    title: "When does CUBIC win?",
    markdown:
      "On high bandwidth-delay product links CUBIC's cubic growth curve refills the window faster after loss, especially on long fat networks.",
    origin: { question: "When does CUBIC beat Reno?" },
    sources: [],
    followups: [],
    status: "answered",
    error: "",
    position: { x: ROW * 2, y: 0 },
    createdAt: T + 2,
    updatedAt: T + 2,
  },
  {
    id: "node_long",
    burrowId: fixtureBurrow.id,
    parentId: "node_root",
    title: "TCP vs QUIC congestion",
    markdown:
      "QUIC runs congestion control in userspace, so it can iterate faster than kernel TCP. It reuses the same Reno and CUBIC ideas but ships new algorithms with the application.\n\nLoss detection differs. QUIC uses packet numbers that never repeat, so it avoids TCP's retransmission ambiguity and can distinguish a lost ACK from a lost packet without waiting for a timeout.\n\nHead-of-line blocking moves to the stream level. A lost packet stalls only the stream it belongs to, not every multiplexed request sharing the connection.\n\nHandshakes fold transport and crypto together. One round trip establishes keys and congestion state, and zero round trip resumes are possible after a prior connection.\n\nMigration keeps the connection alive across network changes. A phone switching from Wi-Fi to cellular can continue without tearing down congestion state, because the connection is identified by an ID rather than the address tuple.\n\nDeployment still needs a fallback. Middleboxes can drop unfamiliar UDP, so browsers race QUIC against TCP and keep the winner, which means both stacks must stay healthy.",
    origin: { question: "How does QUIC congestion control differ from TCP?" },
    sources: [],
    followups: [],
    status: "answered",
    error: "",
    position: { x: ROW * 3, y: 0 },
    createdAt: T + 3,
    updatedAt: T + 3,
  },
];
