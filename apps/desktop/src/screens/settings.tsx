import { FolderOpen, Monitor, Moon, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Panel } from '@/components/page';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { pickFolder } from '@/lib/api';
import { useApp } from '@/lib/store';
import type { ThemePreference } from '@/lib/types';

export function SettingsScreen() {
  const settings = useApp((s) => s.settings);
  const info = useApp((s) => s.info);
  const setSettings = useApp((s) => s.setSettings);
  const refreshScan = useApp((s) => s.refreshScan);
  const { preference, setPreference } = useTheme();

  async function chooseGameDir() {
    try {
      const path = await pickFolder('Select Phantom Blade Zero install folder (containing ProjectPBZ)');
      if (!path) return;
      await setSettings({ gameDir: path });
      await refreshScan();
      toast.success('Updated game install folder');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Appearance, save discovery paths, and editor preferences." />

      <Panel title="Appearance" description="Choose dark, light, or follow your Windows theme.">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['dark', 'Dark', <Moon key="d" />],
              ['light', 'Light', <Sun key="l" />],
              ['system', 'System', <Monitor key="s" />],
            ] as Array<[ThemePreference, string, React.ReactNode]>
          ).map(([id, label, icon]) => (
            <Button
              key={id}
              size="sm"
              variant={preference === id ? 'default' : 'outline'}
              onClick={() => setPreference(id)}
            >
              {icon}
              {label}
            </Button>
          ))}
        </div>
      </Panel>

      <Panel
        title="Phantom Blade Zero Install Folder"
        description="Used to auto-discover live saves and rolling backups."
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 font-mono text-xs text-muted-foreground">
            {settings.gameDir || 'Not configured (using default Steam paths)'}
          </div>
          <Button size="sm" variant="outline" onClick={() => void chooseGameDir()}>
            <FolderOpen />
            Browse…
          </Button>
        </div>
      </Panel>

      <Panel title="Interface">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium">Compact rows</div>
              <div className="text-[11px] text-muted-foreground">Use tighter row spacing in Inventory lists</div>
            </div>
            <Switch
              checked={settings.compactRows}
              onCheckedChange={(checked) => void setSettings({ compactRows: checked })}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium">Show internal game IDs</div>
              <div className="text-[11px] text-muted-foreground">
                Display raw Unreal keys (e.g. AC_ResistNonBreak, XiGu:Bell:0) beside item names
              </div>
            </div>
            <Switch
              checked={settings.showInternalIds}
              onCheckedChange={(checked) => void setSettings({ showInternalIds: checked })}
            />
          </div>
        </div>
      </Panel>

      {info && (
        <Panel title="About PBZ Companion">
          <div className="grid gap-1 text-xs text-muted-foreground">
            <div>Version: {info.version}</div>
            <div>
              Bundled catalog: {info.mapEntries} map completion entries · {info.quests} quests · {info.catalogItems}{' '}
              items · {info.missables} missables
            </div>
            <div>Optional local override folder: {info.assets.assetsDir}</div>
          </div>
        </Panel>
      )}
    </div>
  );
}
