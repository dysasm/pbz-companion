import { CheckCircle2, ChevronDown, ChevronRight, MapPin, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { categoryIconUrl } from '@/components/game-assets';
import { EmptyPanel, PageHeader, Panel, Toolbar } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';

export function CompletionScreen() {
  const world = useApp((s) => s.world);
  const pending = useApp((s) => s.pending);
  const showIds = useApp((s) => s.settings.showInternalIds);
  const focusOnMap = useApp((s) => s.focusOnMap);
  const markCompletionEntries = useApp((s) => s.markCompletionEntries);

  const [regionId, setRegionId] = useState<string>('XiGu');
  const [query, setQuery] = useState('');
  const [showCollected, setShowCollected] = useState(false);
  const [openCats, setOpenCats] = useState<Set<string>>(() => new Set(['bell', 'weapon', 'accessory', 'challenge']));

  const activeRegion = useMemo(
    () => world?.regions.find((r) => r.id === regionId) ?? world?.regions[0] ?? null,
    [regionId, world],
  );

  const grouped = useMemo(() => {
    if (!world || !activeRegion) return [];
    const needle = query.trim().toLowerCase();
    const completionCats = world.categories.filter((c) => !c.extra);
    return completionCats.map((cat) => {
      const seen = new Set<string>();
      const all = world.entries.filter((e) => {
        if (e.region !== activeRegion.id || e.cat !== cat.id) return false;
        if (['bell', 'weapon', 'accessory'].includes(e.cat)) {
          const d = `${e.cat}:${e.itemId ?? ''}`;
          if (seen.has(d)) return false;
          seen.add(d);
        }
        return true;
      });
      const collected = all.filter((e) => e.status === 'done').length;
      const filtered = all.filter((e) => {
        if (!showCollected && e.status === 'done') return false;
        if (!needle) return true;
        return (
          e.name.toLowerCase().includes(needle) ||
          e.subMapName.toLowerCase().includes(needle) ||
          (e.itemId ?? '').toLowerCase().includes(needle)
        );
      });
      return { cat, all, collected, filtered };
    });
  }, [activeRegion, query, showCollected, world]);

  if (!world || !activeRegion) {
    return <div className="h-64 animate-pulse rounded-xl border bg-card/40" />;
  }

  const busy = pending !== null;

  function toggleCat(id: string) {
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Map Completion"
        description="Mirrors the game's exact completion screen rules (MapItemCompletion.js). Locate missing collectibles on the map or mark stuck entries as collected."
        actions={
          <Badge variant="outline" className="numeric px-3 py-1 text-xs">
            Overall {world.overallPercent}% ({world.overallCollected}/{world.overallTotal})
          </Badge>
        }
      />

      {/* Region strip */}
      <div className="flex flex-wrap gap-1.5">
        {world.regions.map((r) => {
          const active = r.id === activeRegion.id;
          const full = r.total > 0 && r.collected === r.total;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setRegionId(r.id)}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'border-brand bg-brand/15 text-brand'
                  : 'bg-card/70 text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <span>{r.name}</span>
              <span className={cn('numeric text-[11px]', full ? 'text-ok-strong' : 'opacity-80')}>{r.percent}%</span>
            </button>
          );
        })}
      </div>

      <Toolbar>
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search collectibles in ${activeRegion.name}…`}
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
          <Switch id="show-collected-switch" checked={showCollected} onCheckedChange={setShowCollected} />
          <label htmlFor="show-collected-switch" className="cursor-pointer">
            Show collected
          </label>
        </div>
      </Toolbar>

      {/* Region progress header */}
      <div className="rounded-xl border bg-card/80 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-heading text-base font-semibold">{activeRegion.name}</h2>
            <p className="text-xs text-muted-foreground">
              {activeRegion.collected} of {activeRegion.total} collectibles found
            </p>
          </div>
          <div className="numeric font-heading text-2xl font-semibold text-brand">{activeRegion.percent}%</div>
        </div>
        <Progress value={activeRegion.percent} className="mt-3 h-2" />
      </div>

      <div className="space-y-3">
        {grouped.map(({ cat, all, collected, filtered }) => {
          const isOpen = openCats.has(cat.id) || query.trim().length > 0;
          const full = all.length > 0 && collected === all.length;
          const missingKeys = all.filter((e) => e.status !== 'done').map((e) => e.key);
          const icon = categoryIconUrl(cat.id, false);

          return (
            <Panel
              key={cat.id}
              title={
                <button
                  type="button"
                  onClick={() => toggleCat(cat.id)}
                  className="flex cursor-pointer items-center gap-2.5 text-left"
                >
                  {isOpen ? (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  )}
                  {icon && <img src={icon} alt="" className="size-5 object-contain" />}
                  <span>{cat.name}</span>
                  <Badge variant={full ? 'ok' : 'secondary'} className="numeric">
                    {collected} / {all.length}
                  </Badge>
                </button>
              }
              actions={
                missingKeys.length > 0 && (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void markCompletionEntries(
                        missingKeys,
                        `Marked all ${missingKeys.length} missing ${cat.name} in ${activeRegion.name}`,
                      )
                    }
                  >
                    <CheckCircle2 />
                    Mark all missing ({missingKeys.length})
                  </Button>
                )
              }
              contentClassName={isOpen ? 'p-0' : 'hidden'}
            >
              {filtered.length === 0 ? (
                <div className="px-4 py-4 text-xs text-muted-foreground">
                  {full ? 'All entries in this category are collected.' : 'No entries match your filter.'}
                </div>
              ) : (
                <ul className="divide-y">
                  {filtered.map((entry) => {
                    const done = entry.status === 'done';
                    return (
                      <li
                        key={entry.key}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs hover:bg-accent/30"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn('font-medium', done && 'text-muted-foreground line-through')}>
                              {entry.name}
                            </span>
                            {entry.status === 'oldcycle' && <Badge variant="warn">Old cycle</Badge>}
                            {showIds && (
                              <span className="font-mono text-[10px] text-muted-foreground">{entry.key}</span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {entry.subMapName}
                            {entry.how ? ` · ${entry.how}` : ''}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          {entry.mapRegion && entry.u !== null && (
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => {
                                if (entry.mapRegion) focusOnMap(entry.mapRegion, entry.key);
                              }}
                            >
                              <MapPin />
                              Map
                            </Button>
                          )}
                          {!done ? (
                            <Button
                              size="xs"
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                void markCompletionEntries([entry.key], `Marked ${entry.name} as collected`)
                              }
                            >
                              <CheckCircle2 />
                              Mark collected
                            </Button>
                          ) : (
                            <Badge variant="ok">Done</Badge>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          );
        })}

        {grouped.every((g) => g.all.length === 0) && (
          <EmptyPanel icon={<CheckCircle2 />} title="No entries in this region" />
        )}
      </div>
    </div>
  );
}
