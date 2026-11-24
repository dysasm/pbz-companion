import { useMemo, useState } from 'react';
import { useApp } from '@/lib/store';
import type { QuestItemView } from '@/lib/types';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'progress' | 'notdone' | 'done';
type Sort = 'region' | 'story';

const QLABEL: Record<QuestItemView['status'], string> = {
  done: 'Done',
  progress: 'In progress',
  todo: 'Not started',
  failed: 'Failed',
};

export function QuestsPanel() {
  const quests = useApp((s) => s.quests);
  const focusOnMap = useApp((s) => s.focusOnMap);
  const focusQuestPin = useApp((s) => s.focusQuestPin);
  const openMissable = useApp((s) => s.openMissable);

  const [filter, setFilter] = useState<Filter>('progress');
  const [sort, setSort] = useState<Sort>('region');
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  const groups = useMemo(() => {
    if (!quests) return [];
    const visible = quests.quests.filter((q) => {
      if (filter === 'progress') return q.status === 'progress';
      if (filter === 'notdone') return q.status !== 'done';
      if (filter === 'done') return q.status === 'done';
      return true;
    });

    if (sort === 'story') {
      const started = visible
        .filter((q) => q.startTime !== null)
        .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
      const rest = visible.filter((q) => q.startTime === null);
      const out: Array<[string, QuestItemView[]]> = [];
      if (started.length) out.push(['Started (oldest first)', started]);
      if (rest.length) out.push(['Not started', rest]);
      return out;
    }

    const byRegion = new Map<string, QuestItemView[]>();
    for (const q of visible) {
      const list = byRegion.get(q.regionName) ?? [];
      list.push(q);
      byRegion.set(q.regionName, list);
    }
    return [...byRegion.entries()];
  }, [filter, quests, sort]);

  if (!quests) {
    return <div className="p-4 text-center text-xs text-muted-foreground">Load a save to see quests.</div>;
  }

  const counts = {
    all: quests.quests.length,
    progress: quests.inProgress,
    notdone: quests.quests.length - quests.done,
    done: quests.done,
  };

  return (
    <div className="space-y-3">
      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['all', 'All', counts.all],
            ['progress', 'In progress', counts.progress],
            ['notdone', 'Not done', counts.notdone],
            ['done', 'Done', counts.done],
          ] as const
        ).map(([id, label, n]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              'cursor-pointer rounded-full border px-2.5 py-1 text-[11px] transition-colors',
              filter === id
                ? 'border-brand-dim bg-[#1f1b12] text-brand'
                : 'border-border bg-secondary text-muted-foreground hover:text-foreground',
            )}
          >
            {label} <b className="numeric ml-0.5 font-semibold text-foreground">{n}</b>
          </button>
        ))}
      </div>

      {/* Sort row */}
      <div className="flex items-center gap-1.5 px-1 text-[10.5px] text-muted-foreground">
        <span>Order</span>
        {(
          [
            ['region', 'by region'],
            ['story', 'by start time'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSort(id)}
            className={cn(
              'cursor-pointer rounded px-1.5 py-0.5 transition-colors',
              sort === id ? 'bg-[#1f1b12] text-brand' : 'hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {groups.length === 0 && (
        <div className="px-1 text-xs text-jade">
          {filter === 'progress' ? 'No quest currently in progress.' : 'Every quest in the log is done.'}
        </div>
      )}

      {groups.map(([label, list]) => {
        const done = list.filter((q) => q.status === 'done').length;
        return (
          <div key={label} className="space-y-1.5">
            <div className="flex items-center justify-between px-1 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              <span>{label}</span>
              <span className="numeric text-brand-dim">
                {done}/{list.length}
              </span>
            </div>
            <div className="space-y-1">
              {list.map((q) => {
                const open = openIds.has(q.id);
                return (
                  <div
                    key={q.id}
                    className={cn('rounded-md border bg-secondary', open ? 'border-border' : 'border-transparent')}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(q.id)) next.delete(q.id);
                          else next.add(q.id);
                          return next;
                        })
                      }
                      className="flex w-full cursor-pointer items-start gap-2 px-2.5 py-2 text-left text-xs hover:text-white"
                    >
                      <span
                        className={cn(
                          'mt-1.5 size-2 shrink-0 rounded-full',
                          q.status === 'done' && 'bg-jade',
                          q.status === 'progress' && 'bg-ochre',
                          q.status === 'failed' && 'bg-cinnabar',
                          q.status === 'todo' && 'bg-[#6d7684]',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className={cn('leading-snug font-medium', q.status === 'done' && 'text-muted-foreground')}>
                          {q.title || q.id}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {q.categoryName}
                          {q.tracked ? ' · tracked' : ''}
                        </div>
                        {q.status === 'progress' && q.currentStep && !open && (
                          <div className="mt-0.5 text-[10.5px] leading-snug text-[#b9a77c]">{q.currentStep}</div>
                        )}
                      </div>
                      <span
                        className={cn(
                          'shrink-0 text-[10px] whitespace-nowrap',
                          q.status === 'done' && 'text-jade',
                          q.status === 'progress' && 'text-ochre',
                          q.status === 'failed' && 'text-cinnabar',
                          q.status === 'todo' && 'text-muted-foreground',
                        )}
                      >
                        {QLABEL[q.status]}
                      </span>
                    </button>

                    {open && (
                      <div className="space-y-2 border-t border-border/60 px-3 py-2.5 pl-6 text-[11.5px]">
                        {q.subtitle && <div className="text-[11px] italic text-muted-foreground">{q.subtitle}</div>}
                        <ul className="space-y-1.5">
                          {q.branches.map((br) => (
                            <li
                              key={br.id}
                              className={cn('flex items-start gap-2', br.state === 'none' && 'opacity-55')}
                            >
                              <span
                                className={cn(
                                  'mt-1.5 size-[7px] shrink-0 rounded-full border-[1.5px]',
                                  br.state === 'done' && 'border-jade bg-jade',
                                  br.state === 'active' &&
                                    'border-ochre bg-ochre shadow-[0_0_0_3px_rgba(201,164,92,0.18)]',
                                  br.state === 'failed' && 'border-cinnabar bg-cinnabar',
                                  br.state === 'none' && 'border-[#5b616b] bg-transparent',
                                )}
                              />
                              <div className="min-w-0 flex-1">
                                <div
                                  className={cn(br.state === 'done' ? 'text-muted-foreground' : 'text-foreground/90')}
                                >
                                  {br.text || `Step ${br.id}`}
                                </div>
                                {br.details && (
                                  <div className="mt-0.5 text-[10.5px] text-muted-foreground">{br.details}</div>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                {br.taskTotal !== null && br.taskDone !== null && (
                                  <span className="numeric text-[10px] text-ochre">
                                    {br.taskDone}/{br.taskTotal}
                                  </span>
                                )}
                                {br.mapRegion && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (br.mapRegion && br.u !== null && br.v !== null) {
                                        focusQuestPin({
                                          questId: q.id,
                                          questTitle: q.title || q.id,
                                          categoryName: q.categoryName,
                                          branchId: br.id,
                                          stepText: br.text || `Step ${br.id}`,
                                          details: br.details,
                                          mapRegion: br.mapRegion,
                                          u: br.u,
                                          v: br.v,
                                          insideMap: br.insideMap,
                                        });
                                      } else if (br.mapRegion) {
                                        focusOnMap(br.mapRegion);
                                      }
                                    }}
                                    className="cursor-pointer rounded border border-border px-1.5 py-0 text-[10px] leading-4 text-brand hover:border-brand-dim"
                                  >
                                    map
                                  </button>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>

                        {q.missableIds.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {q.missableIds.map((mid) => (
                              <button
                                key={mid}
                                type="button"
                                onClick={() => openMissable(mid)}
                                className="cursor-pointer rounded border border-brand-dim/50 bg-[#18140d] px-2 py-0.5 text-[10px] text-brand hover:border-brand"
                              >
                                Missable: {mid} →
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
