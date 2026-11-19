import type { Viewport } from "../../../packages/types/src/types.ts";

export const isCoords = (value: unknown): value is { x: number; y: number } => {
  if (typeof value !== "object" || value === null) return false;
  const { x, y } = value as { x?: unknown; y?: unknown };
  return typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y);
};

export const isViewport = (value: unknown): value is Viewport =>
  isCoords(value) && Number.isFinite((value as Viewport).zoom);
