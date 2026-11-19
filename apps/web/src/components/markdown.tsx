import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Button } from "@/components/ui/button";
import { createStore, useStore } from "@/lib/store";

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => setDone(false), 1200);
    return () => window.clearTimeout(timer);
  }, [done]);

  return (
    <Button
      size="xs"
      variant="ghost"
      className="db-code-copy"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setDone(true);
      }}
    >
      {done ? "Copied" : "Copy"}
    </Button>
  );
}

// highlight.js is imported on first fenced block, so first paint stays small.
function CodeBlock({ lang, source }: { lang?: string; source: string }) {
  const [html, setHtml] = useState("");

  useEffect(() => {
    setHtml("");
    if (!lang) return;
    let live = true;
    void import("highlight.js/lib/common").then((module) => {
      const hljs = module.default;
      if (!live || !hljs.getLanguage(lang)) return;
      setHtml(hljs.highlight(source, { language: lang }).value);
    });
    return () => {
      live = false;
    };
  }, [lang, source]);

  return (
    <div data-testid="code-block" className="db-code">
      <div className="db-code-head">
        <span>{lang ?? "text"}</span>
        <CopyButton text={source} />
      </div>
      <pre>
        <code
          className={`hljs language-${lang ?? "text"}`}
          {...(html ? { dangerouslySetInnerHTML: { __html: html } } : { children: source })}
        />
      </pre>
    </div>
  );
}

// Mermaid renders after mount; a broken fence keeps its source and one error line.
function Mermaid({ source }: { source: string }) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setSvg("");
    setError("");
    void (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: document.documentElement.dataset.theme === "dark" ? "dark" : "neutral",
        });
        const out = await mermaid.render(`mmd${raw}`, source);
        if (live) setSvg(out.svg);
      } catch (cause) {
        if (live) setError(cause instanceof Error ? cause.message.split("\n")[0] : "Diagram failed");
      }
    })();
    return () => {
      live = false;
    };
  }, [source, raw]);

  return (
    <div data-testid="mermaid">
      {svg ? (
        <div className="db-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <CodeBlock lang="mermaid" source={source} />
      )}
      {error && <p className="db-mermaid-error">Diagram failed: {error}</p>}
    </div>
  );
}

// The enlarged image lives outside the React tree: cards re-render constantly
// while streaming, so per-image state cannot hold the overlay.
const lightbox = createStore<{ src: string; alt: string } | null>(null);

const openLightbox = (src: string, alt: string) => lightbox.set({ src, alt });
const closeLightbox = () => lightbox.set(null);

function Picture({ src, alt }: { src?: string; alt?: string }) {
  const pressed = useRef<{ x: number; y: number } | null>(null);
  if (!src) return <span>{alt}</span>;
  return (
    // Click, not pointerdown: a scroll or drag that starts on an image must not
    // throw up the lightbox. Keyboard activation has no pointerdown and opens.
    <button
      type="button"
      className="db-image"
      onPointerDown={(event) => {
        pressed.current = { x: event.clientX, y: event.clientY };
      }}
      onClick={(event) => {
        const from = pressed.current;
        pressed.current = null;
        if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > 8) return;
        openLightbox(src, alt ?? "");
      }}
    >
      {/* Not lazy: cards clip their body, so the browser never considers the
          image on screen and it would stay an unclickable stub. */}
      <img src={src} alt={alt ?? ""} />
    </button>
  );
}

export function Lightbox() {
  const open = useStore(lightbox);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div
      data-testid="lightbox"
      role="dialog"
      aria-label={open.alt || "Image"}
      className="db-lightbox"
      onPointerDown={closeLightbox}
    >
      <img src={open.src} alt={open.alt} />
      <button
        type="button"
        data-testid="close-lightbox"
        aria-label="Close image"
        className="db-lightbox-close"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={closeLightbox}
      >
        ×
      </button>
    </div>,
    document.body,
  );
}

const components: Components = {
  // Fenced blocks render their own <pre>, so drop the wrapper react-markdown adds.
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const lang = /language-(\w+)/.exec(className ?? "")?.[1];
    const source = String(children ?? "").replace(/\n$/, "");
    if (lang === "mermaid") return <Mermaid source={source} />;
    if (lang) return <CodeBlock lang={lang} source={source} />;
    return <code className="db-inline-code">{children}</code>;
  },
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="db-link">
      {children}
    </a>
  ),
  img: ({ src, alt }) => <Picture src={typeof src === "string" ? src : undefined} alt={alt} />,
};

export function Markdown({ text }: { text: string }) {
  const hasMath = useMemo(() => /\$[^$\n]/.test(text), [text]);

  // KaTeX styling ships with the first math, not the first paint.
  useEffect(() => {
    if (hasMath) void import("katex/dist/katex.min.css");
  }, [hasMath]);

  return (
    <div className="db-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function Skeleton({ children }: { children?: ReactNode }) {
  return (
    <div data-testid="skeleton" className="db-skeleton">
      {children}
      <span className="db-skeleton-line w-11/12" />
      <span className="db-skeleton-line w-full" />
      <span className="db-skeleton-line w-9/12" />
    </div>
  );
}
