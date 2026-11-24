import { Archive, FolderOpen, Moon, RotateCcw, Save, Sun, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/components/theme-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { pickSaveFile } from '@/lib/api';
import { formatPbzStamp } from '@/lib/format';
import { useApp } from '@/lib/store';

export function TopBar() {
  const save = useApp((s) => s.save);
  const pending = useApp((s) => s.pending);
  const selectSlot = useApp((s) => s.selectSlot);
  const saveNow = useApp((s) => s.saveNow);
  const discardChanges = useApp((s) => s.discardChanges);
  const backupNow = useApp((s) => s.backupNow);
  const openSave = useApp((s) => s.openSave);
  const closeSave = useApp((s) => s.closeSave);
  const { resolved, setPreference } = useTheme();

  if (!save) return null;
  const busy = pending !== null;

  async function handleOpenAnother() {
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

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b bg-card/90 px-4">
      <div className="flex min-w-0 items-center gap-3">
        <img src="/icon.png" alt="" className="size-7 rounded-md ring-1 ring-white/10" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-heading text-xs font-semibold tracking-wide">{save.fileName}</span>
            {save.dirty ? (
              <Badge variant="warn" className="text-[10px]">
                {save.pendingChanges} unsaved
              </Badge>
            ) : (
              <Badge variant="ok" className="text-[10px]">
                Saved
              </Badge>
            )}
          </div>
        </div>

        <select
          aria-label="Active save slot"
          disabled={busy}
          value={save.activeSlot}
          onChange={(e) => void selectSlot(e.target.value)}
          className="h-7 max-w-xs rounded-md border border-input bg-background px-2 text-xs shadow-xs focus-visible:border-ring focus-visible:outline-none dark:bg-input/30"
        >
          {save.slots.map((slot) => (
            <option key={slot.name} value={slot.name} disabled={!!slot.error}>
              {slot.name}
              {slot.isNewest ? ' (Newest)' : ''} · {formatPbzStamp(slot.dateTime)}
              {slot.dirty ? ' •' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void handleOpenAnother()}
          title="Open save (Ctrl+O)"
        >
          <FolderOpen />
          <span className="hidden md:inline">Open</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void backupNow()}
          title="Backup now (Ctrl+B)"
        >
          <Archive />
          <span className="hidden md:inline">Backup</span>
        </Button>

        {save.dirty && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void discardChanges()} title="Discard edits">
            <RotateCcw />
            Discard
          </Button>
        )}

        <Button size="sm" disabled={busy || !save.dirty} onClick={() => void saveNow()} title="Write save (Ctrl+S)">
          {busy ? <Spinner className="size-3.5" /> : <Save />}
          Save
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          title="Toggle theme"
          onClick={() => setPreference(resolved === 'dark' ? 'light' : 'dark')}
        >
          {resolved === 'dark' ? <Sun /> : <Moon />}
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          title="Close save"
          disabled={busy}
          onClick={() => {
            if (save.dirty) {
              toast.error('Save or discard your changes before closing.');
              return;
            }
            void closeSave();
          }}
        >
          <X />
        </Button>
      </div>
    </header>
  );
}
