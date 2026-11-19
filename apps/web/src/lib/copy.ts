import type { Node as BurrowNode } from "@deepburrow/types";

const sources = (node: BurrowNode) =>
  node.sources.length
    ? `\n\nSources\n${node.sources.map((source) => `- [${source.title}](${source.url})`).join("\n")}`
    : "";

const quote = (node: BurrowNode) =>
  node.origin.selectedText ? `> ${node.origin.selectedText.replace(/\n/g, " ")}\n\n` : "";

// Raw Markdown, not rendered DOM: what the model stored is what gets copied.
export const cardMarkdown = (node: BurrowNode) =>
  [`## ${node.title}`, "", quote(node) + node.markdown.trim(), sources(node)]
    .join("\n")
    .trim();
