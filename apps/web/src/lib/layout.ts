export type Position = { x: number; y: number };

export const CARD_WIDTH = 320;
export const CARD_HEIGHT = 240;
const GAP_X = 56;
const GAP_Y = 112;

export function layoutTree(
  nodes: { id: string; parentId: string | null }[],
  compact = false,
): Record<string, Position> {
  const ids = new Set(nodes.map((node) => node.id));
  const children = new Map<string, string[]>();
  const roots: string[] = [];

  for (const node of nodes) {
    if (node.parentId && ids.has(node.parentId)) {
      const siblings = children.get(node.parentId);
      if (siblings) siblings.push(node.id);
      else children.set(node.parentId, [node.id]);
    } else {
      roots.push(node.id);
    }
  }

  const positions: Record<string, Position> = {};
  let cursor = 0;

  if (compact) {
    const stack = (id: string) => {
      positions[id] = { x: 0, y: cursor };
      cursor += CARD_HEIGHT + GAP_Y;
      (children.get(id) ?? []).forEach(stack);
    };
    roots.forEach(stack);
    return positions;
  }

  const place = (id: string, depth: number): number => {
    const kids = children.get(id) ?? [];
    const y = depth * (CARD_HEIGHT + GAP_Y);
    if (kids.length === 0) {
      positions[id] = { x: cursor, y };
      const center = cursor + CARD_WIDTH / 2;
      cursor += CARD_WIDTH + GAP_X;
      return center;
    }
    const centers = kids.map((kid) => place(kid, depth + 1));
    const center = (centers[0] + centers[centers.length - 1]) / 2;
    positions[id] = { x: center - CARD_WIDTH / 2, y };
    return center;
  };

  roots.forEach((root) => place(root, 0));
  return positions;
}
