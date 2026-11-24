import { CheckCircle2, ChevronDown, ChevronRight, LocateFixed } from 'lucide-react';
import { useMemo, useState } from 'react';
import { categoryIconUrl } from '@/components/game-assets';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';

export function CompletionPanel() {
  const world = useApp((s) => s.world);
  const pending = useApp((s) => s.pending);
  const activeMapRegion = useApp((s) => s.activeMapRegion);
  const setActiveMapRegion = useApp((s) => s.setActiveMapRegion);
  const focusOnMap = useApp((s) => s.focusOnMap);
  const markCompletionEntries = useApp((s) => s.markCompletionEntries);

  const [openCats, setOpenCats] = useState<Set<string>>(() => new Set(['challenge', 'bell', 'weapon', 'accessory']));
  const [showDone, setShowDone] = useState(false);

  const activeRegion = useMemo(() => {
    if (!world) return null;
    return world.regions.find((r) => r.mapRegionId === activeMapRegion) ?? world.regions[0] ?? null;
  }, [activeMapRegion, world]);

  const categories = useMemo(() => {
    if (!world || !activeRegion) return [];
    return world.categories
      .filter((c) => !c.extra)
      .map((cat) => {
        const seen = new Set<string>();
        const list = world.entries.filter((e) => {
          if (e.region !== activeRegion.id || e.cat !== cat.id) return false;
          if (['bell', 'weapon', 'accessory'].includes(e.cat)) {
            const k = `${e.cat}:${e.itemId ?? ''}`;
            if (seen.has(k)) return false;
            seen.add(k);
          }
          return true;
        });
        const cur = list.filter((e) => e.status === 'done').length;
        return { cat, list, cur, tot: list.length };
      });
  }, [activeRegion, world]);

  if (!world || !activeRegion) {
    return <div className="p-4 text-center text-xs text-muted-foreground">Load a save to see completion.</div>;
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
    <div className="space-y-3">
      {/* Region chips (rchips) */}
      <div className="flex flex-wrap gap-1.5">
        {world.regions.map((r) => {
          const on = r.id === activeRegion.id;
          const full = r.total > 0 && r.collected === r.total;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                if (r.mapRegionId) setActiveMapRegion(r.mapRegionId);
              }}
              className={cn(
                'cursor-pointer rounded-full border px-2.5 py-0.5 text-[11px] transition-colors',
                on
                  ? 'border-brand bg-secondary text-foreground'
                  : 'border-border bg-secondary/70 text-muted-foreground hover:border-brand-dim hover:text-foreground',
              )}
            >
              {r.name} <b className={cn('numeric font-semibold', full ? 'text-jade' : 'text-ochre')}>{r.percent}%</b>
            </button>
          );
        })}
      </div>

      {/* Region heading + giant antique-gold percentage */}
      <div className="flex items-end justify-between border-b border-border px-1 pb-2.5">
        <div className="min-w-0">
          <h3 className="text-[16px] font-semibold tracking-[0.04em] uppercase">{activeRegion.name}</h3>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {activeRegion.collected} / {activeRegion.total} collected
          </div>
        </div>
        <div className="numeric text-right leading-none">
          <div className="text-[26px] font-bold text-brand">{activeRegion.percent}%</div>
          <div className="mt-1 text-[10px] text-muted-foreground">overall {world.overallPercent}%</div>
        </div>
      </div>

      {/* Category cards with 3px progress bars & game ink icons */}
      <div className="space-y-1.5">
        {categories.map(({ cat, list, cur, tot }) => {
          const full = tot > 0 && cur === tot;
          const open = openCats.has(cat.id);
          const pct = tot > 0 ? Math.round((cur / tot) * 100) : 100;
          const icon = categoryIconUrl(cat.id, false);
          const visible = showDone ? list : list.filter((e) => e.status !== 'done');
          const missingKeys = list.filter((e) => e.status !== 'done').map((e) => e.key);

          return (
            <div
              key={cat.id}
              className={cn(
                'overflow-hidden rounded-lg border bg-secondary/85 transition-colors',
                open ? 'border-border' : 'border-transparent',
              )}
            >
              <button
                type="button"
                onClick={() => toggleCat(cat.id)}
                className="grid w-full cursor-pointer grid-cols-[24px_1fr_auto] grid-rows-[auto_3px] items-center gap-x-2.5 gap-y-1.5 px-2.5 py-2 text-left hover:bg-accent/40"
              >
                {icon ? (
                  <img
                    src={icon}
                    alt=""
                    className="row-span-2 size-6 object-contain drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
                  />
                ) : (
                  <span className="row-span-2 size-6" />
                )}
                <span className="flex items-center gap-1.5 truncate text-[12.5px] font-medium">
                  {open ? (
                    <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{cat.name}</span>
                </span>
                <span className="numeric text-xs text-muted-foreground">
                  <b className={cn('text-sm font-semibold', full ? 'text-jade' : 'text-ochre')}>{cur}</b>/{tot}
                </span>
                <div className="col-span-2 col-start-2 h-[3px] overflow-hidden rounded-full bg-border">
                  <div
                    className={cn('h-full transition-all duration-300', full ? 'bg-jade' : 'bg-ochre')}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>

              {open && (
                <div className="border-t border-border/70 px-2 pb-2">
                  {visible.length === 0 ? (
                    <div className="px-2 py-2.5 text-[11px] text-jade">
                      {full ? 'All collected in this category.' : 'No missing entries.'}
                    </div>
                  ) : (
                    <>
                      {visible.map((entry) => {
                        const done = entry.status === 'done';
                        const locatable = Boolean(entry.mapRegion && entry.u !== null);
                        return (
                          <div
                            key={entry.key}
                            className="flex items-center gap-2 border-t border-border/50 py-1.5 first:border-t-0"
                          >
                            <div className="min-w-0 flex-1">
                              <div className={cn('text-xs leading-snug', done && 'text-muted-foreground line-through')}>
                                {entry.name}
                              </div>
                              <div
                                className={cn(
                                  'mt-0.5 text-[10px]',
                                  entry.status === 'oldcycle' ? 'text-ochre' : 'text-muted-foreground',
                                )}
                              >
                                {entry.subMapName}
                                {entry.status === 'oldcycle'
                                  ? ' · Owned in earlier cycle'
                                  : entry.how
                                    ? ` · ${entry.how}`
                                    : ''}
                              </div>
                            </div>

                            {!done && (
                              <button
                                type="button"
                                disabled={busy}
                                title="Mark as collected in save"
                                onClick={() =>
                                  void markCompletionEntries([entry.key], `Marked ${entry.name} as collected`)
                                }
                                className="flex size-6.5 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-jade hover:text-jade disabled:opacity-40"
                              >
                                <CheckCircle2 className="size-3.5" />
                              </button>
                            )}

                            {locatable && (
                              <button
                                type="button"
                                title="Locate on map"
                                onClick={() => {
                                  if (entry.mapRegion) focusOnMap(entry.mapRegion, entry.key);
                                }}
                                className="flex size-6.5 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border text-brand transition-colors hover:border-brand"
                              >
                                <LocateFixed className="size-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}

                      {missingKeys.length > 1 && (
                        <div className="mt-1.5 border-t border-border/50 pt-1.5">
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={busy}
                            className="w-full"
                            onClick={() =>
                              void markCompletionEntries(
                                missingKeys,
                                `Marked all ${missingKeys.length} missing ${cat.name} in ${activeRegion.name}`,
                              )
                            }
                          >
                            <CheckCircle2 />
                            Mark all {missingKeys.length} missing collected
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Show collected toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border/70 bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
        <label htmlFor="comp-show-done" className="cursor-pointer">
          Show collected entries in lists
        </label>
        <Switch id="comp-show-done" checked={showDone} onCheckedChange={setShowDone} />
      </div>
    </div>
  );
}
