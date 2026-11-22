import { useEffect, useState } from "react";
import type { Preset, ProviderSummary } from "@deepburrow/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
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

type ProviderKind = "model" | "search";
type ProviderField = "baseUrl" | "model" | "apiKey";

const EMPTY_FORM: Record<ProviderField, string> = { baseUrl: "", model: "", apiKey: "" };
const PROVIDER_FIELDS: {
  key: ProviderField;
  testId: string;
  type: "url" | "text" | "password";
  placeholder: string;
}[] = [
  { key: "baseUrl", testId: "base-url", type: "url", placeholder: "https://openrouter.ai/api/v1" },
  { key: "model", testId: "model", type: "text", placeholder: "Model name" },
  { key: "apiKey", testId: "api-key", type: "password", placeholder: "API key" },
];

// Model and search are separate providers: verify each with a small prompt,
// then store it encrypted on the user row.
function ProviderForm({
  kind,
  status,
  onSaved,
}: {
  kind: ProviderKind;
  status?: ProviderSummary;
  onSaved: (status: ProviderSummary) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch(`/api/settings/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json().catch(() => ({}))) as {
        provider?: ProviderSummary;
        error?: string;
      };
      if (!response.ok || !data.provider) {
        setError(data.error ?? "Could not verify the endpoint");
        return;
      }
      onSaved(data.provider);
      setForm(EMPTY_FORM);
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-2">
      <Row label="Status">
        <span data-testid={`${kind}-status`} className="text-xs text-muted-foreground">
          {status?.configured ? `Verified · ${status.model}` : "Not connected"}
        </span>
      </Row>
      {PROVIDER_FIELDS.map((field) => (
        <Input
          key={field.key}
          aria-label={`${kind} ${field.key}`}
          data-testid={`${kind}-${field.testId}`}
          type={field.type}
          required
          autoComplete={field.key === "apiKey" ? "off" : undefined}
          placeholder={field.placeholder}
          value={form[field.key]}
          onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
          className="h-8 text-xs"
        />
      ))}
      {error && (
        <p data-testid={`${kind}-error`} role="alert" className="break-words text-xs text-destructive">
          {error}
        </p>
      )}
      <Button data-testid={`${kind}-save`} size="xs" variant="outline" disabled={busy}>
        {busy ? "Verifying…" : "Verify & save"}
      </Button>
    </form>
  );
}

export function SettingsSheet({
  open,
  onClose,
  user,
  onSignOut,
  onModelSaved,
}: {
  open: boolean;
  onClose: () => void;
  user: { id: string; email: string };
  onSignOut: (notice?: string) => void;
  onModelSaved?: () => void;
}) {
  const settings = useSettings();
  const [providers, setProviders] = useState<Partial<Record<ProviderKind, ProviderSummary>>>({});
  const [openSections, setOpenSections] = useState<string[]>(["appearance"]);

  // One read per open. A missing model opens Providers so the fix is visible.
  useEffect(() => {
    if (!open) return;
    setOpenSections(["appearance"]);
    void apiFetch("/api/settings")
      .then((response) => response.json())
      .then((data: Record<ProviderKind, ProviderSummary>) => {
        setProviders({ model: data.model, search: data.search });
        if (!data.model?.configured) {
          setOpenSections((current) =>
            current.includes("providers") ? current : [...current, "providers"],
          );
        }
      })
      .catch(() => undefined);
  }, [open]);

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
          <Accordion
            type="multiple"
            value={openSections}
            onValueChange={setOpenSections}
            className="space-y-1"
          >
            <AccordionItem value="appearance">
              <AccordionTrigger data-testid="settings-section-appearance">Appearance</AccordionTrigger>
              <AccordionContent>
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
                    onClick={() =>
                      setSettings({ readingSize: clampReading(settings.readingSize - 0.1) })
                    }
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
                    onClick={() =>
                      setSettings({ readingSize: clampReading(settings.readingSize + 0.1) })
                    }
                  >
                    +
                  </Button>
                  <span className="db-hint">
                    {MIN_READING}–{MAX_READING}
                  </span>
                </Row>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="asking">
              <AccordionTrigger data-testid="settings-section-asking">Asking</AccordionTrigger>
              <AccordionContent>
                <PresetEditor />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="providers" data-testid="settings-providers">
              <AccordionTrigger data-testid="settings-section-providers">Providers</AccordionTrigger>
              <AccordionContent>
                <div className="flex items-center justify-between gap-2">
                  <p className="db-hint">Model generates and validates answers.</p>
                  <Badge>Required</Badge>
                </div>
                <ProviderForm
                  kind="model"
                  status={providers.model}
                  onSaved={(next) => {
                    setProviders((current) => ({ ...current, model: next }));
                    onModelSaved?.();
                  }}
                />

                <div className="mt-4 flex items-center justify-between gap-2">
                  <p className="db-hint">Search retrieves web pages as evidence for answers.</p>
                  <Badge variant="outline">Optional</Badge>
                </div>
                <ProviderForm
                  kind="search"
                  status={providers.search}
                  onSaved={(next) => setProviders((current) => ({ ...current, search: next }))}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="account">
              <AccordionTrigger data-testid="settings-section-account">Account</AccordionTrigger>
              <AccordionContent>
                <Row label="Email">
                  <span data-testid="account-email" className="text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </Row>
                <Row label="Session">
                  <Button data-testid="sign-out" size="xs" variant="outline" onClick={() => onSignOut()}>
                    Sign out
                  </Button>
                </Row>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <footer className="db-sheet-foot">DeepBurrow {__APP_VERSION__}</footer>
      </SheetContent>
    </Sheet>
  );
}
