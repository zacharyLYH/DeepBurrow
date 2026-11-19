import { useState } from "react";
import type { Preset } from "@deepburrow/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DEFAULT_PRESETS,
  MAX_READING,
  MIN_READING,
  clampReading,
  setSettings,
  useSettings,
  type Surface,
} from "@/lib/settings";

const SURFACES: { value: Surface; label: string }[] = [
  { value: "selection", label: "Selection" },
  { value: "followUp", label: "Follow-up" },
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="db-setting-row">
      <span className="db-setting-label">{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function PresetEditor() {
  const settings = useSettings();
  const [tab, setTab] = useState<Surface>("selection");
  // Linked sets are one list: edit either tab and both move together.
  const linked = settings.presets.link;
  const list = linked ? settings.presets.selection : settings.presets[tab];

  const save = (next: Preset[]) =>
    setSettings({
      presets: linked
        ? { ...settings.presets, selection: next, followUp: next }
        : { ...settings.presets, [tab]: next },
    });
  const edit = (index: number, patch: Partial<Preset>) =>
    save(list.map((preset, at) => (at === index ? { ...preset, ...patch } : preset)));

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {SURFACES.map((item) => (
          <Button
            key={item.value}
            data-testid={`preset-tab-${item.value}`}
            size="xs"
            variant={tab === item.value ? "default" : "outline"}
            onClick={() => setTab(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {list.map((preset, index) => (
        <div key={index} className="db-preset-row">
          <Input
            aria-label="Preset label"
            data-testid={`preset-label-${tab}-${index}`}
            value={preset.label}
            onChange={(event) => edit(index, { label: event.target.value })}
            className="h-7 w-28 text-xs"
          />
          <Input
            aria-label="Preset instruction"
            data-testid={`preset-instruction-${tab}-${index}`}
            value={preset.instruction}
            onChange={(event) => edit(index, { instruction: event.target.value })}
            className="h-7 flex-1 text-xs"
          />
          <Button
            aria-label="Remove preset"
            data-testid={`preset-remove-${tab}-${index}`}
            size="xs"
            variant="ghost"
            onClick={() => save(list.filter((_, at) => at !== index))}
          >
            ×
          </Button>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <Button
          data-testid="preset-add"
          size="xs"
          variant="outline"
          onClick={() => save([...list, { label: "New", instruction: "Ask about this differently." }])}
        >
          + Add preset
        </Button>
        <Button
          data-testid="preset-reset"
          size="xs"
          variant="ghost"
          onClick={() => save(DEFAULT_PRESETS[linked ? "selection" : tab])}
        >
          Reset set
        </Button>
      </div>

      <label className="db-setting-row cursor-pointer">
        <span className="db-setting-label">Link sets</span>
        <input
          type="checkbox"
          data-testid="preset-link"
          checked={settings.presets.link}
          onChange={(event) => setSettings({ presets: { ...settings.presets, link: event.target.checked } })}
        />
      </label>
    </div>
  );
}

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useSettings();

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent data-testid="settings" aria-describedby={undefined} aria-label="Settings">
        <header className="db-sheet-head">
          <SheetTitle className="text-sm font-semibold">Settings</SheetTitle>
          <SheetClose asChild>
            <Button aria-label="Close settings" data-testid="close-settings" size="xs" variant="ghost">
              ×
            </Button>
          </SheetClose>
        </header>

        <div className="db-sheet-body">
          <section>
            <h3>Appearance</h3>
            <Row label="Theme">
              {(["light", "dark"] as const).map((theme) => (
                <Button
                  key={theme}
                  data-testid={`theme-${theme}`}
                  size="xs"
                  variant={settings.theme === theme ? "default" : "outline"}
                  className="capitalize"
                  onClick={() => setSettings({ theme })}
                >
                  {theme}
                </Button>
              ))}
            </Row>
            <Row label={`Reading size · ${settings.readingSize.toFixed(1)}×`}>
              <Button
                aria-label="Decrease reading size"
                data-testid="reading-down"
                size="xs"
                variant="outline"
                onClick={() => setSettings({ readingSize: clampReading(settings.readingSize - 0.1) })}
              >
                −
              </Button>
              <Button
                aria-label="Reset reading size"
                data-testid="reading-reset"
                size="xs"
                variant="ghost"
                onClick={() => setSettings({ readingSize: 1 })}
              >
                1.0×
              </Button>
              <Button
                aria-label="Increase reading size"
                data-testid="reading-up"
                size="xs"
                variant="outline"
                disabled={settings.readingSize >= MAX_READING}
                onClick={() => setSettings({ readingSize: clampReading(settings.readingSize + 0.1) })}
              >
                +
              </Button>
              <span className="db-hint">
                {MIN_READING}–{MAX_READING}
              </span>
            </Row>
          </section>

          <section>
            <h3>Asking</h3>
            <PresetEditor />
          </section>
        </div>

        <footer className="db-sheet-foot">DeepBurrow {__APP_VERSION__}</footer>
      </SheetContent>
    </Sheet>
  );
}
