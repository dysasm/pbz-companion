import { CheckCircle2, Crosshair, Minus, Plus, RotateCcw, Snowflake, Sun, X } from 'lucide-react';
import { type PointerEvent, useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from 'react';
import { entryIconUrl, mapBellIconUrl, mapImageUrl } from '@/components/game-assets';
import { Button } from '@/components/ui/button';
import { useApp } from '@/lib/store';
import type { CompletionEntryView } from '@/lib/types';
import { cn } from '@/lib/utils';

export function MapCanvas() {
  const world = useApp((s) => s.world);
  const pending = useApp((s) => s.pending);
  const activeMapRegion = useApp((s) => s.activeMapRegion);
  const mapLayers = useApp((s) => s.mapLayers);
  const setRegionLayer = useApp((s) => s.setRegionLayer);
  const selectedEntryKey = useApp((s) => s.selectedEntryKey);
  const setSelectedEntryKey = useApp((s) => s.setSelectedEntryKey);
  const activeQuestPin = useApp((s) => s.activeQuestPin);
  const setActiveQuestPin = useApp((s) => s.setActiveQuestPin);
  const hiddenCats = useApp((s) => s.hiddenCats);
  const showCollectedOnMap = useApp((s) => s.showCollectedOnMap);
  const mapFocus = useApp((s) => s.mapFocus);
  const markCompletionEntries = useApp((s) => s.markCompletionEntries);

  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1.1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ active: false, moved: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const activeRegion = useMemo(
    () => world?.mapRegions.find((r) => r.id === activeMapRegion) ?? world?.mapRegions[0] ?? null,
    [activeMapRegion, world],
  );

  const activeLayer = useMemo(() => {
    if (!activeRegion) return null;
    const chosenId = mapLayers[activeRegion.id];
    return activeRegion.layers.find((l) => l.id === chosenId) ?? activeRegion.layers[0] ?? null;
  }, [activeRegion, mapLayers]);

  const regionEntries = useMemo(() => {
    if (!world || !activeRegion) return [];
    return world.entries.filter((e) => e.mapRegion === activeRegion.id && e.u !== null && e.v !== null);
  }, [activeRegion, world]);

  const visibleEntries = useMemo(() => {
    const hidden = new Set(hiddenCats);
    return regionEntries.filter((e) => {
      if (hidden.has(e.cat)) return false;
      const done = e.status === 'done';
      // Discovered bells always stay on the map as fast-travel landmarks (just like original PBZ Companion)
      if (done && !showCollectedOnMap && e.cat !== 'bell') return false;
      return true;
    });
  }, [hiddenCats, regionEntries, showCollectedOnMap]);

  const missingPoints = useMemo(
    () => visibleEntries.filter((e) => !e.extra && e.status !== 'done' && e.u !== null && e.v !== null),
    [visibleEntries],
  );

  const selectedEntry = useMemo(
    () => (selectedEntryKey ? (regionEntries.find((e) => e.key === selectedEntryKey) ?? null) : null),
    [regionEntries, selectedEntryKey],
  );

  const canvasMetrics = useCallback(() => {
    const box = containerRef.current?.getBoundingClientRect();
    const cw = box?.width ?? 900;
    const ch = box?.height ?? 760;
    const aspect = activeRegion ? activeRegion.width / Math.max(1, activeRegion.height) : 1;
    const padW = cw * 0.9;
    const padH = ch * 0.9;
    let w = padW;
    let h = w / aspect;
    if (h > padH) {
      h = padH;
      w = h * aspect;
    }
    return { w, h, cw, ch };
  }, [activeRegion]);

  // Reset pan/zoom when switching map regions manually (without an explicit entry focus)
  const prevRegionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeRegion) return;
    if (prevRegionRef.current && prevRegionRef.current !== activeRegion.id && !mapFocus?.entryKey) {
      setZoom(1.08);
      setPan({ x: 0, y: 0 });
    }
    prevRegionRef.current = activeRegion.id;
  }, [activeRegion, mapFocus]);

  // Smoothly center on requested entry or quest pin when user clicks locate/map
  useEffect(() => {
    if (!mapFocus || !world) return;
    if (mapFocus.u !== undefined && mapFocus.u !== null && mapFocus.v !== undefined && mapFocus.v !== null) {
      const { w, h } = canvasMetrics();
      const targetZoom = 2.4;
      setZoom(targetZoom);
      setPan({
        x: (0.5 - mapFocus.u) * w * targetZoom,
        y: (0.5 - mapFocus.v) * h * targetZoom,
      });
      return;
    }
    if (!mapFocus.entryKey) {
      setZoom(1.08);
      setPan({ x: 0, y: 0 });
      return;
    }
    const entry = world.entries.find((e) => e.key === mapFocus.entryKey);
    if (!entry || entry.u === null || entry.v === null) return;
    const { w, h } = canvasMetrics();
    const targetZoom = 2.4;
    setZoom(targetZoom);
    setPan({
      x: (0.5 - entry.u) * w * targetZoom,
      y: (0.5 - entry.v) * h * targetZoom,
    });
  }, [canvasMetrics, mapFocus, world]);

  function frameMissing() {
    if (missingPoints.length === 0) {
      setZoom(1.08);
      setPan({ x: 0, y: 0 });
      return;
    }
    const { w, h, cw, ch } = canvasMetrics();
    let minU = 1;
    let maxU = 0;
    let minV = 1;
    let maxV = 0;
    for (const p of missingPoints) {
      if (p.u === null || p.v === null) continue;
      if (p.u < minU) minU = p.u;
      if (p.u > maxU) maxU = p.u;
      if (p.v < minV) minV = p.v;
      if (p.v > maxV) maxV = p.v;
    }
    const cx = (minU + maxU) / 2;
    const cy = (minV + maxV) / 2;
    const spanU = Math.max(0.14, maxU - minU);
    const spanV = Math.max(0.14, maxV - minV);
    const fitZ = Math.min((cw * 0.72) / (spanU * w), (ch * 0.72) / (spanV * h));
    const targetZoom = Math.max(1.1, Math.min(3.2, Number(fitZ.toFixed(2))));
    setZoom(targetZoom);
    setPan({
      x: (0.5 - cx) * w * targetZoom,
      y: (0.5 - cy) * h * targetZoom,
    });
  }

  function handleWheel(e: WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const box = containerRef.current?.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    const nextZoom = Math.max(0.7, Math.min(5.5, Number((zoom * factor).toFixed(3))));
    if (!box || nextZoom === zoom) return;
    // Zoom toward the pointer position
    const mx = e.clientX - (box.left + box.width / 2);
    const my = e.clientY - (box.top + box.height / 2);
    const ratio = nextZoom / zoom;
    setPan({
      x: mx - (mx - pan.x) * ratio,
      y: my - (my - pan.y) * ratio,
    });
    setZoom(nextZoom);
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('button, [data-map-popup]')) return;
    dragRef.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      origX: pan.x,
      origY: pan.y,
    };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
    setPan({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
  }

  function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    const wasClick = dragRef.current.active && !dragRef.current.moved;
    dragRef.current.active = false;
    setIsDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (wasClick) {
      setSelectedEntryKey(null);
      setActiveQuestPin(null);
    }
  }

  if (!activeRegion || !activeLayer) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#0a0c0e] text-xs text-muted-foreground">
        Load a Phantom Blade Zero save to view region maps.
      </div>
    );
  }

  const imgSrc = mapImageUrl(activeLayer.path);
  const aspect = activeRegion.width / Math.max(1, activeRegion.height);
  const showLabels = zoom >= 1.55;
  const busy = pending !== null;

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={cn(
        'relative flex flex-1 items-center justify-center overflow-hidden bg-[#0a0c0e] select-none',
        isDragging ? 'cursor-grabbing' : 'cursor-grab',
      )}
    >
      {/* Map Image + Markers Plane */}
      <div
        className={cn('relative will-change-transform', !isDragging && 'transition-transform duration-150 ease-out')}
        style={{
          width: aspect >= 1 ? 'min(90%, calc(90vh * 1.85))' : 'auto',
          height: aspect < 1 ? '90%' : 'auto',
          maxHeight: '90%',
          aspectRatio: String(aspect),
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        {imgSrc && (
          <img
            src={imgSrc}
            alt={activeRegion.name}
            draggable={false}
            className="size-full rounded-md object-contain shadow-[0_20px_70px_rgba(0,0,0,0.8)]"
          />
        )}

        {visibleEntries.map((entry) => {
          if (entry.u === null || entry.v === null) return null;
          const done = entry.status === 'done';
          const isBell = entry.cat === 'bell';
          const selected = selectedEntryKey === entry.key;
          const iconSrc = done && isBell ? mapBellIconUrl() : entryIconUrl(entry.cat, entry.arr);
          const invScale = 1 / Math.max(0.85, Math.min(3.5, zoom));

          // 1. Discovered Bells — always shown with game bell icon + parchment-gold name pill
          if (done && isBell) {
            return (
              <button
                key={entry.key}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedEntryKey(entry.key);
                }}
                style={{
                  left: `${entry.u * 100}%`,
                  top: `${entry.v * 100}%`,
                  transform: `translate(-50%, -50%) scale(${invScale})`,
                }}
                className={cn(
                  'group absolute z-10 flex size-8 cursor-pointer items-center justify-center',
                  selected && 'z-30',
                )}
              >
                {iconSrc && (
                  <img
                    src={iconSrc}
                    alt=""
                    draggable={false}
                    className="size-7 object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)] transition-transform group-hover:scale-110"
                  />
                )}
                <span
                  className={cn(
                    'pointer-events-none absolute bottom-7 left-1/2 -translate-x-1/2 rounded border border-brand/35 bg-[#0e0f12]/80 px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-[#f3e3b5] shadow-md transition-colors group-hover:border-brand group-hover:text-white',
                    selected && 'border-brand bg-[#1a160c] text-white',
                  )}
                >
                  {entry.name}
                </span>
              </button>
            );
          }

          // 2. Missing Collectible — dark ink medallion + pulsing cinnabar ring
          if (!done) {
            return (
              <button
                key={entry.key}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedEntryKey(entry.key);
                }}
                style={{
                  left: `${entry.u * 100}%`,
                  top: `${entry.v * 100}%`,
                  transform: `translate(-50%, -50%) scale(${invScale})`,
                }}
                className={cn(
                  'pbz-pin-missing group absolute z-20 flex size-8 cursor-pointer items-center justify-center rounded-full border-2 border-cinnabar bg-[radial-gradient(circle_at_50%_40%,#2a2d33_0%,#121417_75%)] shadow-[0_2px_8px_rgba(0,0,0,0.85)]',
                  !entry.insideMap && 'border-dashed',
                  selected && 'z-30 ring-2 ring-brand ring-offset-2 ring-offset-[#0a0c0e]',
                )}
              >
                {iconSrc && (
                  <img
                    src={iconSrc}
                    alt=""
                    draggable={false}
                    className="size-5 object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                  />
                )}
                <span
                  className={cn(
                    'pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 rounded bg-[#0e0f12]/85 px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-[#ff9b8f] shadow-md transition-opacity',
                    showLabels || selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                  )}
                >
                  {entry.name}
                </span>
              </button>
            );
          }

          // 3. Collected Collectible — dimmed dark circle, reveals clearly on hover
          return (
            <button
              key={entry.key}
              type="button"
              title={`${entry.name} (Collected)`}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedEntryKey(entry.key);
              }}
              style={{
                left: `${entry.u * 100}%`,
                top: `${entry.v * 100}%`,
                transform: `translate(-50%, -50%) scale(${invScale})`,
              }}
              className={cn(
                'group absolute z-0 flex size-5.5 cursor-pointer items-center justify-center rounded-full border border-[#3a3f47] bg-[#121417]/80 opacity-65 transition-opacity hover:z-20 hover:border-brand/60 hover:opacity-100',
                selected && 'z-30 border-brand opacity-100 ring-2 ring-brand/60',
              )}
            >
              {iconSrc && <img src={iconSrc} alt="" draggable={false} className="size-3.5 object-contain opacity-85" />}
            </button>
          );
        })}

        {/* Glowing Antique-Gold Quest Target Pin (.qpin) */}
        {activeQuestPin && activeQuestPin.mapRegion === activeRegion.id && (
          <button
            type="button"
            title={activeQuestPin.questTitle}
            onClick={(e) => e.stopPropagation()}
            style={{
              left: `${activeQuestPin.u * 100}%`,
              top: `${activeQuestPin.v * 100}%`,
              transform: `translate(-50%, -50%) scale(${1 / Math.max(0.85, Math.min(3.5, zoom))})`,
            }}
            className={cn(
              'absolute z-40 flex size-7 cursor-pointer items-center justify-center rounded-full border-2 border-brand bg-brand/25 shadow-[0_0_0_5px_rgba(217,185,106,0.18),0_0_18px_rgba(0,0,0,0.75)]',
              !activeQuestPin.insideMap && 'border-dashed',
            )}
          >
            <span className="size-2.5 rounded-full bg-brand" />
            <span className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 rounded border border-brand bg-[#1a160c]/95 px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap text-brand shadow-lg">
              {activeQuestPin.questTitle}
            </span>
          </button>
        )}
      </div>

      {/* Top-Left Floating Region Badge + Layer Toggle (Crimson Forest Winter/Normal) */}
      <div className="pointer-events-none absolute top-4 left-4 z-30 flex items-center gap-2.5 rounded-lg border border-border bg-card/92 px-3 py-1.5 text-xs shadow-lg backdrop-blur-sm">
        <span className="font-medium tracking-wide text-foreground">{activeRegion.name}</span>
        {missingPoints.length > 0 ? (
          <span className="numeric rounded-full bg-bad-soft px-2 py-0.5 text-[11px] font-semibold text-bad-strong">
            {missingPoints.length} missing
          </span>
        ) : (
          <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-medium text-jade">Complete</span>
        )}
        {activeRegion.layers.length > 1 && (
          <div className="pointer-events-auto ml-1 flex gap-1 border-l border-border pl-2.5">
            {activeRegion.layers.map((layer) => {
              const on = activeLayer.id === layer.id;
              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => setRegionLayer(activeRegion.id, layer.id)}
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors',
                    on
                      ? 'border-brand-dim bg-[#221d12] text-brand'
                      : 'border-border bg-secondary text-muted-foreground hover:text-foreground',
                  )}
                >
                  {layer.id === 'winter' ? <Snowflake className="size-3" /> : <Sun className="size-3" />}
                  {layer.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Top-Right Floating Map Controls (+ / - / Frame Missing / Reset) */}
      <div className="absolute top-4 right-4 z-30 flex flex-col gap-1.5">
        <MapIconButton title="Zoom in" onClick={() => setZoom((z) => Math.min(5.5, Number((z * 1.28).toFixed(3))))}>
          <Plus className="size-4" />
        </MapIconButton>
        <MapIconButton title="Zoom out" onClick={() => setZoom((z) => Math.max(0.7, Number((z / 1.28).toFixed(3))))}>
          <Minus className="size-4" />
        </MapIconButton>
        <MapIconButton title="Frame missing items" onClick={frameMissing}>
          <Crosshair className="size-4" />
        </MapIconButton>
        <MapIconButton
          title="Reset view"
          onClick={() => {
            setZoom(1.08);
            setPan({ x: 0, y: 0 });
          }}
        >
          <RotateCcw className="size-3.5" />
        </MapIconButton>
      </div>

      {/* Bottom-Left Floating Legend */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-30 flex flex-wrap items-center gap-3.5 rounded-lg border border-border bg-card/90 px-3 py-1.5 text-[11px] text-muted-foreground shadow-lg backdrop-blur-sm">
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-full border-2 border-cinnabar bg-[#1c1010]" />
          Missing
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2 rounded-full bg-muted-foreground/70" />
          Collected
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-full border border-dashed border-cinnabar" />
          Edge / approximate
        </span>
      </div>

      {/* Floating Marker Popup Card (Bottom-Right inside Map Viewport) */}
      {selectedEntry && (
        <FloatingMarkerPopup
          entry={selectedEntry}
          busy={busy}
          onClose={() => setSelectedEntryKey(null)}
          onMarkCollected={() =>
            void markCompletionEntries([selectedEntry.key], `Marked ${selectedEntry.name} as collected`)
          }
        />
      )}

      {/* Floating Quest Step Card when a Quest Target Pin is active */}
      {!selectedEntry && activeQuestPin && activeQuestPin.mapRegion === activeRegion.id && (
        <div
          data-map-popup
          className="absolute right-4 bottom-4 z-40 w-[330px] max-w-[calc(100%-2rem)] overflow-hidden rounded-xl border border-brand-dim bg-popover/96 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.75)] backdrop-blur-md"
        >
          <button
            type="button"
            title="Close"
            onClick={() => setActiveQuestPin(null)}
            className="absolute top-3 right-3 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
          <div className="pr-6">
            <div className="text-[10px] font-medium tracking-[0.1em] text-brand uppercase">
              Quest target · {activeQuestPin.categoryName}
            </div>
            <h4 className="mt-0.5 text-[15px] leading-tight font-semibold text-foreground">
              {activeQuestPin.questTitle}
            </h4>
          </div>
          <div className="mt-2.5 border-l-2 border-brand-dim pl-2.5 text-xs leading-relaxed text-[#e8e4da]">
            {activeQuestPin.stepText}
          </div>
          {activeQuestPin.details && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{activeQuestPin.details}</p>
          )}
          {!activeQuestPin.insideMap && (
            <div className="mt-2 text-[10.5px] text-ochre">Approximate position outside the painted region bounds.</div>
          )}
        </div>
      )}
    </div>
  );
}

function MapIconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex size-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-card/92 text-foreground shadow-lg backdrop-blur-sm transition-colors hover:border-brand-dim hover:text-brand"
    >
      {children}
    </button>
  );
}

function FloatingMarkerPopup({
  entry,
  busy,
  onClose,
  onMarkCollected,
}: {
  entry: CompletionEntryView;
  busy: boolean;
  onClose: () => void;
  onMarkCollected: () => void;
}) {
  const icon = entryIconUrl(entry.cat, entry.arr);
  const done = entry.status === 'done';

  return (
    <div
      data-map-popup
      className="absolute right-4 bottom-4 z-40 w-[330px] max-w-[calc(100%-2rem)] overflow-hidden rounded-xl border border-border bg-popover/96 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.75)] backdrop-blur-md"
    >
      <button
        type="button"
        title="Close"
        onClick={onClose}
        className="absolute top-3 right-3 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>

      <div className="flex items-center gap-3 pr-6">
        {icon && (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-[#101318] p-1.5">
            <img src={icon} alt="" className="size-full object-contain" />
          </div>
        )}
        <div className="min-w-0">
          <div className="text-[10px] font-medium tracking-[0.1em] text-brand uppercase">
            {entry.cat} · {entry.subMapName}
          </div>
          <h4 className="mt-0.5 text-[15px] leading-tight font-semibold text-foreground">{entry.name}</h4>
        </div>
      </div>

      <div
        className={cn(
          'mt-2.5 text-xs font-semibold',
          done ? 'text-jade' : entry.status === 'oldcycle' ? 'text-ochre' : 'text-cinnabar',
        )}
      >
        {done ? 'Collected' : entry.status === 'oldcycle' ? 'Owned from an earlier cycle — not counted' : 'Missing'}
        {!entry.insideMap && <span className="ml-2 font-normal text-muted-foreground">(edge of map)</span>}
      </div>

      {entry.how && <div className="mt-2 text-[11px] text-muted-foreground">{entry.how}</div>}
      {entry.petal && <div className="mt-1 text-[11px] text-ochre">Memory petal: {entry.petal}</div>}

      {entry.description && (
        <div className="scroll-thin mt-2.5 max-h-32 overflow-y-auto border-l-2 border-brand-dim pl-2.5 text-xs leading-relaxed whitespace-pre-line text-[#d4c9a8]">
          {entry.description}
        </div>
      )}

      {!done && (
        <div className="mt-3 border-t border-border pt-3">
          <Button size="sm" className="w-full" disabled={busy} onClick={onMarkCollected}>
            <CheckCircle2 />
            Mark as collected in save
          </Button>
        </div>
      )}
    </div>
  );
}
