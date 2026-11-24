import {
  AlertTriangle,
  Backpack,
  CheckSquare,
  Code2,
  Compass,
  LayoutDashboard,
  ScrollText,
  Settings,
  Shield,
  Swords,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/lib/store';
import type { Section } from '@/lib/types';
import { cn } from '@/lib/utils';

interface NavGroup {
  label: string;
  items: Array<{ id: Section; label: string; icon: ReactNode }>;
}

const GROUPS: NavGroup[] = [
  {
    label: 'Companion',
    items: [
      { id: 'overview', label: 'Overview', icon: <LayoutDashboard /> },
      { id: 'world', label: 'World Map', icon: <Compass /> },
      { id: 'completion', label: 'Map Completion', icon: <CheckSquare /> },
      { id: 'missables', label: 'Missables', icon: <AlertTriangle /> },
      { id: 'quests', label: 'Quests', icon: <ScrollText /> },
    ],
  },
  {
    label: 'Save Editor',
    items: [
      { id: 'weapons', label: 'Weapons & Edges', icon: <Swords /> },
      { id: 'gear', label: 'Accessories & Meds', icon: <Shield /> },
      { id: 'inventory', label: 'Inventory', icon: <Backpack /> },
      { id: 'raw', label: 'Flags & Raw JSON', icon: <Code2 /> },
    ],
  },
  {
    label: 'App',
    items: [{ id: 'settings', label: 'Settings', icon: <Settings /> }],
  },
];

export function Sidebar() {
  const section = useApp((s) => s.section);
  const setSection = useApp((s) => s.setSection);
  const overview = useApp((s) => s.overview);

  function badgeFor(id: Section): ReactNode {
    if (!overview) return null;
    if (id === 'completion' || id === 'world') {
      return <span className="numeric text-[11px] font-medium text-muted-foreground">{overview.overallPercent}%</span>;
    }
    if (id === 'missables' && overview.counts.missablesMissed > 0) {
      return (
        <Badge variant="bad" className="px-1.5 py-0 text-[10px]">
          {overview.counts.missablesMissed}
        </Badge>
      );
    }
    if (id === 'quests') {
      return (
        <span className="numeric text-[11px] text-muted-foreground">
          {overview.counts.questsDone}/{overview.counts.questsTotal}
        </span>
      );
    }
    return null;
  }

  return (
    <aside className="scroll-thin flex w-56 shrink-0 flex-col border-r bg-sidebar p-3 overflow-y-auto">
      <nav className="space-y-5">
        {GROUPS.map((group) => (
          <div key={group.label} className="space-y-1">
            <div className="px-2 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={cn(
                      'flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors',
                      active ? 'bg-brand/12 text-brand' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <span className="flex items-center gap-2.5 [&_svg]:size-3.5">
                      {item.icon}
                      {item.label}
                    </span>
                    {badgeFor(item.id)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
