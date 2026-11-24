import { Plus, Search, Sparkles, Swords } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyPanel, PageHeader, Toolbar } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useApp } from '@/lib/store';
import type { WeaponEntryView } from '@/lib/types';

export function WeaponsScreen() {
  const weapons = useApp((s) => s.weapons);
  const pending = useApp((s) => s.pending);
  const showIds = useApp((s) => s.settings.showInternalIds);
  const updateWeapon = useApp((s) => s.updateWeapon);

  const [kind, setKind] = useState<'all' | 'weapon' | 'phantom'>('all');
  const [ownership, setOwnership] = useState<'all' | 'owned' | 'missing'>('all');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    if (!weapons) return [];
    const needle = query.trim().toLowerCase();
    return weapons.filter((w) => {
      if (kind !== 'all' && w.kind !== kind) return false;
      if (ownership === 'owned' && !w.owned) return false;
      if (ownership === 'missing' && w.owned) return false;
      if (!needle) return true;
      return (
        w.name.toLowerCase().includes(needle) ||
        w.nameZh.toLowerCase().includes(needle) ||
        w.id.toLowerCase().includes(needle)
      );
    });
  }, [kind, ownership, query, weapons]);

  if (!weapons) {
    return <div className="h-64 animate-pulse rounded-xl border bg-card/40" />;
  }

  const busy = pending !== null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Weapons & Phantom Edges"
        description="Edit weapon levels, toggle Snap Soul mastery, or unlock missing Main Weapons and Phantom Edges in the active save slot."
      />

      <Toolbar>
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search weapons or Phantom Edges…"
            className="pl-8"
          />
        </div>
        <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
          {(
            [
              ['all', 'All'],
              ['weapon', 'Main Weapons'],
              ['phantom', 'Phantom Edges'],
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
        <EmptyPanel icon={<Swords />} title="No weapons match this filter" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((w) => (
            <WeaponCard
              key={`${w.kind}:${w.id}`}
              weapon={w}
              busy={busy}
              showIds={showIds}
              onUpdate={(level, snap) => void updateWeapon(w.id, w.kind, level, snap)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WeaponCard({
  weapon,
  busy,
  showIds,
  onUpdate,
}: {
  weapon: WeaponEntryView;
  busy: boolean;
  showIds: boolean;
  onUpdate: (level: number, snapSoul: boolean) => void;
}) {
  const [levelDraft, setLevelDraft] = useState(String(weapon.level || 30));

  function commitLevel() {
    const val = Number.parseInt(levelDraft, 10);
    if (Number.isNaN(val) || val === weapon.level) return;
    onUpdate(Math.max(0, Math.min(100, val)), weapon.snapSoul);
  }

  return (
    <div className="flex flex-col justify-between gap-3 rounded-xl border bg-card/80 p-4 shadow-xs">
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-heading text-sm font-semibold">{weapon.name}</span>
              <Badge variant={weapon.kind === 'weapon' ? 'secondary' : 'outline'} className="text-[10px]">
                {weapon.kind === 'weapon' ? 'Main' : 'Phantom Edge'}
              </Badge>
              {weapon.equipped && (
                <Badge variant="default" className="text-[10px]">
                  Equipped
                </Badge>
              )}
            </div>
            {showIds && <div className="font-mono text-[10px] text-muted-foreground">{weapon.id}</div>}
          </div>
          <Badge variant={weapon.owned ? 'ok' : 'outline'}>{weapon.owned ? 'Owned' : 'Missing'}</Badge>
        </div>
        {weapon.description && (
          <p className="line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">{weapon.description}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        {weapon.owned ? (
          <>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <label htmlFor={`wl-${weapon.kind}-${weapon.id}`}>Level</label>
              <Input
                id={`wl-${weapon.kind}-${weapon.id}`}
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
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="size-3.5 text-brand" />
              <label htmlFor={`ws-${weapon.kind}-${weapon.id}`} className="cursor-pointer">
                Snap Soul
              </label>
              <Switch
                id={`ws-${weapon.kind}-${weapon.id}`}
                disabled={busy}
                checked={weapon.snapSoul}
                onCheckedChange={(checked) => onUpdate(weapon.level, checked)}
              />
            </div>
          </>
        ) : (
          <Button size="xs" variant="outline" disabled={busy} onClick={() => onUpdate(30, true)} className="ml-auto">
            <Plus />
            Unlock (Lv 30)
          </Button>
        )}
      </div>
    </div>
  );
}
