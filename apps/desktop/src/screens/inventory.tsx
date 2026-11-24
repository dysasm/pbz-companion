import { Backpack, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyPanel, PageHeader, Panel, Toolbar } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApp } from '@/lib/store';
import type { InventoryEntryView } from '@/lib/types';

export function InventoryScreen() {
  const inventory = useApp((s) => s.inventory);
  const pending = useApp((s) => s.pending);
  const compact = useApp((s) => s.settings.compactRows);
  const showIds = useApp((s) => s.settings.showInternalIds);
  const setInventoryAmount = useApp((s) => s.setInventoryAmount);

  const [query, setQuery] = useState('');
  const [ownership, setOwnership] = useState<'owned' | 'all' | 'missing'>('owned');
  const [subcat, setSubcat] = useState('all');

  const subcats = useMemo(() => {
    if (!inventory) return [];
    const set = new Set<string>();
    for (const item of inventory) {
      if (item.subcategory) set.add(item.subcategory);
    }
    return [...set].sort();
  }, [inventory]);

  const rows = useMemo(() => {
    if (!inventory) return [];
    const needle = query.trim().toLowerCase();
    return inventory.filter((item) => {
      if (ownership === 'owned' && !item.owned) return false;
      if (ownership === 'missing' && item.owned) return false;
      if (subcat !== 'all' && item.subcategory !== subcat) return false;
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        item.nameZh.toLowerCase().includes(needle) ||
        item.id.toLowerCase().includes(needle)
      );
    });
  }, [inventory, ownership, query, subcat]);

  if (!inventory) {
    return <div className="h-64 animate-pulse rounded-xl border bg-card/40" />;
  }

  const busy = pending !== null;
  const shown = rows.slice(0, 200);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory"
        description="Search all materials, keys, records, memory flowers, and quest items in InventoryInfos. Set quantity to 0 to remove."
      />

      <Toolbar>
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by English name, Chinese name, or item ID…"
            className="pl-8"
          />
        </div>
        <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
          {(
            [
              ['owned', 'Owned'],
              ['all', 'All'],
              ['missing', 'Not Owned'],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              size="xs"
              variant={ownership === id ? 'secondary' : 'ghost'}
              onClick={() => setOwnership(id)}
            >
              {label}
            </Button>
          ))}
        </div>
        <select
          aria-label="Filter subcategory"
          value={subcat}
          onChange={(e) => setSubcat(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs dark:bg-input/30"
        >
          <option value="all">Every subcategory</option>
          {subcats.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Toolbar>

      {shown.length === 0 ? (
        <EmptyPanel icon={<Backpack />} title="No items match this filter" />
      ) : (
        <Panel
          title="Items"
          description={
            rows.length > shown.length
              ? `Showing first ${shown.length} of ${rows.length} matching items — narrow with search.`
              : `${rows.length} matching items`
          }
          contentClassName="p-0"
        >
          <ul className="divide-y">
            {shown.map((item) => (
              <InventoryRow
                key={item.id}
                item={item}
                busy={busy}
                compact={compact}
                showIds={showIds}
                onSetAmount={(amt) => void setInventoryAmount(item.id, amt)}
              />
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function InventoryRow({
  item,
  busy,
  compact,
  showIds,
  onSetAmount,
}: {
  item: InventoryEntryView;
  busy: boolean;
  compact: boolean;
  showIds: boolean;
  onSetAmount: (amount: number) => void;
}) {
  const [draft, setDraft] = useState(String(item.amount));

  function commit() {
    const val = Number.parseInt(draft, 10);
    if (Number.isNaN(val) || val === item.amount) return;
    onSetAmount(Math.max(0, Math.min(99999, val)));
  }

  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-3 px-4 ${compact ? 'py-1.5' : 'py-2.5'} text-xs hover:bg-accent/25`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{item.name}</span>
          {item.subcategory && (
            <Badge variant="outline" className="text-[10px]">
              {item.subcategory}
            </Badge>
          )}
          {showIds && <span className="font-mono text-[10px] text-muted-foreground">{item.id}</span>}
        </div>
        {!compact && item.description && (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{item.description}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {item.owned ? (
          <>
            <Input
              type="number"
              min={0}
              max={99999}
              disabled={busy}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
              }}
              className="numeric h-7 w-20 font-mono"
            />
            <Button size="icon-sm" variant="ghost" disabled={busy} title="Remove item" onClick={() => onSetAmount(0)}>
              <Trash2 className="text-muted-foreground hover:text-destructive" />
            </Button>
          </>
        ) : (
          <Button size="xs" variant="outline" disabled={busy} onClick={() => onSetAmount(1)}>
            <Plus />
            Add ×1
          </Button>
        )}
      </div>
    </li>
  );
}
