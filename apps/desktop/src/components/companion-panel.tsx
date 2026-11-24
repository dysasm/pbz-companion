import {
  Archive,
  Compass,
  FolderOpen,
  Moon,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  SlidersHorizontal,
  Sun,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { pickSaveFile } from '@/lib/api';
import { formatEpochMs, formatPbzStamp } from '@/lib/format';
import { type PanelTab, useApp } from '@/lib/store';
import { cn } from '@/lib/utils';
import { ChroniclePanel } from '@/panels/chronicle-panel';
import { CompletionPanel } from '@/panels/completion-panel';
import { LayersPanel } from '@/panels/layers-panel';
import { QuestsPanel } from '@/panels/quests-panel';

const TABS: Array<{ id: PanelTab; label: string }> = [
  { id: 'completion', label: 'Completion' },
  { id: 'chronicle', label: 'Chronicle' },
  { id: 'quests', label: 'Quests' },
  { id: 'layers', label: 'Layers' },
];

export function CompanionPanel() {
  const save = useApp((s) => s.save);
  const scan = useApp((s) => s.scan);
  const scanning = useApp((s) => s.scanning);
  const world = useApp((s) => s.world);
  const overview = useApp((s) => s.overview);
  const pending = useApp((s) => s.pending);

  const workspaceMode = useApp((s) => s.workspaceMode);
  const setWorkspaceMode = useApp((s) => s.setWorkspaceMode);
  const setEditorTab = useApp((s) => s.setEditorTab);
  const panelTab = useApp((s) => s.panelTab);
  const setPanelTab = useApp((s) => s.setPanelTab);
  const activeMapRegion = useApp((s) => s.activeMapRegion);
  const setActiveMapRegion = useApp((s) => s.setActiveMapRegion);

  const openSave = useApp((s) => s.openSave);
  const selectSlot = useApp((s) => s.selectSlot);
  const refreshScan = useApp((s) => s.refreshScan);
  const saveNow = useApp((s) => s.saveNow);
  const discardChanges = useApp((s) => s.discardChanges);
  const backupNow = useApp((s) => s.backupNow);
  const { resolved, setPreference } = useTheme();

  const busy = pending !== null;

  async function handlePickFile() {
    if (save?.dirty) {
      toast.error('Save or discard your changes before opening another save.');
      return;
    }
    try {
      const path = await pickSaveFile();
      if (path) await openSave(path);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  const activeRegionStats = world?.regions.find((r) => r.mapRegionId === activeMapRegion) ?? null;
  const missingOnMap = activeRegionStats ? Math.max(0, activeRegionStats.total - activeRegionStats.collected) : 0;

  return (
    <aside className="flex h-full w-[404px] min-w-[380px] shrink-0 flex-col border-r border-border bg-card">
      {/* PBZ Brand Header with signature 刃 mark */}
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-brand-dim bg-[#1b1812] text-[21px] leading-none text-brand">
            刃
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[14px] font-semibold tracking-[0.06em] uppercase">Phantom Blade Zero</h1>
            <p className="text-[11px] text-muted-foreground">Map completion & save companion</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="icon-sm" variant="ghost" title="Settings" onClick={() => setEditorTab('settings')}>
            <Settings className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            title="Toggle theme"
            onClick={() => setPreference(resolved === 'dark' ? 'light' : 'dark')}
          >
            {resolved === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
          </Button>
        </div>
      </header>

      {/* Workspace Mode Switcher: Interactive Map vs Full Save Editor */}
      <div className="grid grid-cols-2 border-b border-border bg-secondary/50 p-1.5 gap-1">
        <button
          type="button"
          onClick={() => setWorkspaceMode('map')}
          className={cn(
            'flex cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors',
            workspaceMode === 'map'
              ? 'border border-brand-dim/70 bg-[#221d12] text-brand'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
          )}
        >
          <Compass className="size-3.5" />
          Region Map
        </button>
        <button
          type="button"
          disabled={!save}
          onClick={() => setWorkspaceMode('editor')}
          className={cn(
            'flex cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors disabled:opacity-40',
            workspaceMode === 'editor'
              ? 'border border-brand-dim/70 bg-[#221d12] text-brand'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
          )}
        >
          <SlidersHorizontal className="size-3.5" />
          Save Editor
        </button>
      </div>

      {/* Save File & Slot Picker */}
      <section className="space-y-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-1.5">
          <select
            aria-label="Save file"
            disabled={busy || scan.saves.length === 0}
            value={save?.path ?? ''}
            onChange={(e) => {
              if (save?.dirty) {
                toast.error('Save or discard your changes before switching files.');
                return;
              }
              if (e.target.value) void openSave(e.target.value);
            }}
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-secondary px-2 text-xs text-foreground focus:border-brand focus:outline-none"
          >
            {scan.saves.length === 0 && <option value="">No Steam saves detected</option>}
            {save && !scan.saves.some((s) => s.path === save.path) && (
              <option value={save.path}>{save.fileName} (Opened file)</option>
            )}
            {scan.saves.map((s) => (
              <option key={s.path} value={s.path}>
                {s.kind} · {formatEpochMs(s.modifiedEpochMs)} ({s.folder})
              </option>
            ))}
          </select>

          <Button
            size="icon-sm"
            variant="outline"
            title="Open any .sav file (Ctrl+O)"
            disabled={busy}
            onClick={() => void handlePickFile()}
          >
            <FolderOpen className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="outline"
            title="Rescan Steam save folders"
            disabled={scanning}
            onClick={() => void refreshScan()}
          >
            {scanning ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />}
          </Button>
        </div>

        {save && (
          <select
            aria-label="Save slot"
            disabled={busy}
            value={save.activeSlot}
            onChange={(e) => void selectSlot(e.target.value)}
            className="h-8 w-full rounded-md border border-border bg-secondary px-2 text-xs text-foreground focus:border-brand focus:outline-none"
          >
            {save.slots.map((slot) => (
              <option key={slot.name} value={slot.name} disabled={Boolean(slot.error)}>
                {slot.name}
                {slot.isNewest ? ' (Newest)' : ''} · {formatPbzStamp(slot.dateTime)}
                {slot.dirty ? ' •' : ''}
              </option>
            ))}
          </select>
        )}

        {/* Save status / inline Save-Discard-Backup action bar */}
        {save ? (
          save.dirty ? (
            <div className="space-y-2 rounded-lg border border-brand-dim/60 bg-[#1f1b12] px-2.5 py-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-brand">
                  {save.pendingChanges} unsaved change{save.pendingChanges === 1 ? '' : 's'} staged
                </span>
                <span className="text-[10px] text-muted-foreground">Auto .bak on save</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="xs" className="flex-1" disabled={busy} onClick={() => void saveNow()}>
                  {busy ? <Spinner className="size-3" /> : <Save className="size-3" />}
                  Save (Ctrl+S)
                </Button>
                <Button size="xs" variant="outline" disabled={busy} onClick={() => void discardChanges()}>
                  <RotateCcw className="size-3" />
                  Discard
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 rounded-md bg-ok-soft px-2.5 py-1.5 text-[11px] text-jade">
              <span className="truncate">
                {save.activeSlot} · {overview ? `${overview.overallPercent}% overall` : 'Loaded'}
              </span>
              <button
                type="button"
                disabled={busy}
                title="Create a timestamped backup now (Ctrl+B)"
                onClick={() => void backupNow()}
                className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-foreground/80 hover:bg-background/30 hover:text-brand"
              >
                <Archive className="size-3" />
                Backup
              </button>
            </div>
          )
        ) : (
          <div className="rounded-md bg-secondary px-2.5 py-2 text-center text-[11px] text-muted-foreground">
            Click <b className="text-foreground">Open</b> to load any <span className="font-mono">PBZSaveGame.sav</span>
            .
          </div>
        )}
      </section>

      {/* Map Region Picker + Missing Summary Strip */}
      {world && (
        <>
          <section className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
            <label
              htmlFor="pbz-map-sel"
              className="shrink-0 text-[10px] font-medium tracking-[0.1em] text-muted-foreground uppercase"
            >
              Map
            </label>
            <select
              id="pbz-map-sel"
              value={activeMapRegion}
              onChange={(e) => {
                setActiveMapRegion(e.target.value);
                if (workspaceMode !== 'map') setWorkspaceMode('map');
              }}
              className="h-8 min-w-0 flex-1 cursor-pointer rounded-md border border-border bg-secondary px-2 text-xs text-foreground hover:border-brand-dim focus:border-brand focus:outline-none"
            >
              {world.mapRegions.map((mr) => {
                const st = world.regions.find((r) => r.id === mr.completionRegionId);
                const miss = st ? Math.max(0, st.total - st.collected) : 0;
                return (
                  <option key={mr.id} value={mr.id}>
                    {mr.name} — {miss === 0 ? '100%' : `${miss} missing`}
                  </option>
                );
              })}
            </select>
          </section>

          <section className="border-b border-border px-4 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    'numeric text-[24px] leading-none font-bold',
                    missingOnMap === 0 ? 'text-jade' : 'text-ochre',
                  )}
                >
                  {missingOnMap}
                </span>
                <span className="text-xs text-muted-foreground">missing on this map</span>
              </div>
              {overview && (
                <div className="flex items-center gap-1.5">
                  <span className="numeric rounded-full border border-border px-2 py-0.5 text-[10.5px] text-brand">
                    {overview.overallPercent}% overall
                  </span>
                  {overview.counts.missablesMissed > 0 && (
                    <button
                      type="button"
                      onClick={() => setPanelTab('chronicle')}
                      className="numeric cursor-pointer rounded-full border border-cinnabar/50 bg-bad-soft px-2 py-0.5 text-[10.5px] text-cinnabar"
                    >
                      {overview.counts.missablesMissed} missed
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* PBZ Panel Tabs (gold bottom bar) */}
      <nav className="flex border-b border-border">
        {TABS.map((t) => {
          const active = panelTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setPanelTab(t.id)}
              className={cn(
                'flex-1 cursor-pointer border-b-2 py-2.5 text-xs font-medium transition-colors',
                active ? 'border-brand text-brand' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* Active Tab Body */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-3 pb-8">
        {panelTab === 'completion' && <CompletionPanel />}
        {panelTab === 'chronicle' && <ChroniclePanel />}
        {panelTab === 'quests' && <QuestsPanel />}
        {panelTab === 'layers' && <LayersPanel />}
      </div>

      {/* Subtle footer */}
      <footer className="border-t border-border bg-[#101318] px-4 py-2 text-[10px] leading-relaxed text-muted-foreground/75">
        Offline PBZS v3 engine · Auto-backups before every write · Nothing uploaded.
      </footer>
    </aside>
  );
}
