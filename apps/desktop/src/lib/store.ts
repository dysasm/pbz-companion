import { toast } from 'sonner';
import { create } from 'zustand';
import { api, isTauri } from './api';
import type {
  AppInfo,
  AppSettings,
  CompletionWorldView,
  GearEntryView,
  InventoryEntryView,
  MissablesView,
  OverviewView,
  QuestsView,
  RawOverviewView,
  SaveMetadata,
  ScanResult,
  Section,
  WeaponEntryView,
} from './types';

interface AppStore {
  booted: boolean;
  desktop: boolean;
  info: AppInfo | null;
  settings: AppSettings;
  scanning: boolean;
  scan: ScanResult;
  save: SaveMetadata | null;
  section: Section;
  loading: boolean;
  pending: string | null;

  // Map focus state (so Completion / Quests can jump straight to a region/marker on World Map)
  focusMapRegion: string | null;
  focusEntryKey: string | null;

  // Cached screen data for active slot
  overview: OverviewView | null;
  world: CompletionWorldView | null;
  missables: MissablesView | null;
  quests: QuestsView | null;
  weapons: WeaponEntryView[] | null;
  gear: GearEntryView[] | null;
  inventory: InventoryEntryView[] | null;
  rawOverview: RawOverviewView | null;

  boot: () => Promise<void>;
  refreshScan: (extraFolder?: string | null) => Promise<void>;
  setSettings: (patch: Partial<AppSettings>) => Promise<void>;
  openSave: (path: string) => Promise<void>;
  closeSave: () => Promise<void>;
  selectSlot: (slotName: string) => Promise<void>;
  setSection: (section: Section) => void;
  focusOnMap: (mapRegionId: string, entryKey?: string | null) => void;
  clearMapFocus: () => void;
  loadSection: (section: Section, force?: boolean) => Promise<void>;
  saveNow: () => Promise<boolean>;
  discardChanges: () => Promise<void>;
  backupNow: () => Promise<void>;

  // Mutations
  setPlayerResource: (field: string, value: number) => Promise<void>;
  setGameOption: (field: string, value: number | boolean) => Promise<void>;
  markCompletionEntries: (keys: string[], label?: string) => Promise<void>;
  applyMissableFix: (missableId: string, label?: string) => Promise<void>;
  updateWeapon: (id: string, kind: 'weapon' | 'phantom', level: number, snapSoul: boolean) => Promise<void>;
  updateGear: (id: string, kind: 'accessory' | 'medicine', level: number, maxCharges?: number | null) => Promise<void>;
  setInventoryAmount: (id: string, amount: number) => Promise<void>;
  addGlobalTag: (tag: string) => Promise<void>;
  removeGlobalTag: (tag: string) => Promise<void>;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  gameDir: null,
  lastFolder: null,
  compactRows: false,
  showInternalIds: false,
};

function clearSlotCache() {
  return {
    overview: null,
    world: null,
    missables: null,
    quests: null,
    weapons: null,
    gear: null,
    inventory: null,
    rawOverview: null,
  };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const useApp = create<AppStore>((set, get) => ({
  booted: false,
  desktop: isTauri(),
  info: null,
  settings: DEFAULT_SETTINGS,
  scanning: false,
  scan: { roots: [], saves: [] },
  save: null,
  section: 'overview',
  loading: false,
  pending: null,
  focusMapRegion: null,
  focusEntryKey: null,
  ...clearSlotCache(),

  boot: async () => {
    const desktop = isTauri();
    if (!desktop) {
      set({ booted: true, desktop: false });
      return;
    }
    try {
      const [info, settings] = await Promise.all([api.getAppInfo(), api.getSettings()]);
      set({ info, settings, booted: true, desktop: true });
      await get().refreshScan();
    } catch (err) {
      toast.error(errMsg(err));
      set({ booted: true, desktop: true });
    }
  },

  refreshScan: async (extraFolder) => {
    set({ scanning: true });
    try {
      const scan = await api.scanSaves(extraFolder);
      set({ scan });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      set({ scanning: false });
    }
  },

  setSettings: async (patch) => {
    try {
      const next = await api.updateSettings(patch);
      set({ settings: next });
    } catch (err) {
      toast.error(errMsg(err));
    }
  },

  openSave: async (path) => {
    set({ pending: 'Opening save…', loading: true });
    try {
      const save = await api.openSave(path);
      set({ save, section: 'overview', ...clearSlotCache() });
      const [overview, world] = await Promise.all([api.getOverview(), api.getCompletionWorld()]);
      set({ overview, world });
      toast.success(`Opened ${save.fileName} · ${save.activeSlot}`);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      set({ pending: null, loading: false });
    }
  },

  closeSave: async () => {
    try {
      await api.closeSave();
      set({ save: null, section: 'overview', ...clearSlotCache() });
    } catch (err) {
      toast.error(errMsg(err));
    }
  },

  selectSlot: async (slotName) => {
    set({ pending: 'Switching slot…', loading: true });
    try {
      const save = await api.selectSlot(slotName);
      set({ save, ...clearSlotCache() });
      await get().loadSection(get().section, true);
      if (get().section !== 'overview') {
        const overview = await api.getOverview();
        set({ overview });
      }
      toast.success(`Switched to ${slotName}`);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      set({ pending: null, loading: false });
    }
  },

  setSection: (section) => {
    set({ section });
    void get().loadSection(section);
  },

  focusOnMap: (mapRegionId, entryKey = null) => {
    set({ section: 'world', focusMapRegion: mapRegionId, focusEntryKey: entryKey });
    void get().loadSection('world');
  },

  clearMapFocus: () => set({ focusMapRegion: null, focusEntryKey: null }),

  loadSection: async (section, force = false) => {
    const state = get();
    if (!state.save) return;
    const needed =
      force ||
      (section === 'overview' && !state.overview) ||
      ((section === 'world' || section === 'completion') && !state.world) ||
      (section === 'missables' && !state.missables) ||
      (section === 'quests' && !state.quests) ||
      (section === 'weapons' && !state.weapons) ||
      (section === 'gear' && !state.gear) ||
      (section === 'inventory' && !state.inventory) ||
      (section === 'raw' && !state.rawOverview);
    if (!needed) return;

    set({ loading: true });
    try {
      switch (section) {
        case 'overview':
          set({ overview: await api.getOverview() });
          break;
        case 'world':
        case 'completion':
          set({ world: await api.getCompletionWorld() });
          break;
        case 'missables':
          set({ missables: await api.getMissables() });
          break;
        case 'quests':
          set({ quests: await api.getQuests() });
          break;
        case 'weapons':
          set({ weapons: await api.getWeapons() });
          break;
        case 'gear':
          set({ gear: await api.getGear() });
          break;
        case 'inventory':
          set({ inventory: await api.getInventory() });
          break;
        case 'raw':
          set({ rawOverview: await api.getRawOverview() });
          break;
        case 'settings':
          break;
      }
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      set({ loading: false });
    }
  },

  saveNow: async () => {
    const state = get();
    if (!state.save) return false;
    if (!state.save.dirty) {
      toast.info('No unsaved changes.');
      return true;
    }
    set({ pending: 'Verifying and writing save…' });
    try {
      const report = await api.writeSave();
      const save = await api.getSaveMetadata();
      set({ save });
      toast.success(`Saved ${report.slotsModified.join(', ')} (${(report.totalBytes / 1024 / 1024).toFixed(2)} MB)`, {
        description: report.backupPath ? `Backup saved to ${report.backupPath}` : undefined,
      });
      return true;
    } catch (err) {
      toast.error(errMsg(err));
      return false;
    } finally {
      set({ pending: null });
    }
  },

  discardChanges: async () => {
    set({ pending: 'Discarding edits…' });
    try {
      const save = await api.discardChanges();
      set({ save, ...clearSlotCache() });
      await get().loadSection(get().section, true);
      if (get().section !== 'overview') {
        set({ overview: await api.getOverview() });
      }
      toast.info('Unsaved changes discarded.');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      set({ pending: null });
    }
  },

  backupNow: async () => {
    set({ pending: 'Creating backup…' });
    try {
      const path = await api.createBackup();
      const save = await api.getSaveMetadata();
      set({ save });
      toast.success('Backup created', { description: path });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      set({ pending: null });
    }
  },

  setPlayerResource: async (field, value) => {
    set({ pending: `Updating ${field}…` });
    try {
      const save = await api.setPlayerResource(field, value);
      const overview = await api.getOverview();
      set({ save, overview });
      toast.success(`Updated ${field}`);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      set({ pending: null });
    }
  },

  setGameOption: async (field, value) => {
    set({ pending: 'Updating game option…' });
    try {
      const save = await api.setGameOption(field, value);
      const overview = await api.getOverview();
      set({ save, overview });
      toast.success('Updated save option');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      set({ pending: null });
    }
  },

  markCompletionEntries: async (keys, label) => {
    if (keys.length === 0) return;
    set({ pending: 'Updating completion…' });
    try {
      const save = await api.markCompletionEntries(keys);
      const [overview, world] = await Promise.all([api.getOverview(), api.getCompletionWorld()]);
      set({ save, overview, world, missables: null, weapons: null, gear: null, inventory: null });
      toast.success(label ?? `Marked ${keys.length} entr${keys.length === 1 ? 'y' : 'ies'} collected`);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      set({ pending: null });
    }
  },

  applyMissableFix: async (missableId, label) => {
    set({ pending: 'Applying story fix…' });
    try {
      const save = await api.applyMissableFix(missableId);
      const [overview, missables] = await Promise.all([api.getOverview(), api.getMissables()]);
      set({ save, overview, missables, world: null, rawOverview: null });
      toast.success(label ? `Applied fix for ${label}` : 'Applied story fix');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      set({ pending: null });
    }
  },

  updateWeapon: async (id, kind, level, snapSoul) => {
    set({ pending: 'Updating weapon…' });
    try {
      const save = await api.updateWeapon(id, kind, level, snapSoul);
      const [weapons, overview] = await Promise.all([api.getWeapons(), api.getOverview()]);
      set({ save, weapons, overview, world: null });
      toast.success('Updated weapon');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      set({ pending: null });
    }
  },

  updateGear: async (id, kind, level, maxCharges) => {
    set({ pending: 'Updating gear…' });
    try {
      const save = await api.updateGear(id, kind, level, maxCharges);
      const [gear, overview] = await Promise.all([api.getGear(), api.getOverview()]);
      set({ save, gear, overview, world: null });
      toast.success('Updated gear');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      set({ pending: null });
    }
  },

  setInventoryAmount: async (id, amount) => {
    set({ pending: 'Updating inventory…' });
    try {
      const save = await api.setInventoryAmount(id, amount);
      const [inventory, overview] = await Promise.all([api.getInventory(), api.getOverview()]);
      set({ save, inventory, overview, world: null });
      toast.success(amount === 0 ? 'Removed item' : 'Updated item quantity');
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      set({ pending: null });
    }
  },

  addGlobalTag: async (tag) => {
    set({ pending: 'Adding story flag…' });
    try {
      const save = await api.addGlobalTag(tag);
      const rawOverview = await api.getRawOverview();
      set({ save, rawOverview, missables: null, quests: null });
      toast.success(`Added flag ${tag}`);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      set({ pending: null });
    }
  },

  removeGlobalTag: async (tag) => {
    set({ pending: 'Removing story flag…' });
    try {
      const save = await api.removeGlobalTag(tag);
      const rawOverview = await api.getRawOverview();
      set({ save, rawOverview, missables: null, quests: null });
      toast.info(`Removed flag ${tag}`);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      set({ pending: null });
    }
  },
}));
