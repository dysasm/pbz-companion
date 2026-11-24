import { ShieldCheck } from 'lucide-react';
import { formatBytes } from '@/lib/format';
import { useApp } from '@/lib/store';

export function StatusBar() {
  const save = useApp((s) => s.save);
  const pending = useApp((s) => s.pending);
  if (!save) return null;

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between gap-4 border-t bg-card/80 px-4 text-[11px] text-muted-foreground">
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate font-mono">{save.path}</span>
        <span className="numeric shrink-0">{formatBytes(save.sizeBytes)}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {pending && <span className="text-brand">{pending}</span>}
        {save.backupPath && <span className="hidden truncate max-w-xs lg:inline">Backup ready</span>}
        <span className="flex items-center gap-1 text-ok-strong">
          <ShieldCheck className="size-3" />
          Offline · Lossless PBZS
        </span>
      </div>
    </footer>
  );
}
