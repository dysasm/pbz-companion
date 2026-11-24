import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  MapPin,
  ScrollText,
  Search,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyPanel, PageHeader, Panel, StatTile, Toolbar } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApp } from '@/lib/store';
import type { QuestItemView } from '@/lib/types';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'progress' | 'notdone' | 'done';
type SortMode = 'region' | 'story';

const STATUS_BADGE: Record<QuestItemView['status'], { label: string; variant: 'ok' | 'warn' | 'bad' | 'secondary' }> = {
  done: { label: 'Done', variant: 'ok' },
  progress: { label: 'In progress', variant: 'warn' },
  todo: { label: 'Not started', variant: 'secondary' },
  failed: { label: 'Failed', variant: 'bad' },
};

export function QuestsScreen() {
  const quests = useApp((s) => s.quests);
  const focusOnMap = useApp((s) => s.focusOnMap);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortMode>('region');
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  const groups = useMemo(() => {
    if (!quests) return [];
    const needle = query.trim().toLowerCase();
    const visible = quests.quests.filter((q) => {
      if (filter === 'progress' && q.status !== 'progress') return false;
      if (filter === 'notdone' && q.status === 'done') return false;
      if (filter === 'done' && q.status !== 'done') return false;
      if (!needle) return true;
      return (
        q.title.toLowerCase().includes(needle) ||
        q.regionName.toLowerCase().includes(needle) ||
        q.categoryName.toLowerCase().includes(needle) ||
        q.id.toLowerCase().includes(needle)
      );
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
      const key = q.regionName;
      const list = byRegion.get(key) ?? [];
      list.push(q);
      byRegion.set(key, list);
    }
    return [...byRegion.entries()];
  }, [filter, query, quests, sort]);

  if (!quests) {
    return <div className="h-64 animate-pulse rounded-xl border bg-card/40" />;
  }

  function toggleOpen(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Quest Log"
        description="Read directly from Narrative.NarrativeSavedQuests, mirroring the in-game log across Story, Mysteries, Tales, and Collectibles."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<CheckCircle2 />}
          label="Done"
          value={quests.done}
          detail={`of ${quests.quests.length} quests`}
        />
        <StatTile icon={<CircleDot />} label="In Progress" value={quests.inProgress} accent={quests.inProgress > 0} />
        <StatTile icon={<Circle />} label="Not Started" value={quests.notStarted} />
        <StatTile icon={<XCircle />} label="Failed" value={quests.failed} />
      </div>

      <Toolbar>
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search quests by title, region, or category…"
            className="pl-8"
          />
        </div>
        <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
          {(
            [
              ['all', 'All'],
              ['progress', 'In progress'],
              ['notdone', 'Not done'],
              ['done', 'Done'],
            ] as const
          ).map(([id, label]) => (
            <Button key={id} size="xs" variant={filter === id ? 'secondary' : 'ghost'} onClick={() => setFilter(id)}>
              {label}
            </Button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
          <Button size="xs" variant={sort === 'region' ? 'secondary' : 'ghost'} onClick={() => setSort('region')}>
            By region
          </Button>
          <Button size="xs" variant={sort === 'story' ? 'secondary' : 'ghost'} onClick={() => setSort('story')}>
            By start time
          </Button>
        </div>
      </Toolbar>

      {groups.length === 0 ? (
        <EmptyPanel icon={<ScrollText />} title="No quests match this filter" />
      ) : (
        <div className="space-y-4">
          {groups.map(([groupName, list]) => {
            const doneHere = list.filter((q) => q.status === 'done').length;
            return (
              <Panel
                key={groupName}
                title={groupName}
                description={`${doneHere} of ${list.length} completed`}
                contentClassName="p-0"
              >
                <ul className="divide-y">
                  {list.map((q) => {
                    const expanded = openIds.has(q.id);
                    const meta = STATUS_BADGE[q.status];
                    return (
                      <li key={q.id}>
                        <button
                          type="button"
                          onClick={() => toggleOpen(q.id)}
                          className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left text-xs hover:bg-accent/30"
                        >
                          <div className="flex min-w-0 items-start gap-2.5">
                            {expanded ? (
                              <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{q.title || q.id}</span>
                                <Badge variant="outline" className="text-[10px]">
                                  {q.categoryName}
                                </Badge>
                                {q.tracked && (
                                  <Badge variant="default" className="text-[10px]">
                                    Tracked
                                  </Badge>
                                )}
                              </div>
                              {q.currentStep && !expanded && (
                                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                  Current: {q.currentStep}
                                </div>
                              )}
                            </div>
                          </div>
                          <Badge variant={meta.variant}>{meta.label}</Badge>
                        </button>

                        {expanded && (
                          <div className="space-y-3 border-t bg-background/40 px-10 py-3.5 text-xs">
                            {q.subtitle && <p className="italic text-muted-foreground">{q.subtitle}</p>}
                            <ul className="space-y-2">
                              {q.branches.map((br) => (
                                <li
                                  key={br.id}
                                  className={cn(
                                    'flex items-start justify-between gap-3 rounded-lg border px-3 py-2',
                                    br.state === 'active'
                                      ? 'border-brand/40 bg-brand/5'
                                      : br.state === 'done'
                                        ? 'bg-card/50'
                                        : 'bg-card/20 opacity-60',
                                  )}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium">{br.text || `Step ${br.id}`}</div>
                                    {br.details && (
                                      <div className="mt-0.5 text-[11px] text-muted-foreground">{br.details}</div>
                                    )}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1.5">
                                    {br.taskTotal !== null && br.taskDone !== null && (
                                      <Badge variant="outline" className="numeric">
                                        {br.taskDone}/{br.taskTotal}
                                      </Badge>
                                    )}
                                    {br.state !== 'none' && (
                                      <Badge
                                        variant={br.state === 'done' ? 'ok' : br.state === 'active' ? 'warn' : 'bad'}
                                      >
                                        {br.state}
                                      </Badge>
                                    )}
                                    {br.mapRegion && (
                                      <Button
                                        size="xs"
                                        variant="ghost"
                                        onClick={() => {
                                          if (br.mapRegion) focusOnMap(br.mapRegion);
                                        }}
                                      >
                                        <MapPin />
                                        Map
                                      </Button>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
