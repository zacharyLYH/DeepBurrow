import { useEffect, useEffectEvent } from "react";

export type Shortcuts = {
  palette: () => void;
  help: () => void;
  escape: () => void;
};

const TYPING = ["INPUT", "TEXTAREA", "SELECT"];

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (TYPING.includes(target.tagName) || target.isContentEditable);

// Global keys. Escape wins everywhere; bare letters stay out of text fields.
export function useShortcuts(shortcuts: Shortcuts) {
  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      shortcuts.palette();
      return;
    }
    if (event.key === "Escape") {
      shortcuts.escape();
      return;
    }
    if (isTyping(event.target)) return;
    // Bare letters only: Cmd+T, Ctrl+T etc. belong to the browser.
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "?") {
      event.preventDefault();
      shortcuts.help();
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);
}
