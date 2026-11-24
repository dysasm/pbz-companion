import { ChevronDown, ChevronRight, Flag, ScrollText, ShieldAlert, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useApp } from '@/lib/store';
import type { MissableItemView, PonrView, QuestItemView } from '@/lib/types';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'todo' | 'missed';

interface StoryAct {
  id: string;
  actLabel: string;
  title: string;
  chapters: Array<{
    questId: string;
    regionName: string;
    ponrIds: string[];
  }>;
}

/** Phantom Blade Zero's canonical 3-Act, 9-Chapter story chronology mapped to PoNR gates. */
const STORY_ACTS: StoryAct[] = [
  {
    id: 'act1',
    actLabel: 'Act I',
    title: 'The Fallen Valley',
    chapters: [
      { questId: 'MainCh1-NiLiuErShang', regionName: 'Weeping Creek Valley', ponrIds: ['eldest-fu'] },
      { questId: 'MainCh1-2-GangTieJuTa', regionName: 'Weeping Creek Valley', ponrIds: [] },
      { questId: 'MainCh1-LinZhongShaJi', regionName: 'Crimson Forest', ponrIds: ['crimson-boss'] },
      { questId: 'MainCh1-ShiXinCun', regionName: 'Village of Lu', ponrIds: ['village-auntie', 'mu-xiaokui'] },
    ],
  },
  {
    id: 'act2',
    actLabel: 'Act II',
    title: 'City of Masks',
    chapters: [
      { questId: 'MainCh2-SiZhen', regionName: 'Pangzhen', ponrIds: [] },
      { questId: 'MainCh2-XinZhiZongJi', regionName: 'Pangzhen', ponrIds: [] },
      { questId: 'MainCh2-SiDaSheWu', regionName: 'Pangzhen', ponrIds: ['snake-door'] },
    ],
  },
  {
    id: 'act3',
    actLabel: 'Act III',
    title: 'Beyond the Veil',
    chapters: [
      { questId: 'MainCh3-PoJu', regionName: 'Pangzhen → Meigu Lake', ponrIds: [] },
      { questId: 'MainCh3-LongYuZuo', regionName: 'Mount Soulrend', ponrIds: ['leng-tu', 'soulrend-end'] },
    ],
  },
];

const MISS_LABEL: Record<MissableItemView['status'], string> = {
  done: 'Done',
  ready: 'Ready',
  missed: 'Missed',
  open: 'Still possible',
  todo: 'Not done',
  late: 'Past deadline?',
};

export function ChroniclePanel() {
  const quests = useApp((s) => s.quests);
  const missables = useApp((s) => s.missables);
  const pending = useApp((s) => s.pending);
  const highlightMissableId = useApp((s) => s.highlightMissableId);
  const focusQuestPin = useApp((s) => s.focusQuestPin);
  const focusOnMap = useApp((s) => s.focusOnMap);
  const applyMissableFix = useApp((s) => s.applyMissableFix);

  const [filter, setFilter] = useState<Filter>('all');
  const [openChapters, setOpenChapters] = useState<Set<string>>(() => new Set());
  const [openMissables, setOpenMissables] = useState<Set<string>>(() => new Set());
  const [ponrExpanded, setPonrExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!highlightMissableId || !missables) return;
    const item = missables.missables.find((m) => m.id === highlightMissableId);
    if (!item) return;
    setFilter('all');
    setOpenMissables((prev) => new Set(prev).add(item.id));
    setPonrExpanded((prev) => ({ ...prev, [item.ponr]: true }));
  }, [highlightMissableId, missables]);

  const questById = useMemo(() => {
    const map = new Map<string, QuestItemView>();
    for (const q of quests?.quests ?? []) map.set(q.id, q);
    return map;
  }, [quests]);

  const ponrById = useMemo(() => {
    const map = new Map<string, PonrView>();
    for (const p of missables?.pointsOfNoReturn ?? []) map.set(p.id, p);
    return map;
  }, [missables]);

  const counts = useMemo(() => {
    const allM = missables?.missables ?? [];
    const storyDone = STORY_ACTS.flatMap((a) => a.chapters).filter(
      (c) => questById.get(c.questId)?.status === 'done',
    ).length;
    const storyTotal = STORY_ACTS.reduce((acc, a) => acc + a.chapters.length, 0);
    return {
      storyDone,
      storyTotal,
      missAll: allM.length,
      missTodo: allM.filter((m) => m.status !== 'done').length,
      missMissed: allM.filter((m) => m.status === 'missed' || m.status === 'late').length,
    };
  }, [missables, questById]);

  // Determine the player's current story chapter for the "YOU ARE HERE" gold beacon
  const currentChapterId = useMemo(() => {
    const allChapters = STORY_ACTS.flatMap((a) => a.chapters);
    const active = allChapters.find((c) => questById.get(c.questId)?.status === 'progress');
    if (active) return active.questId;
    const firstTodo = allChapters.find((c) => questById.get(c.questId)?.status !== 'done');
    return firstTodo?.questId ?? null;
  }, [questById]);

  if (!quests || !missables) {
    return (
      <div className="p-4 text-center text-xs text-muted-foreground">Load a save to view the Story Chronicle.</div>
    );
  }

  const busy = pending !== null;

  function matchesMissable(m: MissableItemView): boolean {
    if (filter === 'all') return true;
    if (filter === 'missed') return m.status === 'missed' || m.status === 'late';
    return m.status !== 'done';
  }

  function jumpToBranch(q: QuestItemView, br: QuestItemView['branches'][number]) {
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
  }

  return (
    <div className="space-y-3.5">
      {/* Compact story progress summary */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/70 px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <ScrollText className="size-3.5 text-brand" />
          <span className="font-medium">Story Chronicle</span>
        </div>
        <span className="numeric text-[11px] text-muted-foreground">
          <b className="text-brand">{counts.storyDone}</b>/{counts.storyTotal} chapters
        </span>
      </div>

      {/* Filter pills for missables along the chronicle */}
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['all', 'Full chronicle', counts.missAll],
            ['todo', 'Open missables', counts.missTodo],
            ['missed', 'Missed', counts.missMissed],
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

      {/* 3-Act Chronological Timeline */}
      <div className="space-y-5">
        {STORY_ACTS.map((act) => (
          <section key={act.id} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <span className="rounded border border-brand-dim/60 bg-[#1c1810] px-1.5 py-0.5 text-[9.5px] font-semibold tracking-[0.12em] text-brand uppercase">
                {act.actLabel}
              </span>
              <span className="text-[11px] font-semibold tracking-[0.06em] text-foreground/85 uppercase">
                {act.title}
              </span>
              <span className="h-px flex-1 bg-border/80" />
            </div>

            <div className="pbz-timeline">
              {act.chapters.map((ch) => {
                const q = questById.get(ch.questId);
                const isCurrent = currentChapterId === ch.questId;
                const chOpen = openChapters.has(ch.questId);
                const st = q?.status ?? 'todo';
                const ponrs = ch.ponrIds.map((pid) => ponrById.get(pid)).filter((p): p is PonrView => Boolean(p));

                // In filtered missables modes, hide chapters that have no visible missables unless current
                const hasVisibleMissables = ponrs.some((p) =>
                  missables.missables.some((m) => m.ponr === p.id && matchesMissable(m)),
                );
                if (filter !== 'all' && !hasVisibleMissables && !isCurrent) {
                  return null;
                }

                return (
                  <div key={ch.questId} className="relative pb-4 pl-6">
                    {/* Chapter timeline node */}
                    <span
                      className={cn(
                        'absolute top-1 left-0 flex size-3.5 items-center justify-center rounded-full border-2 bg-card',
                        st === 'done' && 'border-jade bg-[#17281e]',
                        isCurrent && 'border-brand bg-[#2d2310] shadow-[0_0_0_4px_rgba(217,185,106,0.2)]',
                        st !== 'done' && !isCurrent && 'border-[#4b515b]',
                      )}
                    >
                      {st === 'done' && <span className="size-1.5 rounded-full bg-jade" />}
                      {isCurrent && <span className="size-1.5 rounded-full bg-brand" />}
                    </span>

                    {/* Main Story Chapter Card */}
                    <div
                      className={cn(
                        'rounded-lg border transition-colors',
                        isCurrent ? 'border-brand-dim bg-[#1d1911]' : 'border-border/80 bg-secondary/85',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setOpenChapters((prev) => {
                            const next = new Set(prev);
                            if (next.has(ch.questId)) next.delete(ch.questId);
                            else next.add(ch.questId);
                            return next;
                          })
                        }
                        className="flex w-full cursor-pointer items-start justify-between gap-2 px-3 py-2 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={cn('text-xs font-semibold', isCurrent ? 'text-brand' : 'text-foreground')}>
                              {q?.title ?? ch.questId}
                            </span>
                            {isCurrent && (
                              <span className="rounded bg-brand px-1.5 py-0.2 text-[9px] font-bold tracking-wider text-brand-foreground uppercase">
                                Current
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                            {ch.regionName}
                            {q?.currentStep && st === 'progress' ? ` · ${q.currentStep}` : ''}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span
                            className={cn(
                              'text-[10px]',
                              st === 'done' ? 'text-jade' : st === 'progress' ? 'text-ochre' : 'text-muted-foreground',
                            )}
                          >
                            {st === 'done' ? 'Done' : st === 'progress' ? 'Active' : 'Upcoming'}
                          </span>
                          {chOpen ? (
                            <ChevronDown className="size-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-3.5 text-muted-foreground" />
                          )}
                        </div>
                      </button>

                      {chOpen && q && (
                        <div className="space-y-1.5 border-t border-border/60 px-3 py-2 text-[11px]">
                          {q.subtitle && <div className="italic text-muted-foreground">{q.subtitle}</div>}
                          <ul className="space-y-1.5">
                            {q.branches.map((br) => (
                              <li
                                key={br.id}
                                className={cn('flex items-start gap-2', br.state === 'none' && 'opacity-50')}
                              >
                                <span
                                  className={cn(
                                    'mt-1.5 size-[6px] shrink-0 rounded-full border',
                                    br.state === 'done' && 'border-jade bg-jade',
                                    br.state === 'active' && 'border-ochre bg-ochre',
                                    br.state === 'none' && 'border-[#5b616b]',
                                  )}
                                />
                                <span className={cn('min-w-0 flex-1', br.state === 'done' && 'text-muted-foreground')}>
                                  {br.text || `Step ${br.id}`}
                                </span>
                                {br.mapRegion && (
                                  <button
                                    type="button"
                                    onClick={() => jumpToBranch(q, br)}
                                    className="shrink-0 cursor-pointer rounded border border-border px-1.5 py-0 text-[10px] leading-4 text-brand hover:border-brand"
                                  >
                                    map
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Points of No Return & Missables anchored to this chapter */}
                    {ponrs.map((p) => {
                      const items = missables.missables.filter((m) => m.ponr === p.id);
                      const visible = items.filter(matchesMissable);
                      const left = items.filter((m) => m.status !== 'done').length;
                      const expanded = ponrExpanded[p.id] ?? (left > 0 || filter !== 'all');

                      if (filter !== 'all' && visible.length === 0) return null;

                      return (
                        <div key={p.id} className="mt-2 ml-1 rounded-lg border border-border/80 bg-card/90 p-2.5">
                          <button
                            type="button"
                            onClick={() => setPonrExpanded((prev) => ({ ...prev, [p.id]: !expanded }))}
                            className="flex w-full cursor-pointer items-start gap-2 text-left"
                          >
                            {p.minor ? (
                              <Flag
                                className={cn(
                                  'mt-0.5 size-3.5 shrink-0',
                                  p.passed ? 'text-ochre' : 'text-muted-foreground',
                                )}
                              />
                            ) : (
                              <ShieldAlert
                                className={cn('mt-0.5 size-3.5 shrink-0', p.passed ? 'text-cinnabar' : 'text-ochre')}
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[11.5px] font-medium leading-snug text-foreground">{p.name}</span>
                              </div>
                              <div className="mt-0.5 text-[10px] text-muted-foreground">
                                <span className={p.passed ? 'text-cinnabar' : 'text-jade'}>
                                  {p.passed ? 'Point of no return passed' : 'Ahead of you'}
                                </span>
                                {items.length > 0 ? ` · ${items.length - left}/${items.length} missables done` : ''}
                              </div>
                            </div>
                            {items.length > 0 &&
                              (expanded ? (
                                <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                              ))}
                          </button>

                          {expanded && visible.length > 0 && (
                            <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
                              {visible.map((m) => {
                                const open = openMissables.has(m.id);
                                return (
                                  <div
                                    key={m.id}
                                    className={cn(
                                      'rounded-md border bg-secondary',
                                      open ? 'border-border' : 'border-transparent',
                                    )}
                                  >
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setOpenMissables((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(m.id)) next.delete(m.id);
                                          else next.add(m.id);
                                          return next;
                                        })
                                      }
                                      className="flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left text-xs hover:text-white"
                                    >
                                      <span
                                        className={cn(
                                          'size-2 shrink-0 rounded-full',
                                          m.status === 'done' && 'bg-jade',
                                          m.status === 'missed' && 'bg-cinnabar shadow-[0_0_0_3px_rgba(201,86,63,0.2)]',
                                          m.status === 'late' && 'border-[1.5px] border-cinnabar bg-transparent',
                                          (m.status === 'open' || m.status === 'ready') && 'bg-ochre',
                                          m.status === 'todo' && 'bg-[#6d7684]',
                                        )}
                                      />
                                      <span
                                        className={cn(
                                          'min-w-0 flex-1 truncate text-[11.5px]',
                                          m.status === 'done' && 'text-muted-foreground',
                                        )}
                                      >
                                        {m.name}
                                      </span>
                                      <span
                                        className={cn(
                                          'shrink-0 text-[10px] whitespace-nowrap',
                                          m.status === 'done' && 'text-jade',
                                          m.status === 'missed' && 'text-cinnabar',
                                          m.status === 'late' && 'text-[#c98a7c]',
                                          (m.status === 'open' || m.status === 'ready') && 'text-ochre',
                                          m.status === 'todo' && 'text-muted-foreground',
                                        )}
                                      >
                                        {MISS_LABEL[m.status]}
                                      </span>
                                    </button>

                                    {open && (
                                      <div className="space-y-2 border-t border-border/60 px-2.5 py-2 pl-6 text-[11px]">
                                        <p className="leading-relaxed text-foreground/80">{m.how}</p>
                                        {m.statusNote && (
                                          <div
                                            className={cn(
                                              'text-[10.5px]',
                                              m.status === 'missed' || m.status === 'late'
                                                ? 'text-cinnabar'
                                                : 'text-ochre',
                                            )}
                                          >
                                            {m.statusNote}
                                          </div>
                                        )}
                                        {m.rewards.length > 0 && (
                                          <div className="flex flex-wrap gap-1">
                                            {m.rewards.map((r) => (
                                              <span
                                                key={r.id}
                                                className={cn(
                                                  'rounded border px-1.5 py-0.5 text-[10px]',
                                                  r.owned
                                                    ? 'border-jade/35 bg-ok-soft text-jade'
                                                    : 'border-border bg-background/60 text-muted-foreground',
                                                )}
                                              >
                                                {r.owned ? '✓ ' : ''}
                                                {r.name}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                        {m.canFix && m.fixText && (
                                          <div className="space-y-1.5 border-t border-border/60 pt-2">
                                            <div className="text-[10.5px] text-brand">{m.fixText}</div>
                                            <Button
                                              size="xs"
                                              disabled={busy}
                                              onClick={() => void applyMissableFix(m.id, m.name)}
                                              className="w-full"
                                            >
                                              <Wrench />
                                              Apply fix to save
                                            </Button>
                                          </div>
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
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
