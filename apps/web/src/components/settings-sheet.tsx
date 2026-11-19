import { useState } from "react";
import type { Preset } from "@deepburrow/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { apiFetch } from "@/lib/api";
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

function Account({
  email,
  onSignOut,
}: {
  email: string;
  onSignOut: (notice?: string) => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const change = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Could not change password");
        return;
      }
      onSignOut("Password changed. Sign in again.");
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Row label="Email">
        <span data-testid="account-email" className="text-xs text-muted-foreground">
          {email}
        </span>
      </Row>
      <Row label="Session">
        <Button data-testid="sign-out" size="xs" variant="outline" onClick={() => onSignOut()}>
          Sign out
        </Button>
      </Row>
      <form onSubmit={change} className="space-y-2 pt-2">
        <Input
          aria-label="Current password"
          data-testid="current-password"
          type="password"
          autoComplete="current-password"
          placeholder="Current password"
          required
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          className="h-8 text-xs"
        />
        <Input
          aria-label="New password"
          data-testid="new-password"
          type="password"
          autoComplete="new-password"
          placeholder="New password (10+ characters)"
          minLength={10}
          required
          value={next}
          onChange={(event) => setNext(event.target.value)}
          className="h-8 text-xs"
        />
        {error && (
          <p data-testid="password-error" role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <Button data-testid="change-password" size="xs" variant="outline" disabled={busy}>
          {busy ? "Changing…" : "Change password"}
        </Button>
      </form>
    </>
  );
}

export function SettingsSheet({
  open,
  onClose,
  user,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  user: { id: string; email: string };
  onSignOut: (notice?: string) => void;
}) {
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

          <section>
            <h3>Account</h3>
            <Account email={user.email} onSignOut={onSignOut} />
          </section>
        </div>

        <footer className="db-sheet-foot">DeepBurrow {__APP_VERSION__}</footer>
      </SheetContent>
    </Sheet>
  );
}
