import { Backpack, Code2, LayoutDashboard, Settings, Shield, Swords } from 'lucide-react';
import type { ReactNode } from 'react';
import { type EditorTab, useApp } from '@/lib/store';
import { cn } from '@/lib/utils';
import { GearScreen } from '@/screens/gear';
import { InventoryScreen } from '@/screens/inventory';
import { OverviewScreen } from '@/screens/overview';
import { RawScreen } from '@/screens/raw';
import { SettingsScreen } from '@/screens/settings';
import { WeaponsScreen } from '@/screens/weapons';

const EDITOR_TABS: Array<{ id: EditorTab; label: string; icon: ReactNode }> = [
  { id: 'overview', label: 'Overview & Resources', icon: <LayoutDashboard /> },
  { id: 'weapons', label: 'Weapons & Edges', icon: <Swords /> },
  { id: 'gear', label: 'Accessories & Meds', icon: <Shield /> },
  { id: 'inventory', label: 'Inventory', icon: <Backpack /> },
  { id: 'raw', label: 'Flags & Raw JSON', icon: <Code2 /> },
  { id: 'settings', label: 'Settings', icon: <Settings /> },
];

export function EditorWorkspace() {
  const editorTab = useApp((s) => s.editorTab);
  const setEditorTab = useApp((s) => s.setEditorTab);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border bg-card/80 px-5 py-2">
        {EDITOR_TABS.map((t) => {
          const active = editorTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setEditorTab(t.id)}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors [&_svg]:size-3.5',
                active
                  ? 'border-brand-dim/70 bg-[#221d12] text-brand'
                  : 'border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1180px] px-7 py-6">
          {editorTab === 'overview' && <OverviewScreen />}
          {editorTab === 'weapons' && <WeaponsScreen />}
          {editorTab === 'gear' && <GearScreen />}
          {editorTab === 'inventory' && <InventoryScreen />}
          {editorTab === 'raw' && <RawScreen />}
          {editorTab === 'settings' && <SettingsScreen />}
        </div>
      </div>
    </div>
  );
}
