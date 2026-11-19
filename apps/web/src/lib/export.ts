// The export is a snapshot of the rendered canvas, not a data-layer format.
// It intentionally reads React Flow and card class names.

const PADDING = 40;
const CARD_MAX_HEIGHT = 620;

const ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ESCAPE[char]!);

const filename = (title: string) =>
  `${title.trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "burrow"}.html`;

const stylesheetText = () =>
  [...document.styleSheets]
    .filter((sheet) => {
      if (sheet.disabled) return false;
      return !sheet.href || new URL(sheet.href).origin === location.origin;
    })
    .flatMap((sheet) => {
      try {
        return [...sheet.cssRules].map((rule) => rule.cssText);
      } catch {
        return [];
      }
    })
    .join("\n");

const EXPORT_CSS = `
html, body { margin: 0; background: var(--background); }
.react-flow { overflow: visible !important; background: var(--background) !important; }
.react-flow__pane, .react-flow__node, .db-card-head { cursor: default !important; }
.db-card { max-width: none !important; max-height: ${CARD_MAX_HEIGHT}px !important; }
button.db-image { padding: 0; background: none; border: 0; }
html.db-js button.db-image { cursor: zoom-in; }
#db-export-tools {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 100;
  display: none;
  align-items: center;
  gap: 1px;
  padding: 3px;
  color: var(--foreground);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 999px;
  box-shadow: 0 4px 18px rgb(0 0 0 / 0.16);
}
html.db-js #db-export-tools { display: flex; }
#db-export-tools button {
  width: 30px;
  height: 30px;
  padding: 0;
  color: inherit;
  font: inherit;
  background: transparent;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
}
#db-export-tools button:hover { background: var(--accent); }
#db-export-tools #db-export-scale { width: auto; min-width: 44px; padding: 0 5px; font-variant-numeric: tabular-nums; }
#db-export-tools .sep { width: 1px; height: 16px; margin: 0 2px; background: var(--border); }
#db-export-lightbox {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4vmin;
  background: rgb(0 0 0 / 0.78);
  cursor: zoom-out;
}
#db-export-lightbox[hidden] { display: none; }
#db-export-lightbox img { max-width: 100%; max-height: 100%; border-radius: 8px; }
@media print { #db-export-tools { display: none; } }
`;

const EXPORT_TOOLS = String.raw`<div id="db-export-tools" role="group" aria-label="Document controls">
<button id="db-export-text-down" type="button" aria-label="Decrease text size" title="Decrease text size">A−</button>
<button id="db-export-text-up" type="button" aria-label="Increase text size" title="Increase text size">A+</button>
<span class="sep" aria-hidden="true"></span>
<button id="db-export-zoom-out" type="button" aria-label="Zoom out" title="Zoom out">−</button>
<button id="db-export-scale" type="button" aria-label="Reset zoom" title="Reset zoom">100%</button>
<button id="db-export-zoom-in" type="button" aria-label="Zoom in" title="Zoom in">+</button>
<span class="sep" aria-hidden="true"></span>
<button id="db-export-theme" type="button" aria-label="Toggle theme" title="Toggle theme">◐</button>
</div>
<div id="db-export-lightbox" hidden><img alt="" /></div>
<script>
(function () {
  var root = document.documentElement;
  root.classList.add("db-js");

  document.getElementById("db-export-theme").addEventListener("click", function () {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  });

  var reading = 1;
  function setReading(value) {
    reading = Math.min(1.4, Math.max(0.8, Math.round(value * 10) / 10));
    root.style.setProperty("--db-reading", (0.875 * reading).toFixed(4) + "rem");
  }
  document.getElementById("db-export-text-down").addEventListener("click", function () {
    setReading(reading - 0.1);
  });
  document.getElementById("db-export-text-up").addEventListener("click", function () {
    setReading(reading + 0.1);
  });

  var flow = document.querySelector(".react-flow");
  var viewport = document.querySelector(".react-flow__viewport");
  var nodes = document.querySelectorAll(".react-flow__node");
  if (flow && viewport && nodes.length) {
    var padding = 40;
    var boxes = [];
    nodes.forEach(function (node) {
      var hit = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(node.style.transform);
      boxes.push({ x: hit ? Number(hit[1]) : 0, y: hit ? Number(hit[2]) : 0 });
    });
    var minX = Math.min.apply(null, boxes.map(function (box) { return box.x; }));
    var minY = Math.min.apply(null, boxes.map(function (box) { return box.y; }));
    var contentWidth = flow.offsetWidth - padding * 2;
    var contentHeight = flow.offsetHeight - padding * 2;
    var zoom = 1;
    var scaleButton = document.getElementById("db-export-scale");
    function setZoom(value) {
      zoom = Math.min(2, Math.max(0.4, Math.round(value * 10) / 10));
      viewport.style.transform = "translate(" + (padding - minX * zoom) + "px, " + (padding - minY * zoom) + "px) scale(" + zoom + ")";
      flow.style.width = (contentWidth * zoom + padding * 2) + "px";
      flow.style.height = (contentHeight * zoom + padding * 2) + "px";
      scaleButton.textContent = Math.round(zoom * 100) + "%";
    }
    document.getElementById("db-export-zoom-out").addEventListener("click", function () {
      setZoom(zoom - 0.2);
    });
    document.getElementById("db-export-zoom-in").addEventListener("click", function () {
      setZoom(zoom + 0.2);
    });
    scaleButton.addEventListener("click", function () { setZoom(1); });
    setZoom(1);
  }

  var lightbox = document.getElementById("db-export-lightbox");
  var lightboxImage = lightbox.querySelector("img");
  function closeLightbox() { lightbox.hidden = true; }
  document.querySelectorAll(".db-image").forEach(function (button) {
    button.addEventListener("click", function () {
      var image = button.querySelector("img");
      if (!image) return;
      lightboxImage.src = image.src;
      lightboxImage.alt = image.alt;
      lightbox.hidden = false;
    });
  });
  lightbox.addEventListener("click", closeLightbox);
  window.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeLightbox();
  });
})();
` + "</" + "script>";

export function exportBurrowHtml(title: string) {
  const flow = document.querySelector<HTMLElement>(".react-flow");
  if (!flow) return;

  const nodes = [...flow.querySelectorAll<HTMLElement>(".react-flow__node")];
  if (!nodes.length) return;

  const boxes = nodes.map((node) => {
    const match = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(node.style.transform);
    return {
      x: match ? Number(match[1]) : 0,
      y: match ? Number(match[2]) : 0,
      w: node.offsetWidth,
      h: node.offsetHeight,
    };
  });
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.w));
  const maxY = Math.max(...boxes.map((box) => box.y + box.h));
  const width = Math.ceil(maxX - minX + PADDING * 2);
  const height = Math.ceil(maxY - minY + PADDING * 2);

  const clone = flow.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      ".db-follow-up-drawer, .db-card-actions, .db-code-copy, .react-flow__handle, .react-flow__background, .react-flow__panel, .react-flow__attribution, .react-flow__selection, .react-flow__nodesselection, .react-flow__selectionpane",
    )
    .forEach((element) => element.remove());
  for (const chip of clone.querySelectorAll('[data-testid^="chip-"]')) chip.parentElement?.remove();
  for (const image of clone.querySelectorAll("img")) {
    const src = image.getAttribute("src");
    if (src && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) {
      image.src = new URL(src, location.href).href;
    }
  }

  const viewport = clone.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewport) return;
  viewport.style.transform = `translate(${PADDING - minX}px, ${PADDING - minY}px) scale(1)`;
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.overflow = "visible";

  const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const html = `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} — DeepBurrow</title>
<style>${stylesheetText()}\n${EXPORT_CSS}</style>
</head>
<body>
${clone.outerHTML}
${EXPORT_TOOLS}
</body>
</html>`;

  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename(title);
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
