import { categoryIconUrl } from '@/components/game-assets';
import { Switch } from '@/components/ui/switch';
import { useApp } from '@/lib/store';
import type { CategoryProgress } from '@/lib/types';
import { cn } from '@/lib/utils';

export function LayersPanel() {
  const world = useApp((s) => s.world);
  const activeMapRegion = useApp((s) => s.activeMapRegion);
  const hiddenCats = useApp((s) => s.hiddenCats);
  const toggleCategoryHidden = useApp((s) => s.toggleCategoryHidden);
  const showCollectedOnMap = useApp((s) => s.showCollectedOnMap);
  const setShowCollectedOnMap = useApp((s) => s.setShowCollectedOnMap);

  if (!world) {
    return <div className="p-4 text-center text-xs text-muted-foreground">Load a save to filter map layers.</div>;
  }

  const onThisMap = world.entries.filter((e) => e.mapRegion === activeMapRegion && e.u !== null);
  const mainCats = world.categories.filter((c) => !c.extra);
  const extraCats = world.categories.filter((c) => c.extra);

  function renderRow(cat: CategoryProgress) {
    const visible = !hiddenCats.includes(cat.id);
    const list = onThisMap.filter((e) => e.cat === cat.id);
    const miss = list.filter((e) => e.status !== 'done').length;
    const icon = categoryIconUrl(cat.id, cat.extra);

    return (
      <button
        key={cat.id}
        type="button"
        onClick={() => toggleCategoryHidden(cat.id)}
        className={cn(
          'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-secondary',
          !visible && 'opacity-45',
        )}
      >
        <span
          className={cn(
            'flex size-3.5 shrink-0 items-center justify-center rounded border text-[10px]',
            visible ? 'border-brand bg-brand text-brand-foreground' : 'border-border bg-transparent',
          )}
        >
          {visible ? '✓' : ''}
        </span>
        {icon && <img src={icon} alt="" className="size-4.5 shrink-0 object-contain opacity-90" />}
        <span className="min-w-0 flex-1 truncate">{cat.name}</span>
        <span
          className={cn(
            'numeric shrink-0 text-[11px]',
            miss > 0 && !cat.extra ? 'font-semibold text-ochre' : 'text-muted-foreground',
          )}
        >
          {miss > 0 ? `${miss} missing · ` : ''}
          {list.length}
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="px-2 pb-1 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          Map completion
        </div>
        <div className="space-y-0.5">{mainCats.map(renderRow)}</div>
      </div>

      <div className="h-px bg-border" />

      <div>
        <div className="px-2 pb-1 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          Also on the in-game map
        </div>
        <div className="space-y-0.5">{extraCats.map(renderRow)}</div>
      </div>

      <div className="h-px bg-border" />

      <div className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-secondary/40 px-3 py-2 text-xs">
        <label htmlFor="layer-show-collected" className="cursor-pointer leading-snug text-muted-foreground">
          Show collected pins (dimmed; discovered bells always show)
        </label>
        <Switch id="layer-show-collected" checked={showCollectedOnMap} onCheckedChange={setShowCollectedOnMap} />
      </div>
    </div>
  );
}
