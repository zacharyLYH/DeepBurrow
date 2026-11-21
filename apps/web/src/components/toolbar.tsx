import { useReactFlow, useViewport } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { toggleTheme, useSettings } from "@/lib/settings";

function ThemeIcon({ dark }: { dark: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden
    >
      {dark ? (
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      ) : (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      )}
    </svg>
  );
}

type Props = {
  onFit: () => void;
  onSettings: () => void;
  onPalette: () => void;
  onShortcuts: () => void;
  onExport: () => void;
  canExport: boolean;
};

function Sep() {
  return <span className="db-toolbar-sep" aria-hidden />;
}

export function Toolbar({
  onFit,
  onSettings,
  onPalette,
  onShortcuts,
  onExport,
  canExport,
}: Props) {
  const { zoomIn, zoomOut, zoomTo } = useReactFlow();
  const { zoom } = useViewport();
  const settings = useSettings();

  return (
    <div data-testid="toolbar" className="db-toolbar">
      <div className="db-toolbar-group">
        <SidebarTrigger />
        <Button aria-label="Zoom out" title="Zoom out" size="xs" variant="ghost" onClick={() => void zoomOut({ duration: 150 })}>
          −
        </Button>
        <Button
          aria-label="Reset zoom"
          title="Reset zoom to 100%"
          data-testid="zoom-percent"
          size="xs"
          variant="ghost"
          className="tabular-nums"
          onClick={() => void zoomTo(1, { duration: 200 })}
        >
          {Math.round(zoom * 100)}%
        </Button>
        <Button aria-label="Zoom in" title="Zoom in" size="xs" variant="ghost" onClick={() => void zoomIn({ duration: 150 })}>
          +
        </Button>
        <Sep />
        <Button aria-label="Fit" title="Fit to screen" size="xs" variant="ghost" onClick={onFit}>
          Fit
        </Button>
      </div>

      <div className="db-toolbar-group">
        <Button
          aria-label="Export as HTML"
          title="Download a standalone HTML document"
          data-testid="export"
          size="xs"
          variant="ghost"
          disabled={!canExport}
          onClick={onExport}
        >
          Export
        </Button>
        <Button
          aria-label="Palette"
          title="Search and commands (⌘K)"
          data-testid="open-palette"
          size="xs"
          variant="ghost"
          onClick={onPalette}
        >
          ⌘K
        </Button>
        <Button
          aria-label="Toggle theme"
          title={settings.theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          data-testid="theme-toggle"
          data-theme-value={settings.theme}
          size="xs"
          variant="ghost"
          onClick={toggleTheme}
        >
          <ThemeIcon dark={settings.theme === "dark"} />
        </Button>
        <Button aria-label="Shortcuts" title="Keyboard shortcuts (?)" size="xs" variant="ghost" onClick={onShortcuts}>
          ?
        </Button>
        <Button
          aria-label="Settings"
          title="Settings"
          data-testid="open-settings"
          size="xs"
          variant="ghost"
          onClick={onSettings}
        >
          ⚙
        </Button>
      </div>
    </div>
  );
}
