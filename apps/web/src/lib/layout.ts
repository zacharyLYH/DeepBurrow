import type { Node as BurrowNode } from "@deepburrow/types";

// Re-exported so canvas, cards and camera read one geometry source.
export { CARD_HEIGHT, CARD_WIDTH } from "@deepburrow/types";

// Shift-drag carries these ids. Not a server concept: derived from the rows.
export function descendantsOf(nodes: BurrowNode[], id: string): string[] {
  const kids = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const children = kids.get(node.parentId);
    if (children) children.push(node.id);
    else kids.set(node.parentId, [node.id]);
  }
  const out: string[] = [];
  const walk = (parent: string) => {
    for (const child of kids.get(parent) ?? []) {
      out.push(child);
      walk(child);
    }
  };
  walk(id);
  return out;
}
