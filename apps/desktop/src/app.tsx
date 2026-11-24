import { listen } from '@tauri-apps/api/event';
import { AppWindow, FolderOpen, ShieldCheck, Terminal } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { CompanionPanel } from '@/components/companion-panel';
import { EditorWorkspace } from '@/components/editor-workspace';
import { MapCanvas } from '@/components/map-canvas';
import { ThemeProvider, useTheme } from '@/components/theme-provider';
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
  const workspaceMode = useApp((s) => s.workspaceMode);
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
      ) : (
        <div className="relative flex h-svh w-full overflow-hidden bg-background">
          <CompanionPanel />

          <main className="relative flex min-w-0 flex-1 overflow-hidden">
            {workspaceMode === 'editor' ? <EditorWorkspace /> : <MapCanvas />}
            {loading && (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-50 h-0.5 bg-brand/30">
                <div className="h-full w-1/3 animate-pulse bg-brand" />
              </div>
            )}
          </main>

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
    <div className="flex h-svh items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="grid size-16 place-items-center rounded-2xl border border-brand-dim bg-[#1b1812] text-3xl text-brand">
          刃
        </div>
        <div className="text-center">
          <div className="font-heading text-sm font-semibold tracking-[0.14em] uppercase">Phantom Blade Zero</div>
          <div className="mt-1 text-[10px] tracking-[0.18em] text-muted-foreground uppercase">PBZ Companion</div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          Loading your latest save…
        </div>
      </div>
    </div>
  );
}

function DesktopRequired() {
  return (
    <div className="flex h-svh items-center justify-center bg-background p-8">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl border border-brand-dim bg-[#1b1812] text-xl text-brand">
            刃
          </div>
          <div>
            <div className="font-heading text-sm font-semibold tracking-[0.14em] uppercase">PBZ Companion</div>
            <div className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">Phantom Blade Zero</div>
          </div>
        </div>
        <h1 className="mt-5 font-heading text-xl font-semibold">Launch the desktop app</h1>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Open <span className="font-mono">pbz-companion.exe</span> or start Tauri dev mode so the app can read and
          write your local encrypted saves:
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-lg border bg-secondary p-3 font-mono text-xs">
          <Terminal className="size-3.5 text-brand" />
          npm.cmd run desktop
        </div>
        <div className="mt-5 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
          <MiniFeature icon={<AppWindow />} title="Native Tauri 2" text="Single standalone .exe" />
          <MiniFeature icon={<FolderOpen />} title="Local Saves" text="Reads Steam saves directly" />
          <MiniFeature icon={<ShieldCheck />} title="Offline" text="Nothing uploaded" />
        </div>
      </div>
    </div>
  );
}

function MiniFeature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-lg border bg-background/50 p-2.5">
      <div className="mb-1 text-brand [&_svg]:size-3.5">{icon}</div>
      <div className="text-[11px] font-medium text-foreground">{title}</div>
      <div className="mt-0.5 text-[10px]">{text}</div>
    </div>
  );
}
