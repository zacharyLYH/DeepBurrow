import { parseEvent } from "../packages/types/src/header.ts";
import type { Event } from "../packages/types/src/types.ts";

export const parseEvents = (text: string) =>
  text
    .split("\n\n")
    .filter(Boolean)
    .map((chunk) => parseEvent(JSON.parse(chunk.replace(/^data: /, ""))) as Event);
