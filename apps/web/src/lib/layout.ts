import type { Node as BurrowNode } from "@deepburrow/types";

export const CARD_WIDTH = 320;
// Flow seed for the camera and first paint; cards paint their own height.
export const CARD_HEIGHT = 240;

// Shift-drag carries these ids. Not a server concept: derived from the rows.
export function descendantsOf(nodes: BurrowNode[], id: string): string[] {
  const kids = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    kids.set(node.parentId, [...(kids.get(node.parentId) ?? []), node.id]);
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
