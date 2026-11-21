import { renderToString } from "katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { parseHeader } from "../../../packages/types/src/header.ts";

type MdNode = {
  type: string;
  value?: string;
  url?: string;
  lang?: string | null;
  children?: MdNode[];
};

// Same parser chain the renderer uses, so the check sees the document as it will render.
const markdown = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
const FENCES = /^```/gm;
const WEB_URL = /^(https?:\/\/|\/)/;

const flatten = (node: MdNode): MdNode[] =>
  (node.children ?? []).flatMap((child) => [child, ...flatten(child)]);

const reason = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).split("\n")[0];

export async function validateAnswer(raw: string, evidence: ReadonlySet<string> = new Set()) {
  const { meta, body } = parseHeader(raw);
  const errors: string[] = [];

  if (!meta.title.trim()) errors.push("TITLE is missing");
  if (meta.followups.length < 2 || meta.followups.length > 3) {
    errors.push("FOLLOWUPS must list 2–3 questions");
  }
  if (!body.trim()) errors.push("Answer body is empty");
  if ((body.match(FENCES) ?? []).length % 2) errors.push("Unclosed code fence");

  let tree: MdNode = { type: "root" };
  try {
    tree = markdown.parse(body) as MdNode;
  } catch (error) {
    errors.push(`Markdown error: ${reason(error)}`);
  }
  const nodes = flatten(tree);
  if (tree.children?.length === 1 && tree.children[0].type === "code") {
    errors.push("Answer is wrapped in one code block");
  }

  const mermaid = body.includes("```mermaid") ? (await import("mermaid")).default : null;
  for (const node of nodes) {
    if (node.type === "inlineMath" || node.type === "math") {
      try {
        renderToString(node.value ?? "", { throwOnError: true, displayMode: node.type === "math" });
      } catch (error) {
        errors.push(`Math error: ${reason(error)}`);
      }
    }
    if (mermaid && node.type === "code" && node.lang === "mermaid") {
      try {
        await mermaid.parse(node.value ?? "");
      } catch (error) {
        errors.push(`Mermaid error: ${reason(error)}`);
      }
    }
    if ((node.type === "link" || node.type === "image" || node.type === "definition") && node.url) {
      if (!WEB_URL.test(node.url)) errors.push(`Answer link is not HTTP(S): ${node.url}`);
      else if (evidence.size && node.url.startsWith("http") && !evidence.has(node.url)) {
        errors.push(`Answer link is not in the search results: ${node.url}`);
      }
    }
  }

  return { meta, body, errors };
}
