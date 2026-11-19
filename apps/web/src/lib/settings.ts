import type { Preset } from "@deepburrow/types";
import { createStore, useStore } from "./store";

export type Theme = "light" | "dark";
export type Surface = "selection" | "followUp";
export type PresetSets = { selection: Preset[]; followUp: Preset[]; link: boolean };

export type Settings = {
  theme: Theme;
  readingSize: number;
  presets: PresetSets;
};

export const DEFAULT_PRESETS: PresetSets = {
  selection: [
    { label: "Explain", instruction: "Explain this clearly for someone who knows the basics." },
    { label: "ELI5", instruction: "Explain like I'm five. Concrete, simple, no jargon." },
    { label: "Go deeper", instruction: "Go deeper: mechanisms, tradeoffs, edge cases." },
  ],
  followUp: [
    { label: "Go deeper", instruction: "Go deeper: mechanisms, tradeoffs, edge cases." },
    { label: "Example", instruction: "Give one concrete worked example." },
    { label: "Critique", instruction: "What is weakest here? Steelman the counter-case." },
  ],
  link: false,
};

export const MIN_READING = 0.8;
export const MAX_READING = 1.4;

const DEFAULTS: Settings = {
  theme: "light",
  readingSize: 1,
  presets: DEFAULT_PRESETS,
};

export const clampReading = (value: number) =>
  Math.round(Math.min(MAX_READING, Math.max(MIN_READING, value)) * 10) / 10;

export const presetsFor = (settings: Settings, surface: Surface): Preset[] =>
  settings.presets.link ? settings.presets.selection : settings.presets[surface];

export const presetFromKey = (key: string, text: string, presets: Preset[]) =>
  text.trim() ? undefined : presets[Number(key) - 1];

// Only known fields survive: a row written before a removal cannot resurrect it.
const merge = (stored: Partial<Settings> | undefined): Settings => ({
  theme: stored?.theme === "dark" ? "dark" : "light",
  readingSize: clampReading(stored?.readingSize ?? DEFAULTS.readingSize),
  presets: { ...DEFAULT_PRESETS, ...stored?.presets },
});

const apply = (settings: Settings) => {
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.style.setProperty(
    "--db-reading",
    `${(0.875 * settings.readingSize).toFixed(4)}rem`,
  );
};

const settingsStore = createStore<Settings>(DEFAULTS, apply);

let pending: number | undefined;

// Coalesce keystrokes in the preset editor into one write.
const persist = () => {
  window.clearTimeout(pending);
  pending = window.setTimeout(() => {
    void fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settingsStore.get()),
    });
  }, 250);
};

export async function loadSettings() {
  try {
    const response = await fetch("/api/settings");
    if (!response.ok) return;
    const data = (await response.json()) as { settings: Partial<Settings> };
    settingsStore.set(merge(data.settings));
  } catch {
    // Offline: defaults are still usable, edits retry on the next write.
  }
}

export function setSettings(patch: Partial<Settings>) {
  settingsStore.set({ ...settingsStore.get(), ...patch });
  persist();
}

export const toggleTheme = () =>
  setSettings({ theme: settingsStore.get().theme === "dark" ? "light" : "dark" });

export function useSettings() {
  return useStore(settingsStore);
}
