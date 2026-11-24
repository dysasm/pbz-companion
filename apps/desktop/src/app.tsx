import { listen } from '@tauri-apps/api/event';
import { AppWindow, FolderOpen, ShieldCheck, Terminal } from 'lucide-react';
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { Sidebar } from '@/components/sidebar';
import { StatusBar } from '@/components/status-bar';
import { ThemeProvider, useTheme } from '@/components/theme-provider';
import { TopBar } from '@/components/top-bar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { api, pickSaveFile } from '@/lib/api';
import { useApp } from '@/lib/store';
import type { Section } from '@/lib/types';
import { CompletionScreen } from '@/screens/completion';
import { GearScreen } from '@/screens/gear';
import { InventoryScreen } from '@/screens/inventory';
import { MissablesScreen } from '@/screens/missables';
import { OverviewScreen } from '@/screens/overview';
import { QuestsScreen } from '@/screens/quests';
import { RawScreen } from '@/screens/raw';
import { SettingsScreen } from '@/screens/settings';
import { StartScreen } from '@/screens/start';
import { WeaponsScreen } from '@/screens/weapons';
import { WorldScreen } from '@/screens/world';

const SCREENS: Record<Section, () => ReactElement | null> = {
  overview: OverviewScreen,
  world: WorldScreen,
  completion: CompletionScreen,
  missables: MissablesScreen,
  quests: QuestsScreen,
  weapons: WeaponsScreen,
  gear: GearScreen,
  inventory: InventoryScreen,
  raw: RawScreen,
  settings: SettingsScreen,
};

export function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

function AppShell() {
  const booted = useApp((s) => s.booted);
  const desktop = useApp((s) => s.desktop);
  const save = useApp((s) => s.save);
  const section = useApp((s) => s.section);
  const loading = useApp((s) => s.loading);
  const boot = useApp((s) => s.boot);
  const saveNow = useApp((s) => s.saveNow);
  const backupNow = useApp((s) => s.backupNow);
  const discardChanges = useApp((s) => s.discardChanges);
  const openSave = useApp((s) => s.openSave);
  const { resolved } = useTheme();
  const [closeOpen, setCloseOpen] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void boot();
  }, [boot]);

  useEffect(() => {
    document.title = save ? `${save.fileName} · ${save.activeSlot} — PBZ Companion` : 'PBZ Companion';
  }, [save]);

  useEffect(() => {
    if (!desktop) return undefined;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<boolean>('window-close-requested', () => {
      setCloseOpen(true);
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [desktop]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        if (save) void saveNow();
      } else if (key === 'b') {
        event.preventDefault();
        if (save) void backupNow();
      } else if (key === 'o') {
        event.preventDefault();
        if (save?.dirty) {
          toast.error('Save or discard your changes before opening another save.');
          return;
        }
        void (async () => {
          try {
            const path = await pickSaveFile();
            if (path) await openSave(path);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : String(err));
          }
        })();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [backupNow, openSave, save, saveNow]);

  return (
    <>
      <Toaster theme={resolved} position="bottom-right" richColors />
      {!booted ? (
        <BootSplash />
      ) : !desktop ? (
        <DesktopRequired />
      ) : !save ? (
        <StartScreen />
      ) : (
        <div className="flex h-svh flex-col overflow-hidden">
          <TopBar />
          <div className="flex min-h-0 flex-1">
            <Sidebar />
            <div className="relative min-w-0 flex-1 overflow-hidden">
              <main className="scroll-thin h-full overflow-y-auto">
                <div key={section} className="mx-auto w-full max-w-[1440px] px-7 pt-6 pb-8">
                  {(() => {
                    const Screen = SCREENS[section];
                    return <Screen />;
                  })()}
                </div>
              </main>
              {loading && (
                <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 bg-brand/30">
                  <div className="h-full w-1/3 animate-pulse bg-brand" />
                </div>
              )}
            </div>
          </div>
          <StatusBar />

          <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Close PBZ Companion?</DialogTitle>
                <DialogDescription>
                  You have unsaved changes. Saving writes the verified PBZS save and keeps a timestamped backup.
                  Discarding leaves your file untouched.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:justify-between">
                <Button variant="ghost" onClick={() => setCloseOpen(false)}>
                  Cancel
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      setCloseOpen(false);
                      await discardChanges();
                      await api.closeWindow();
                    }}
                  >
                    Discard and close
                  </Button>
                  <Button
                    onClick={async () => {
                      if (await saveNow()) {
                        setCloseOpen(false);
                        await api.closeWindow();
                      }
                    }}
                  >
                    Save and close
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </>
  );
}

function BootSplash() {
  return (
    <div className="flex h-svh items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <img src="/icon.png" alt="" className="size-16 rounded-2xl ring-1 ring-white/10" />
        <div className="text-center">
          <div className="font-heading text-sm font-semibold tracking-[0.14em] uppercase">Phantom Blade Zero</div>
          <div className="mt-1 text-[10px] tracking-[0.18em] text-muted-foreground uppercase">PBZ Companion</div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          Loading catalog and scanning saves…
        </div>
      </div>
    </div>
  );
}

function DesktopRequired() {
  return (
    <div className="flex h-svh items-center justify-center p-8">
      <div className="w-full max-w-lg rounded-2xl border bg-card/80 p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <img src="/icon.png" alt="" className="size-11 rounded-xl ring-1 ring-white/10" />
          <div>
            <div className="font-heading text-sm font-semibold tracking-[0.14em] uppercase">PBZ Companion</div>
            <div className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">Phantom Blade Zero</div>
          </div>
        </div>
        <h1 className="mt-5 font-heading text-xl font-semibold">Launch the Tauri desktop app</h1>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          PBZ Companion reads and writes local encrypted PBZS save files natively through Tauri 2. Start the desktop
          window with:
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-lg border bg-muted/40 p-3 font-mono text-xs">
          <Terminal className="size-3.5 text-brand" />
          npm run desktop
        </div>
        <div className="mt-5 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
          <MiniFeature icon={<AppWindow />} title="Tauri 2" text="Native Windows shell" />
          <MiniFeature icon={<FolderOpen />} title="Local Saves" text="Reads Steam saves directly" />
          <MiniFeature icon={<ShieldCheck />} title="Offline" text="Zero network telemetry" />
        </div>
      </div>
    </div>
  );
}

function MiniFeature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-lg border bg-background/40 p-2.5">
      <div className="mb-1 text-brand [&_svg]:size-3.5">{icon}</div>
      <div className="text-[11px] font-medium text-foreground">{title}</div>
      <div className="mt-0.5 text-[10px]">{text}</div>
    </div>
  );
}
