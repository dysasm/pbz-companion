import { CheckCircle2, Compass, Crosshair, Eye, EyeOff, Minus, Plus, RotateCcw, Snowflake, Sun } from 'lucide-react';
import { type PointerEvent, useEffect, useMemo, useRef, useState, type WheelEvent } from 'react';
import { categoryIconUrl, entryIconUrl, mapBellIconUrl, mapImageUrl } from '@/components/game-assets';
import { EmptyPanel, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApp } from '@/lib/store';
import type { CompletionEntryView } from '@/lib/types';
import { cn } from '@/lib/utils';

type ShowFilter = 'missing' | 'all' | 'done';

export function WorldScreen() {
  const world = useApp((s) => s.world);
  const pending = useApp((s) => s.pending);
  const focusMapRegion = useApp((s) => s.focusMapRegion);
  const focusEntryKey = useApp((s) => s.focusEntryKey);
  const clearMapFocus = useApp((s) => s.clearMapFocus);
  const markCompletionEntries = useApp((s) => s.markCompletionEntries);

  const [regionId, setRegionId] = useState<string>('xigu');
  const [layerChoice, setLayerChoice] = useState<Record<string, string>>({});
  const [hiddenCats, setHiddenCats] = useState<Set<string>>(() => new Set(['key', 'treasure']));
  const [showFilter, setShowFilter] = useState<ShowFilter>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Pan & zoom state
  const [zoom, setZoom] = useState(1.15);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; origX: number; origY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  useEffect(() => {
    if (!world || world.mapRegions.length === 0) return;
    if (focusMapRegion && world.mapRegions.some((r) => r.id === focusMapRegion)) {
      setRegionId(focusMapRegion);
      if (focusEntryKey) {
        setSelectedKey(focusEntryKey);
        const entry = world.entries.find((e) => e.key === focusEntryKey);
        if (entry?.extra) {
          setHiddenCats((prev) => {
            const next = new Set(prev);
            next.delete(entry.cat);
            return next;
          });
        }
        if (entry && entry.u !== null && entry.v !== null) {
          setZoom(2.1);
          setPan({ x: (0.5 - entry.u) * 700, y: (0.5 - entry.v) * 700 });
        }
      } else {
        setZoom(1.15);
        setPan({ x: 0, y: 0 });
      }
      clearMapFocus();
    } else if (!world.mapRegions.some((r) => r.id === regionId)) {
      setRegionId(world.mapRegions[0]?.id ?? 'xigu');
    }
  }, [clearMapFocus, focusEntryKey, focusMapRegion, regionId, world]);

  const activeRegion = useMemo(
    () => world?.mapRegions.find((r) => r.id === regionId) ?? world?.mapRegions[0] ?? null,
    [regionId, world],
  );

  const activeLayer = useMemo(() => {
    if (!activeRegion) return null;
    const chosenId = layerChoice[activeRegion.id];
    return activeRegion.layers.find((l) => l.id === chosenId) ?? activeRegion.layers[0] ?? null;
  }, [activeRegion, layerChoice]);

  const regionEntries = useMemo(() => {
    if (!world || !activeRegion) return [];
    return world.entries.filter((e) => e.mapRegion === activeRegion.id && e.u !== null && e.v !== null);
  }, [activeRegion, world]);

  const visibleEntries = useMemo(() => {
    return regionEntries.filter((e) => {
      if (hiddenCats.has(e.cat)) return false;
      const done = e.status === 'done';
      if (showFilter === 'missing') return !done || e.cat === 'bell';
      if (showFilter === 'done') return done;
      return true;
    });
  }, [hiddenCats, regionEntries, showFilter]);

  const selectedEntry = useMemo(
    () => (selectedKey ? (regionEntries.find((e) => e.key === selectedKey) ?? null) : null),
    [regionEntries, selectedKey],
  );

  const missingInRegion = useMemo(() => regionEntries.filter((e) => !e.extra && e.status !== 'done'), [regionEntries]);

  if (!world) {
    return <div className="h-96 animate-pulse rounded-xl border bg-card/40" />;
  }

  if (!activeRegion || !activeLayer) {
    return (
      <EmptyPanel
        icon={<Compass />}
        title="No map regions available"
        description="Region map metadata could not be loaded."
      />
    );
  }

  const imgSrc = mapImageUrl(activeLayer.path);
  const aspect = activeRegion.width / Math.max(1, activeRegion.height);
  const busy = pending !== null;

  function handleWheel(e: WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    setZoom((z) => Math.max(0.65, Math.min(5, Number((z * factor).toFixed(3)))));
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('button')) return;
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: pan.x,
      origY: pan.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.active) return;
    setPan({
      x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
    });
  }

  function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    dragRef.current.active = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function toggleCategory(catId: string) {
    setHiddenCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }

  function resetView() {
    setZoom(1.15);
    setPan({ x: 0, y: 0 });
  }

  return (
    <div className="flex h-[calc(100svh-8.5rem)] min-h-[560px] flex-col gap-4">
      <PageHeader
        title="World Map"
        description="The game's own ink paintings with exact anchor-mesh positions. Drag to pan, scroll to zoom, click any marker to inspect or mark collected."
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {activeRegion.layers.length > 1 && (
              <div className="flex gap-1 rounded-lg border bg-card p-0.5">
                {activeRegion.layers.map((layer) => {
                  const on = activeLayer.id === layer.id;
                  return (
                    <Button
                      key={layer.id}
                      size="xs"
                      variant={on ? 'default' : 'ghost'}
                      onClick={() => setLayerChoice((prev) => ({ ...prev, [activeRegion.id]: layer.id }))}
                    >
                      {layer.id === 'winter' ? <Snowflake className="size-3" /> : <Sun className="size-3" />}
                      {layer.label}
                    </Button>
                  );
                })}
              </div>
            )}
            <div className="flex gap-1 rounded-lg border bg-card p-0.5">
              {(
                [
                  ['missing', `Missing (${missingInRegion.length})`],
                  ['all', 'All'],
                  ['done', 'Collected'],
                ] as const
              ).map(([id, label]) => (
                <Button
                  key={id}
                  size="xs"
                  variant={showFilter === id ? 'secondary' : 'ghost'}
                  onClick={() => setShowFilter(id)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        }
      />

      {/* Region selector pills */}
      <div className="flex flex-wrap gap-1.5">
        {world.mapRegions.map((mr) => {
          const stats = world.regions.find((r) => r.id === mr.completionRegionId);
          const active = mr.id === activeRegion.id;
          const full = stats && stats.total > 0 && stats.collected === stats.total;
          return (
            <button
              key={mr.id}
              type="button"
              onClick={() => {
                setRegionId(mr.id);
                setSelectedKey(null);
                resetView();
              }}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                active
                  ? 'border-brand bg-brand/15 text-brand'
                  : 'bg-card/70 text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <span>{mr.name}</span>
              {stats && (
                <span className={cn('numeric text-[11px]', full ? 'text-ok-strong' : 'opacity-80')}>
                  {stats.percent}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Map + Side Inspector */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_310px]">
        <div
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative flex min-h-0 cursor-grab items-center justify-center overflow-hidden rounded-xl border bg-[#100f12] active:cursor-grabbing select-none"
        >
          <div
            className="relative transition-transform duration-75 ease-out will-change-transform"
            style={{
              width: aspect >= 1 ? 'min(92%, 780px)' : 'auto',
              height: aspect < 1 ? 'min(92%, 780px)' : 'auto',
              aspectRatio: String(aspect),
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            {imgSrc ? (
              <img
                src={imgSrc}
                alt={activeRegion.name}
                draggable={false}
                className="size-full rounded-lg object-contain shadow-2xl"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                Map painting missing
              </div>
            )}

            {/* Markers */}
            {visibleEntries.map((entry) => {
              if (entry.u === null || entry.v === null) return null;
              const done = entry.status === 'done';
              const selected = selectedKey === entry.key;
              const iconSrc = done && entry.cat === 'bell' ? mapBellIconUrl() : entryIconUrl(entry.cat, entry.arr);
              const invScale = 1 / Math.max(0.7, Math.min(2.6, zoom * 0.85));

              return (
                <button
                  key={entry.key}
                  type="button"
                  title={`${entry.name} (${done ? 'Collected' : 'Missing'})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedKey(entry.key);
                  }}
                  style={{
                    left: `${entry.u * 100}%`,
                    top: `${entry.v * 100}%`,
                    transform: `translate(-50%, -50%) scale(${invScale})`,
                  }}
                  className={cn(
                    'absolute flex size-7 cursor-pointer items-center justify-center rounded-full border transition-all',
                    !done && 'marker-pulse z-20 border-brand bg-brand/90 shadow-lg shadow-brand/30',
                    done && entry.cat === 'bell' && 'z-10 border-amber-400/60 bg-zinc-900/90 opacity-90',
                    done && entry.cat !== 'bell' && 'z-0 border-white/20 bg-zinc-900/75 opacity-45 hover:opacity-90',
                    !entry.insideMap && 'border-dashed',
                    selected && 'z-30 ring-2 ring-white ring-offset-2 ring-offset-black',
                  )}
                >
                  {iconSrc ? (
                    <img src={iconSrc} alt="" draggable={false} className="size-4 object-contain" />
                  ) : (
                    <span className="size-2 rounded-full bg-white" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Map Zoom Controls */}
          <div className="absolute right-3 bottom-3 flex flex-col gap-1 rounded-lg border bg-card/90 p-1 shadow-lg backdrop-blur-sm">
            <Button
              size="icon-sm"
              variant="ghost"
              title="Zoom in"
              onClick={() => setZoom((z) => Math.min(5, Number((z * 1.25).toFixed(3))))}
            >
              <Plus />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              title="Zoom out"
              onClick={() => setZoom((z) => Math.max(0.65, Number((z / 1.25).toFixed(3))))}
            >
              <Minus />
            </Button>
            <Button size="icon-sm" variant="ghost" title="Reset view" onClick={resetView}>
              <RotateCcw />
            </Button>
          </div>

          <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 rounded-lg border bg-card/85 px-2.5 py-1 text-[11px] backdrop-blur-sm">
            <span className="font-semibold">{activeRegion.name}</span>
            <span className="text-muted-foreground">·</span>
            <span className="numeric text-muted-foreground">{visibleEntries.length} pins</span>
          </div>
        </div>

        {/* Right Side Panel: Selected Marker + Layer Toggles */}
        <div className="scroll-thin flex min-h-0 flex-col gap-3 overflow-y-auto pr-0.5">
          {selectedEntry ? (
            <MarkerInspector
              entry={selectedEntry}
              busy={busy}
              onMarkCollected={() =>
                void markCompletionEntries([selectedEntry.key], `Marked ${selectedEntry.name} as collected`)
              }
            />
          ) : (
            <div className="rounded-xl border bg-card/70 p-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Crosshair className="size-3.5 text-brand" />
                Select a pin on the map
              </div>
              <p className="mt-1.5 leading-relaxed">
                Click any marker to inspect its lore, obtain hint, and status—or mark a bugged collectible as collected.
              </p>
            </div>
          )}

          <div className="rounded-xl border bg-card/80 p-3.5">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-semibold">Map Layers</span>
              <span className="text-[10px] text-muted-foreground">Click to toggle</span>
            </div>
            <div className="space-y-1">
              {world.categories.map((cat) => {
                const on = !hiddenCats.has(cat.id);
                const icon = categoryIconUrl(cat.id, cat.extra);
                const catEntries = regionEntries.filter((e) => e.cat === cat.id);
                const miss = catEntries.filter((e) => e.status !== 'done').length;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleCategory(cat.id)}
                    className={cn(
                      'flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
                      on ? 'bg-accent/60 text-foreground' : 'text-muted-foreground opacity-55 hover:opacity-80',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {icon && <img src={icon} alt="" className="size-4 shrink-0 object-contain" />}
                      <span className="truncate">{cat.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={cn(
                          'numeric text-[11px]',
                          miss > 0 && !cat.extra ? 'font-semibold text-brand' : 'text-muted-foreground',
                        )}
                      >
                        {miss > 0 ? `${miss} left · ` : ''}
                        {catEntries.length}
                      </span>
                      {on ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MarkerInspector({
  entry,
  busy,
  onMarkCollected,
}: {
  entry: CompletionEntryView;
  busy: boolean;
  onMarkCollected: () => void;
}) {
  const icon = entryIconUrl(entry.cat, entry.arr);
  const done = entry.status === 'done';

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background/60">
            <img src={icon} alt="" className="size-6 object-contain" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-muted-foreground">{entry.subMapName}</div>
          <h3 className="font-heading text-sm font-semibold leading-snug">{entry.name}</h3>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={done ? 'ok' : entry.status === 'oldcycle' ? 'warn' : 'bad'}>
          {done ? 'Collected' : entry.status === 'oldcycle' ? 'Owned from earlier cycle' : 'Missing'}
        </Badge>
        {entry.extra && <Badge variant="outline">Map Hint</Badge>}
        {!entry.insideMap && <Badge variant="warn">Edge of map</Badge>}
      </div>

      {entry.how && <div className="rounded-lg bg-muted/50 px-2.5 py-2 text-[11px]">{entry.how}</div>}
      {entry.petal && (
        <div className="text-[11px] text-muted-foreground">
          Memory petal: <span className="text-foreground">{entry.petal}</span>
        </div>
      )}
      {entry.description && (
        <p className="max-h-36 overflow-y-auto scroll-thin text-[11px] leading-relaxed whitespace-pre-line text-muted-foreground">
          {entry.description}
        </p>
      )}

      {!done && (
        <Button size="sm" className="w-full" disabled={busy} onClick={onMarkCollected}>
          <CheckCircle2 />
          Mark as collected in save
        </Button>
      )}
    </div>
  );
}
