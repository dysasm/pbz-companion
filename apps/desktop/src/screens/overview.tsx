import {
  AlertTriangle,
  Bell,
  Clock3,
  Coins,
  Compass,
  Flame,
  Hourglass,
  ScrollText,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Trophy,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader, Panel, StatTile } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { DIFFICULTIES, difficultyLabel, formatNumber, formatPbzStamp, formatPlayTime } from '@/lib/format';
import { useApp } from '@/lib/store';

export function OverviewScreen() {
  const overview = useApp((s) => s.overview);
  const pending = useApp((s) => s.pending);
  const setPlayerResource = useApp((s) => s.setPlayerResource);
  const setGameOption = useApp((s) => s.setGameOption);
  const setWorkspaceMode = useApp((s) => s.setWorkspaceMode);
  const setPanelTab = useApp((s) => s.setPanelTab);
  const focusOnMap = useApp((s) => s.focusOnMap);

  const [dustDraft, setDustDraft] = useState('');
  const [shadowDraft, setShadowDraft] = useState('');
  const [daysDraft, setDaysDraft] = useState('');

  useEffect(() => {
    if (!overview) return;
    setDustDraft(String(overview.dust));
    setShadowDraft(String(overview.spiritShadow));
    setDaysDraft(String(overview.remainingDays));
  }, [overview]);

  if (!overview) {
    return <div className="h-44 animate-pulse rounded-xl border bg-card/40" />;
  }

  const busy = pending !== null;

  function commitNumber(field: string, draft: string, current: number) {
    const parsed = Number.parseInt(draft.replace(/,/g, '').trim(), 10);
    if (Number.isNaN(parsed) || parsed === current) return;
    void setPlayerResource(field, parsed);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {overview.slotName}
            <Badge variant="outline" className="font-mono text-xs">
              NG+{overview.cycleCount}
            </Badge>
            <Badge variant="secondary">{difficultyLabel(overview.difficulty)}</Badge>
            {overview.finishedGame && <Badge variant="ok">Story Cleared</Badge>}
          </span>
        }
        description={`Saved ${formatPbzStamp(overview.dateTime)} · Level ${overview.currentLevel || 'Unknown'} · Last bell ${overview.lastBellId || '—'}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setWorkspaceMode('map')}>
              <Compass />
              Back to Map
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPanelTab('chronicle');
                setWorkspaceMode('map');
              }}
            >
              <AlertTriangle />
              Story Chronicle
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<Trophy />}
          label="Map Completion"
          value={`${overview.overallPercent}%`}
          detail={`${formatNumber(overview.overallCollected)} / ${formatNumber(overview.overallTotal)} collectibles`}
          accent
        />
        <StatTile
          icon={<Clock3 />}
          label="Play Time"
          value={formatPlayTime(overview.gameTimeSeconds)}
          detail={`Current cycle ${formatPlayTime(overview.cycleGameTimeSeconds)}`}
        />
        <StatTile
          icon={<Skull />}
          label="Deaths & Bosses"
          value={`${formatNumber(overview.diedTimes)} deaths`}
          detail={`${formatNumber(overview.counts.bossesRecorded)} boss encounters recorded`}
        />
        <StatTile
          icon={<ScrollText />}
          label="Quests"
          value={`${overview.counts.questsDone} / ${overview.counts.questsTotal}`}
          detail={`${overview.counts.questsInProgress} in progress · ${overview.counts.missablesMissed} missed`}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel
          title="Region Completion"
          description="Exact in-game DT_MapItemData counters. Click any region to inspect it on the World Map."
          actions={
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setPanelTab('completion');
                setWorkspaceMode('map');
              }}
            >
              Open map
            </Button>
          }
          contentClassName="grid gap-3 sm:grid-cols-2"
        >
          {overview.regions.map((reg) => {
            const full = reg.total > 0 && reg.collected === reg.total;
            return (
              <button
                key={reg.id}
                type="button"
                onClick={() => {
                  if (reg.mapRegionId) focusOnMap(reg.mapRegionId);
                  else setWorkspaceMode('map');
                }}
                className="group flex cursor-pointer flex-col gap-2 rounded-lg border bg-background/40 p-3 text-left transition-colors hover:border-brand/50 hover:bg-accent/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium group-hover:text-brand">{reg.name}</span>
                  <span className={`numeric text-xs font-semibold ${full ? 'text-ok-strong' : ''}`}>
                    {reg.percent}%
                  </span>
                </div>
                <Progress value={reg.percent} className="h-1.5" />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="numeric">
                    {reg.collected} / {reg.total}
                  </span>
                  <span>{full ? 'Complete' : `${reg.total - reg.collected} missing`}</span>
                </div>
              </button>
            );
          })}
        </Panel>

        <div className="space-y-5">
          <Panel
            title="Player Resources & Difficulty"
            description="Edits stage in memory until you press Save (Ctrl+S)."
          >
            <div className="space-y-3.5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <label
                    htmlFor="res-dust"
                    className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"
                  >
                    <Coins className="size-3 text-brand" /> Dust
                  </label>
                  <Input
                    id="res-dust"
                    type="number"
                    min={0}
                    max={999999999}
                    disabled={busy}
                    value={dustDraft}
                    onChange={(e) => setDustDraft(e.target.value)}
                    onBlur={() => commitNumber('Dust', dustDraft, overview.dust)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitNumber('Dust', dustDraft, overview.dust);
                    }}
                    className="numeric font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="res-shadow"
                    className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"
                  >
                    <Flame className="size-3 text-brand" /> Spirit Shadow
                  </label>
                  <Input
                    id="res-shadow"
                    type="number"
                    min={0}
                    max={999999999}
                    disabled={busy}
                    value={shadowDraft}
                    onChange={(e) => setShadowDraft(e.target.value)}
                    onBlur={() => commitNumber('SpiritShadow', shadowDraft, overview.spiritShadow)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitNumber('SpiritShadow', shadowDraft, overview.spiritShadow);
                    }}
                    className="numeric font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="res-days"
                    className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"
                  >
                    <Hourglass className="size-3 text-brand" /> Days Left
                  </label>
                  <Input
                    id="res-days"
                    type="number"
                    min={0}
                    max={999}
                    disabled={busy}
                    value={daysDraft}
                    onChange={(e) => setDaysDraft(e.target.value)}
                    onBlur={() => commitNumber('RemainingDays', daysDraft, overview.remainingDays)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitNumber('RemainingDays', daysDraft, overview.remainingDays);
                    }}
                    className="numeric font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/40 p-3">
                <div>
                  <div className="text-xs font-medium">Difficulty</div>
                  <div className="text-[11px] text-muted-foreground">PBZGameSystem.DifficultModeByte</div>
                </div>
                <select
                  aria-label="Difficulty"
                  disabled={busy}
                  value={overview.difficulty}
                  onChange={(e) => void setGameOption('DifficultModeByte', Number(e.target.value))}
                  className="h-8 rounded-md border border-input bg-background px-2.5 text-xs dark:bg-input/30"
                >
                  {DIFFICULTIES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border bg-background/40 p-3">
                <div>
                  <div className="text-xs font-medium">Nightmare Mode Unlocked</div>
                  <div className="text-[11px] text-muted-foreground">Allows selecting Nightmare difficulty</div>
                </div>
                <Switch
                  disabled={busy}
                  checked={overview.canSelectNightmare}
                  onCheckedChange={(checked) => void setGameOption('bCanSelectNightMare', checked)}
                />
              </div>
            </div>
          </Panel>

          <Panel title="Equipped Loadout & Collection">
            <div className="space-y-3 text-xs">
              <LoadoutRow icon={<Swords />} label="Main Weapons" items={overview.equippedWeapons} />
              <LoadoutRow icon={<Sparkles />} label="Phantom Edges" items={overview.equippedPhantomEdges} />
              <LoadoutRow icon={<Shield />} label="Accessories" items={overview.equippedAccessories} />
              <LoadoutRow
                icon={<Bell />}
                label="Medicine Slots"
                items={[overview.topMedicine, overview.bottomMedicine].filter(Boolean)}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-4 sm:grid-cols-4">
              <MiniCount label="Bells" value={`${overview.counts.bellsActivated}`} />
              <MiniCount label="Weapons" value={`${overview.counts.weaponsOwned}/${overview.counts.weaponsTotal}`} />
              <MiniCount label="Edges" value={`${overview.counts.phantomOwned}/${overview.counts.phantomTotal}`} />
              <MiniCount
                label="Accessories"
                value={`${overview.counts.accessoriesOwned}/${overview.counts.accessoriesTotal}`}
              />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function LoadoutRow({ icon, label, items }: { icon: React.ReactNode; label: string; items: string[] }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </span>
      <div className="flex flex-wrap justify-end gap-1">
        {items.length > 0 ? (
          items.map((name) => (
            <Badge key={name} variant="secondary" className="text-[11px]">
              {name}
            </Badge>
          ))
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}

function MiniCount({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background/40 px-2.5 py-2 text-center">
      <div className="numeric text-xs font-semibold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
