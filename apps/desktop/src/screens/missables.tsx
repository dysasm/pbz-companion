import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ShieldAlert, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyPanel, PageHeader, StatTile } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApp } from '@/lib/store';
import type { MissableItemView } from '@/lib/types';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'todo' | 'missed';

const STATUS_META: Record<MissableItemView['status'], { label: string; variant: 'ok' | 'warn' | 'bad' | 'secondary' }> =
  {
    done: { label: 'Done', variant: 'ok' },
    ready: { label: 'Ready to collect', variant: 'warn' },
    missed: { label: 'Missed', variant: 'bad' },
    late: { label: 'Past deadline?', variant: 'warn' },
    open: { label: 'Still possible', variant: 'secondary' },
    todo: { label: 'Not done', variant: 'secondary' },
  };

export function MissablesScreen() {
  const missables = useApp((s) => s.missables);
  const pending = useApp((s) => s.pending);
  const applyMissableFix = useApp((s) => s.applyMissableFix);

  const [filter, setFilter] = useState<Filter>('all');
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const [collapsedPonr, setCollapsedPonr] = useState<Set<string>>(() => new Set());

  const counts = useMemo(() => {
    if (!missables) return { done: 0, missed: 0, todo: 0, total: 0 };
    const all = missables.missables;
    return {
      done: all.filter((m) => m.status === 'done').length,
      missed: all.filter((m) => m.status === 'missed' || m.status === 'late').length,
      todo: all.filter((m) => m.status !== 'done').length,
      total: all.length,
    };
  }, [missables]);

  if (!missables) {
    return <div className="h-64 animate-pulse rounded-xl border bg-card/40" />;
  }

  const busy = pending !== null;

  function matchesFilter(m: MissableItemView): boolean {
    if (filter === 'all') return true;
    if (filter === 'missed') return m.status === 'missed' || m.status === 'late';
    return m.status !== 'done';
  }

  function toggleItem(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePonr(id: string) {
    setCollapsedPonr((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Missables & Points of No Return"
        description="Story milestones that lock out quests or rewards, traced directly from the game's flow scripts. Missed steps with verified fixes can be repaired in one click."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          icon={<CheckCircle2 />}
          label="Completed"
          value={`${counts.done} / ${counts.total}`}
          detail="Tracked missables done"
        />
        <StatTile
          icon={<AlertTriangle />}
          label="Still Open"
          value={counts.todo - counts.missed}
          detail="Finish before their deadline"
        />
        <StatTile
          icon={<ShieldAlert />}
          label="Missed / Late"
          value={counts.missed}
          detail="Can apply save fix where supported"
          accent={counts.missed > 0}
        />
      </div>

      <div className="flex gap-1 rounded-lg border bg-card/70 p-1 w-fit">
        {(
          [
            ['all', `All (${counts.total})`],
            ['todo', `Not done (${counts.todo})`],
            ['missed', `Missed (${counts.missed})`],
          ] as const
        ).map(([id, label]) => (
          <Button key={id} size="xs" variant={filter === id ? 'secondary' : 'ghost'} onClick={() => setFilter(id)}>
            {label}
          </Button>
        ))}
      </div>

      {counts.todo === 0 && filter !== 'all' ? (
        <EmptyPanel
          icon={<CheckCircle2 />}
          title="Nothing left to miss"
          description="Every tracked missable quest step is already completed in this save."
        />
      ) : (
        <div className="space-y-3">
          {missables.pointsOfNoReturn.map((ponr) => {
            const items = missables.missables.filter((m) => m.ponr === ponr.id);
            const visible = items.filter(matchesFilter);
            const doneHere = items.filter((m) => m.status === 'done').length;
            const collapsed = collapsedPonr.has(ponr.id);

            return (
              <div key={ponr.id} className="overflow-hidden rounded-xl border bg-card/80">
                <button
                  type="button"
                  onClick={() => togglePonr(ponr.id)}
                  className="flex w-full cursor-pointer items-start justify-between gap-3 p-4 text-left hover:bg-accent/30"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={cn(
                        'mt-1 size-2.5 shrink-0 rounded-full',
                        ponr.passed ? 'bg-muted-foreground' : 'bg-brand',
                      )}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-heading text-sm font-semibold">{ponr.name}</span>
                        <Badge variant={ponr.passed ? 'secondary' : 'warn'}>
                          {ponr.passed ? 'Passed' : 'Ahead of you'}
                        </Badge>
                        {ponr.minor && <Badge variant="outline">Minor</Badge>}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {ponr.region}
                        {ponr.chapter ? ` · Chapter: ${ponr.chapter}` : ''}
                        {ponr.chapterNext ? ` → ${ponr.chapterNext}` : ''}
                        {items.length > 0 ? ` · ${doneHere}/${items.length} done` : ''}
                      </div>
                      {ponr.note && <p className="mt-1 text-xs text-muted-foreground">{ponr.note}</p>}
                    </div>
                  </div>
                  {items.length > 0 &&
                    (collapsed ? (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                    ))}
                </button>

                {!collapsed && visible.length > 0 && (
                  <div className="divide-y border-t">
                    {visible.map((m) => {
                      const expanded = openIds.has(m.id);
                      const meta = STATUS_META[m.status];
                      return (
                        <div key={m.id} className="bg-background/30">
                          <button
                            type="button"
                            onClick={() => toggleItem(m.id)}
                            className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left text-xs hover:bg-accent/30"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              {expanded ? (
                                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                              )}
                              <span className="font-medium">{m.name}</span>
                              {m.progressTotal !== null && m.progressCurrent !== null && (
                                <span className="numeric text-[11px] text-muted-foreground">
                                  {m.progressCurrent}/{m.progressTotal} {m.progressLabel ?? ''}
                                </span>
                              )}
                            </div>
                            <Badge variant={meta.variant}>{meta.label}</Badge>
                          </button>

                          {expanded && (
                            <div className="space-y-3 border-t bg-card/40 px-10 py-3.5 text-xs">
                              <div className="grid gap-1 text-[11px] text-muted-foreground">
                                {m.region && (
                                  <div>
                                    <span className="font-medium text-foreground">Where:</span> {m.region}
                                  </div>
                                )}
                                {m.before && (
                                  <div>
                                    <span className="font-medium text-foreground">Deadline:</span> {m.before}
                                  </div>
                                )}
                              </div>
                              <p className="leading-relaxed text-muted-foreground">{m.how}</p>
                              {m.statusNote && (
                                <div className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[11px] text-warn-strong">
                                  {m.statusNote}
                                </div>
                              )}
                              {m.rewards.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[11px] text-muted-foreground">Rewards:</span>
                                  {m.rewards.map((r) => (
                                    <Badge key={r.id} variant={r.owned ? 'ok' : 'outline'}>
                                      {r.owned ? '✓ ' : ''}
                                      {r.name}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {m.canFix && m.fixText && (
                                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand/30 bg-brand/5 p-3">
                                  <div className="text-[11px]">{m.fixText}</div>
                                  <Button size="xs" disabled={busy} onClick={() => void applyMissableFix(m.id, m.name)}>
                                    <Wrench />
                                    Apply fix
                                  </Button>
                                </div>
                              )}
                              {!m.canFix && m.status === 'missed' && m.noFixNote && (
                                <p className="text-[11px] text-muted-foreground">{m.noFixNote}</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
