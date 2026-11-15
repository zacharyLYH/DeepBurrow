export type Position = { x: number; y: number };

const WIDTH = 320;
const HEIGHT = 172;
const GAP_X = 56;
const GAP_Y = 88;

export function layoutTree(
  nodes: { id: string; parentId: string | null }[],
  compact = false,
): Record<string, Position> {
  const ids = new Set(nodes.map((node) => node.id));
  const children = new Map<string, string[]>();
  const roots: string[] = [];

  for (const node of nodes) {
    if (node.parentId && ids.has(node.parentId)) {
      children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.id]);
    } else {
      roots.push(node.id);
    }
  }

  const positions: Record<string, Position> = {};
  let cursor = 0;

  if (compact) {
    const stack = (id: string) => {
      positions[id] = { x: 0, y: cursor };
      cursor += HEIGHT + GAP_Y;
      (children.get(id) ?? []).forEach(stack);
    };
    roots.forEach(stack);
    return positions;
  }

  const place = (id: string, depth: number): number => {
    const kids = children.get(id) ?? [];
    const y = depth * (HEIGHT + GAP_Y);
    if (kids.length === 0) {
      positions[id] = { x: cursor, y };
      const center = cursor + WIDTH / 2;
      cursor += WIDTH + GAP_X;
      return center;
    }
    const centers = kids.map((kid) => place(kid, depth + 1));
    const center = (centers[0] + centers[centers.length - 1]) / 2;
    positions[id] = { x: center - WIDTH / 2, y };
    return center;
  };

  roots.forEach((root) => place(root, 0));
  return positions;
}
