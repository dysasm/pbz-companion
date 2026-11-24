import { Plus, Search, Shield } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyPanel, PageHeader, Toolbar } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApp } from '@/lib/store';
import type { GearEntryView } from '@/lib/types';

export function GearScreen() {
  const gear = useApp((s) => s.gear);
  const pending = useApp((s) => s.pending);
  const showIds = useApp((s) => s.settings.showInternalIds);
  const updateGear = useApp((s) => s.updateGear);

  const [kind, setKind] = useState<'all' | 'accessory' | 'medicine'>('all');
  const [ownership, setOwnership] = useState<'all' | 'owned' | 'missing'>('all');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    if (!gear) return [];
    const needle = query.trim().toLowerCase();
    return gear.filter((g) => {
      if (kind !== 'all' && g.kind !== kind) return false;
      if (ownership === 'owned' && !g.owned) return false;
      if (ownership === 'missing' && g.owned) return false;
      if (!needle) return true;
      return (
        g.name.toLowerCase().includes(needle) ||
        g.nameZh.toLowerCase().includes(needle) ||
        g.id.toLowerCase().includes(needle)
      );
    });
  }, [gear, kind, ownership, query]);

  if (!gear) {
    return <div className="h-64 animate-pulse rounded-xl border bg-card/40" />;
  }

  const busy = pending !== null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Accessories & Medicine"
        description="Inspect and edit owned Accessories and Medicines, adjust levels or medicine max charges, or unlock missing items."
      />

      <Toolbar>
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search accessories or medicine…"
            className="pl-8"
          />
        </div>
        <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
          {(
            [
              ['all', 'All'],
              ['accessory', 'Accessories'],
              ['medicine', 'Medicine'],
            ] as const
          ).map(([id, label]) => (
            <Button key={id} size="xs" variant={kind === id ? 'secondary' : 'ghost'} onClick={() => setKind(id)}>
              {label}
            </Button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
          {(
            [
              ['all', 'All'],
              ['owned', 'Owned'],
              ['missing', 'Missing'],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              size="xs"
              variant={ownership === id ? 'secondary' : 'ghost'}
              onClick={() => setOwnership(id)}
            >
              {label}
            </Button>
          ))}
        </div>
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyPanel icon={<Shield />} title="No gear matches this filter" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((item) => (
            <GearCard
              key={`${item.kind}:${item.id}`}
              item={item}
              busy={busy}
              showIds={showIds}
              onUpdate={(level, maxCharges) => void updateGear(item.id, item.kind, level, maxCharges)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GearCard({
  item,
  busy,
  showIds,
  onUpdate,
}: {
  item: GearEntryView;
  busy: boolean;
  showIds: boolean;
  onUpdate: (level: number, maxCharges?: number | null) => void;
}) {
  const [levelDraft, setLevelDraft] = useState(String(item.level));
  const [chargesDraft, setChargesDraft] = useState(String(item.maxCharges || 2));

  function commitLevel() {
    const val = Number.parseInt(levelDraft, 10);
    if (Number.isNaN(val) || val === item.level) return;
    onUpdate(Math.max(0, Math.min(100, val)), item.kind === 'medicine' ? item.maxCharges : null);
  }

  function commitCharges() {
    const val = Number.parseInt(chargesDraft, 10);
    if (Number.isNaN(val) || val === item.maxCharges) return;
    onUpdate(item.level, Math.max(0, Math.min(99, val)));
  }

  return (
    <div className="flex flex-col justify-between gap-3 rounded-xl border bg-card/80 p-4 shadow-xs">
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-heading text-sm font-semibold">{item.name}</span>
              <Badge variant="secondary" className="text-[10px]">
                {item.kind === 'accessory' ? 'Accessory' : 'Medicine'}
              </Badge>
              {item.equipped && (
                <Badge variant="default" className="text-[10px]">
                  Equipped
                </Badge>
              )}
            </div>
            {showIds && <div className="font-mono text-[10px] text-muted-foreground">{item.id}</div>}
          </div>
          <Badge variant={item.owned ? 'ok' : 'outline'}>{item.owned ? 'Owned' : 'Missing'}</Badge>
        </div>
        {item.description && (
          <p className="line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">{item.description}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        {item.owned ? (
          <>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <label htmlFor={`gl-${item.kind}-${item.id}`}>Level</label>
              <Input
                id={`gl-${item.kind}-${item.id}`}
                type="number"
                min={0}
                max={100}
                disabled={busy}
                value={levelDraft}
                onChange={(e) => setLevelDraft(e.target.value)}
                onBlur={commitLevel}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitLevel();
                }}
                className="numeric h-7 w-20 font-mono"
              />
            </div>
            {item.kind === 'medicine' && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <label htmlFor={`gc-${item.id}`}>Max charges</label>
                <Input
                  id={`gc-${item.id}`}
                  type="number"
                  min={0}
                  max={99}
                  disabled={busy}
                  value={chargesDraft}
                  onChange={(e) => setChargesDraft(e.target.value)}
                  onBlur={commitCharges}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitCharges();
                  }}
                  className="numeric h-7 w-20 font-mono"
                />
              </div>
            )}
          </>
        ) : (
          <Button
            size="xs"
            variant="outline"
            disabled={busy}
            onClick={() => onUpdate(item.kind === 'accessory' ? 1 : 0, item.kind === 'medicine' ? 2 : null)}
            className="ml-auto"
          >
            <Plus />
            Unlock
          </Button>
        )}
      </div>
    </div>
  );
}
