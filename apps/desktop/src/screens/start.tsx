import {
  ChevronRight,
  Compass,
  FileWarning,
  FolderOpen,
  HardDriveDownload,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  Swords,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { EmptyPanel } from '@/components/page';
import { useTheme } from '@/components/theme-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { pickFolder, pickSaveFile } from '@/lib/api';
import { formatBytes, formatEpochMs, formatNumber } from '@/lib/format';
import { useApp } from '@/lib/store';
import type { DiscoveredSave } from '@/lib/types';

export function StartScreen() {
  const scanning = useApp((s) => s.scanning);
  const scan = useApp((s) => s.scan);
  const info = useApp((s) => s.info);
  const pending = useApp((s) => s.pending);
  const refreshScan = useApp((s) => s.refreshScan);
  const setSettings = useApp((s) => s.setSettings);
  const openSave = useApp((s) => s.openSave);
  const { resolved, setPreference } = useTheme();

  async function chooseFile() {
    try {
      const path = await pickSaveFile();
      if (path) await openSave(path);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function chooseFolder() {
    try {
      const path = await pickFolder('Select Phantom Blade Zero SaveGames folder');
      if (!path) return;
      await setSettings({ lastFolder: path });
      await refreshScan(path);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="scroll-thin h-svh overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-8 pb-16">
        <header className="flex items-center justify-between py-5">
          <div className="flex items-center gap-3">
            <img src="/icon.png" alt="" className="size-9 rounded-lg ring-1 ring-white/10" />
            <div>
              <div className="font-heading text-[13px] leading-none font-semibold tracking-[0.14em] uppercase">
                Phantom Blade Zero
              </div>
              <div className="mt-1 text-[11px] leading-none tracking-[0.18em] text-muted-foreground uppercase">
                Companion & Save Editor
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="ok" className="hidden sm:inline-flex">
              <ShieldCheck className="size-3" />
              Offline & Local
            </Badge>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Toggle theme"
              onClick={() => setPreference(resolved === 'dark' ? 'light' : 'dark')}
            >
              {resolved === 'dark' ? <Sun /> : <Moon />}
            </Button>
          </div>
        </header>

        <section className="grid items-center gap-10 py-8 lg:grid-cols-[1.18fr_0.82fr] lg:py-14">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs text-muted-foreground">
              <Compass className="size-3.5 text-brand" />
              PBZS v3 AES-256-GCM · Oodle Kraken · Exact In-Game Rules
            </div>
            <div className="space-y-3">
              <h1 className="font-heading text-5xl leading-[1.03] font-semibold tracking-[-0.03em] text-balance">
                Every blade,
                <br />
                <span className="text-brand">every secret.</span>
              </h1>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                Inspect your live Phantom Blade Zero saves, pinpoint every missing collectible on the game&apos;s own
                region paintings, track missable quests before points of no return, and edit weapons, gear, resources,
                and story flags with lossless verification and automatic backups.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="lg" onClick={() => void chooseFile()} disabled={pending !== null}>
                <FolderOpen />
                Open save file
              </Button>
              <Button size="lg" variant="outline" onClick={() => void chooseFolder()} disabled={scanning}>
                {scanning ? <Spinner /> : <RefreshCw />}
                Scan a folder
              </Button>
            </div>
            <div className="grid gap-2.5 text-xs text-muted-foreground sm:grid-cols-3">
              <Feature
                icon={<ShieldCheck />}
                title="Lossless patching"
                text="Edits only targeted JSON members; untouched slots stay bit-identical."
              />
              <Feature
                icon={<HardDriveDownload />}
                title="Stale-file guard"
                text="Refuses to overwrite if the game saved after you opened the file."
              />
              <Feature
                icon={<FileWarning />}
                title="Auto backups"
                text="Saves a timestamped .bak copy before writing and re-verifies every slot."
              />
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm">
            <div className="absolute -inset-6 rounded-[2rem] bg-brand/12 blur-3xl" />
            <div className="relative overflow-hidden rounded-2xl border bg-card/90 p-6 shadow-2xl">
              <img src="/icon.png" alt="" className="mx-auto size-36 rounded-2xl ring-1 ring-white/10" />
              <div className="mt-5 space-y-1 text-center">
                <div className="font-heading text-base font-semibold tracking-tight">
                  PBZ Companion v{info?.version ?? '0.1.0'}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Decodes encrypted PBZS containers natively in Rust with pure-Rust Oodle Kraken decompression.
                </p>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                <Stat label="Map Entries" value={info ? formatNumber(info.mapEntries) : '—'} />
                <Stat label="Quests" value={info ? formatNumber(info.quests) : '—'} />
                <Stat label="Items" value={info ? formatNumber(info.catalogItems) : '—'} />
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-semibold tracking-tight">Saves on this machine</h2>
              <p className="text-xs text-muted-foreground">
                {scan.roots.length > 0
                  ? `Scanned ${scan.roots.join(' · ')}`
                  : 'Open a PBZSaveGame.sav file directly, or scan your Steam SaveGames folder.'}
              </p>
            </div>
            <Button variant="outline" size="sm" disabled={scanning} onClick={() => void refreshScan()}>
              {scanning ? <Spinner /> : <RefreshCw />}
              Rescan
            </Button>
          </div>

          {scanning && scan.saves.length === 0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {['a', 'b', 'c'].map((k) => (
                <div key={k} className="h-28 animate-pulse rounded-xl border bg-card/40" />
              ))}
            </div>
          ) : scan.saves.length === 0 ? (
            <EmptyPanel
              icon={<Swords />}
              title="No Phantom Blade Zero saves found yet"
              description="Point to your Steam SaveGames folder (usually Steam\\steamapps\\common\\PBZ\\ProjectPBZ\\Saved\\SaveGames) or open any .sav file."
              action={
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void chooseFile()}>
                    Open .sav file
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void chooseFolder()}>
                    Scan folder
                  </Button>
                </div>
              }
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {scan.saves.map((entry) => (
                <SaveCard
                  key={entry.path}
                  save={entry}
                  disabled={pending !== null}
                  onOpen={() => void openSave(entry.path)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SaveCard({ save, disabled, onOpen }: { save: DiscoveredSave; disabled: boolean; onOpen: () => void }) {
  const isLive = save.kind === 'Live save';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onOpen}
      className="group flex cursor-pointer flex-col justify-between gap-3 rounded-xl border bg-card/80 p-4 text-left shadow-xs transition-all hover:border-brand/50 hover:bg-card disabled:opacity-50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant={isLive ? 'default' : 'secondary'}>{save.kind}</Badge>
            <span className="truncate font-mono text-[11px] text-muted-foreground">{save.folder}</span>
          </div>
          <div className="mt-2 truncate font-heading text-sm font-semibold">{save.fileName}</div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{formatEpochMs(save.modifiedEpochMs)}</span>
        <span className="numeric font-mono">{formatBytes(save.sizeBytes)}</span>
      </div>
    </button>
  );
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-xl border bg-card/50 p-3">
      <div className="mb-1.5 text-brand [&_svg]:size-4">{icon}</div>
      <div className="text-xs font-medium text-foreground">{title}</div>
      <div className="mt-0.5 text-[11px] leading-snug">{text}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background/50 p-2.5">
      <div className="numeric font-heading text-base font-semibold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
