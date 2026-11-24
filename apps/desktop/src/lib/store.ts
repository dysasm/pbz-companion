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
  QuestMapPin,
  QuestsView,
  RawOverviewView,
  SaveMetadata,
  ScanResult,
  WeaponEntryView,
} from './types';

export type PanelTab = 'completion' | 'chronicle' | 'quests' | 'layers';
export type EditorTab = 'overview' | 'weapons' | 'gear' | 'inventory' | 'raw' | 'settings';
export type WorkspaceMode = 'map' | 'editor';

interface MapFocusRequest {
  mapRegionId: string;
  entryKey: string | null;
  u?: number | null;
  v?: number | null;
  seq: number;
}

interface AppStore {
  booted: boolean;
  desktop: boolean;
  info: AppInfo | null;
  settings: AppSettings;
  scanning: boolean;
  scan: ScanResult;
  save: SaveMetadata | null;
  loading: boolean;
  pending: string | null;

  // Map-first PBZ workspace state
  workspaceMode: WorkspaceMode;
  panelTab: PanelTab;
  editorTab: EditorTab;
  activeMapRegion: string;
  mapLayers: Record<string, string>;
  selectedEntryKey: string | null;
  activeQuestPin: QuestMapPin | null;
  hiddenCats: string[];
  showCollectedOnMap: boolean;
  mapFocus: MapFocusRequest | null;
  highlightMissableId: string | null;

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
  openSave: (path: string, silent?: boolean) => Promise<void>;
  closeSave: () => Promise<void>;
  selectSlot: (slotName: string) => Promise<void>;

  setWorkspaceMode: (mode: WorkspaceMode) => void;
  setPanelTab: (tab: PanelTab) => void;
  setEditorTab: (tab: EditorTab) => void;
  setActiveMapRegion: (mapRegionId: string) => void;
  setRegionLayer: (mapRegionId: string, layerId: string) => void;
  setSelectedEntryKey: (key: string | null) => void;
  setActiveQuestPin: (pin: QuestMapPin | null) => void;
  toggleCategoryHidden: (catId: string) => void;
  setShowCollectedOnMap: (show: boolean) => void;
  focusOnMap: (mapRegionId: string, entryKey?: string | null) => void;
  focusQuestPin: (pin: QuestMapPin) => void;
  openMissable: (missableId: string) => void;
  ensureEditorData: (tab: EditorTab, force?: boolean) => Promise<void>;

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

let focusSeq = 0;

export const useApp = create<AppStore>((set, get) => ({
  booted: false,
  desktop: isTauri(),
  info: null,
  settings: DEFAULT_SETTINGS,
  scanning: false,
  scan: { roots: [], saves: [] },
  save: null,
  loading: false,
  pending: null,

  workspaceMode: 'map',
  panelTab: 'completion',
  editorTab: 'overview',
  activeMapRegion: 'xigu',
  mapLayers: {},
  selectedEntryKey: null,
  activeQuestPin: null,
  hiddenCats: ['key', 'treasure'],
  showCollectedOnMap: true,
  mapFocus: null,
  highlightMissableId: null,
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
      // Auto-open the newest discovered save (preferring Live save) right into the map workspace.
      const saves = get().scan.saves;
      const first = saves.find((s) => s.kind === 'Live save') ?? saves[0];
      if (first) {
        await get().openSave(first.path, true);
      }
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

  openSave: async (path, silent = false) => {
    set({ pending: 'Decoding save…', loading: true });
    try {
      const save = await api.openSave(path);
      set({ save, selectedEntryKey: null, ...clearSlotCache() });
      const [overview, world, missables, quests] = await Promise.all([
        api.getOverview(),
        api.getCompletionWorld(),
        api.getMissables(),
        api.getQuests(),
      ]);
      // Default to first region with missing entries, or xigu
      const firstMissingReg = world.regions.find((r) => r.collected < r.total && r.mapRegionId);
      const nextMapRegion = firstMissingReg?.mapRegionId ?? world.mapRegions[0]?.id ?? 'xigu';
      set({ overview, world, missables, quests, activeMapRegion: nextMapRegion });
      if (!silent) {
        toast.success(`Loaded ${save.fileName} · ${save.activeSlot}`);
      }
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      set({ pending: null, loading: false });
    }
  },

  closeSave: async () => {
    try {
      await api.closeSave();
      set({ save: null, selectedEntryKey: null, ...clearSlotCache() });
    } catch (err) {
      toast.error(errMsg(err));
    }
  },

  selectSlot: async (slotName) => {
    set({ pending: 'Switching slot…', loading: true });
    try {
      const save = await api.selectSlot(slotName);
      set({ save, selectedEntryKey: null, ...clearSlotCache() });
      const [overview, world, missables, quests] = await Promise.all([
        api.getOverview(),
        api.getCompletionWorld(),
        api.getMissables(),
        api.getQuests(),
      ]);
      set({ overview, world, missables, quests });
      if (get().workspaceMode === 'editor') {
        await get().ensureEditorData(get().editorTab, true);
      }
      toast.success(`Switched to ${slotName}`);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      set({ pending: null, loading: false });
    }
  },

  setWorkspaceMode: (mode) => {
    set({ workspaceMode: mode });
    if (mode === 'editor') {
      void get().ensureEditorData(get().editorTab);
    }
  },

  setPanelTab: (tab) => set({ panelTab: tab }),

  setEditorTab: (tab) => {
    set({ editorTab: tab, workspaceMode: 'editor' });
    void get().ensureEditorData(tab);
  },

  setActiveMapRegion: (mapRegionId) => set({ activeMapRegion: mapRegionId, selectedEntryKey: null }),

  setRegionLayer: (mapRegionId, layerId) => set((s) => ({ mapLayers: { ...s.mapLayers, [mapRegionId]: layerId } })),

  setSelectedEntryKey: (key) => set({ selectedEntryKey: key, activeQuestPin: key ? null : get().activeQuestPin }),

  setActiveQuestPin: (pin) => set({ activeQuestPin: pin }),

  toggleCategoryHidden: (catId) =>
    set((s) => ({
      hiddenCats: s.hiddenCats.includes(catId) ? s.hiddenCats.filter((c) => c !== catId) : [...s.hiddenCats, catId],
    })),

  setShowCollectedOnMap: (show) => set({ showCollectedOnMap: show }),

  focusOnMap: (mapRegionId, entryKey = null) => {
    focusSeq += 1;
    const state = get();
    // Unhide extra category automatically if locating a key/treasure
    let nextHidden = state.hiddenCats;
    if (entryKey && state.world) {
      const entry = state.world.entries.find((e) => e.key === entryKey);
      if (entry && nextHidden.includes(entry.cat)) {
        nextHidden = nextHidden.filter((c) => c !== entry.cat);
      }
    }
    set({
      workspaceMode: 'map',
      activeMapRegion: mapRegionId,
      selectedEntryKey: entryKey,
      activeQuestPin: null,
      hiddenCats: nextHidden,
      mapFocus: { mapRegionId, entryKey, seq: focusSeq },
    });
  },

  focusQuestPin: (pin) => {
    focusSeq += 1;
    set({
      workspaceMode: 'map',
      activeMapRegion: pin.mapRegion,
      selectedEntryKey: null,
      activeQuestPin: pin,
      mapFocus: { mapRegionId: pin.mapRegion, entryKey: null, u: pin.u, v: pin.v, seq: focusSeq },
    });
  },

  openMissable: (missableId) => {
    set({ panelTab: 'chronicle', highlightMissableId: missableId });
  },

  ensureEditorData: async (tab, force = false) => {
    const state = get();
    if (!state.save) return;
    const need =
      force ||
      (tab === 'overview' && !state.overview) ||
      (tab === 'weapons' && !state.weapons) ||
      (tab === 'gear' && !state.gear) ||
      (tab === 'inventory' && !state.inventory) ||
      (tab === 'raw' && !state.rawOverview);
    if (!need) return;

    set({ loading: true });
    try {
      switch (tab) {
        case 'overview':
          set({ overview: await api.getOverview() });
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
      toast.success(`Saved ${report.slotsModified.join(', ')}`, {
        description: report.backupPath ? `Backup saved: ${report.backupPath}` : undefined,
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
      const [overview, world, missables, quests] = await Promise.all([
        api.getOverview(),
        api.getCompletionWorld(),
        api.getMissables(),
        api.getQuests(),
      ]);
      set({ overview, world, missables, quests });
      if (get().workspaceMode === 'editor') {
        await get().ensureEditorData(get().editorTab, true);
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
      const [overview, world, missables] = await Promise.all([
        api.getOverview(),
        api.getCompletionWorld(),
        api.getMissables(),
      ]);
      set({ save, overview, world, missables, weapons: null, gear: null, inventory: null });
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
      const [overview, world, missables, quests] = await Promise.all([
        api.getOverview(),
        api.getCompletionWorld(),
        api.getMissables(),
        api.getQuests(),
      ]);
      set({ save, overview, world, missables, quests, rawOverview: null });
      toast.success(label ? `Staged fix for ${label}` : 'Staged story fix');
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
      const [weapons, overview, world] = await Promise.all([
        api.getWeapons(),
        api.getOverview(),
        api.getCompletionWorld(),
      ]);
      set({ save, weapons, overview, world });
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
      const [gear, overview, world] = await Promise.all([api.getGear(), api.getOverview(), api.getCompletionWorld()]);
      set({ save, gear, overview, world });
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
      const [inventory, overview, world] = await Promise.all([
        api.getInventory(),
        api.getOverview(),
        api.getCompletionWorld(),
      ]);
      set({ save, inventory, overview, world });
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
      const [rawOverview, missables, quests] = await Promise.all([
        api.getRawOverview(),
        api.getMissables(),
        api.getQuests(),
      ]);
      set({ save, rawOverview, missables, quests });
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
      const [rawOverview, missables, quests] = await Promise.all([
        api.getRawOverview(),
        api.getMissables(),
        api.getQuests(),
      ]);
      set({ save, rawOverview, missables, quests });
      toast.info(`Removed flag ${tag}`);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      set({ pending: null });
    }
  },
}));
