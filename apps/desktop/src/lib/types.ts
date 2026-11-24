export type Section =
  | 'overview'
  | 'world'
  | 'completion'
  | 'missables'
  | 'quests'
  | 'weapons'
  | 'gear'
  | 'inventory'
  | 'raw'
  | 'settings';

export type ThemePreference = 'dark' | 'light' | 'system';

export interface AssetStatus {
  assetsDir: string;
  hasGamedata: boolean;
  hasQuests: boolean;
  hasCatalog: boolean;
  hasMapPositions: boolean;
  mapImageCount: number;
  iconCount: number;
  ready: boolean;
}

export interface AppInfo {
  version: string;
  catalogItems: number;
  mapEntries: number;
  quests: number;
  missables: number;
  regions: number;
  assets: AssetStatus;
}

export interface AppSettings {
  theme: ThemePreference;
  gameDir: string | null;
  lastFolder: string | null;
  compactRows: boolean;
  showInternalIds: boolean;
}

export interface DiscoveredSave {
  path: string;
  fileName: string;
  kind: string;
  folder: string;
  modifiedEpochMs: number;
  sizeBytes: number;
}

export interface ScanResult {
  roots: string[];
  saves: DiscoveredSave[];
}

export interface SlotSummary {
  name: string;
  dateTime: string;
  cycleCount: number;
  difficulty: number;
  gameTimeSeconds: number;
  currentLevel: string;
  lastBellId: string;
  alg: number;
  rawSize: number;
  isNewest: boolean;
  dirty: boolean;
  error: string | null;
}

export interface SaveMetadata {
  path: string;
  fileName: string;
  sizeBytes: number;
  activeSlot: string;
  slots: SlotSummary[];
  dirty: boolean;
  pendingChanges: number;
  backupPath: string | null;
}

export interface WriteReport {
  path: string;
  backupPath: string | null;
  slotsModified: string[];
  totalBytes: number;
}

export interface RegionCompletionSummary {
  id: string;
  name: string;
  mapRegionId: string | null;
  collected: number;
  total: number;
  percent: number;
  totals: boolean;
}

export interface OverviewCounts {
  bellsActivated: number;
  weaponsOwned: number;
  weaponsTotal: number;
  phantomOwned: number;
  phantomTotal: number;
  accessoriesOwned: number;
  accessoriesTotal: number;
  medicinesOwned: number;
  medicinesTotal: number;
  inventoryItems: number;
  questsDone: number;
  questsInProgress: number;
  questsTotal: number;
  missablesMissed: number;
  missablesOpen: number;
  bossesRecorded: number;
  globalTags: number;
}

export interface OverviewView {
  slotName: string;
  dateTime: string;
  cycleCount: number;
  difficulty: number;
  canSelectNightmare: boolean;
  finishedGame: boolean;
  gameTimeSeconds: number;
  cycleGameTimeSeconds: number;
  diedTimes: number;
  currentLevel: string;
  lastBellId: string;
  dust: number;
  spiritShadow: number;
  remainingDays: number;
  ultimateCharge: number;
  ultimateChargeCount: number;
  overallPercent: number;
  overallCollected: number;
  overallTotal: number;
  regions: RegionCompletionSummary[];
  equippedWeapons: string[];
  equippedPhantomEdges: string[];
  equippedAccessories: string[];
  topMedicine: string;
  bottomMedicine: string;
  counts: OverviewCounts;
}

export interface CompletionEntryView {
  key: string;
  cat: string;
  arr: string;
  region: string;
  subMap: string;
  subMapName: string;
  itemId: string | null;
  name: string;
  description: string | null;
  how: string | null;
  petal: string | null;
  status: 'done' | 'missing' | 'oldcycle';
  extra: boolean;
  mapRegion: string | null;
  u: number | null;
  v: number | null;
  insideMap: boolean;
}

export interface CategoryProgress {
  id: string;
  name: string;
  extra: boolean;
  collected: number;
  total: number;
}

export interface MapLayerView {
  id: string;
  path: string;
  label: string;
}

export interface RegionMapMetaView {
  id: string;
  completionRegionId: string;
  name: string;
  width: number;
  height: number;
  layers: MapLayerView[];
}

export interface CompletionWorldView {
  overallPercent: number;
  overallCollected: number;
  overallTotal: number;
  regions: RegionCompletionSummary[];
  mapRegions: RegionMapMetaView[];
  categories: CategoryProgress[];
  entries: CompletionEntryView[];
}

export interface PonrView {
  id: string;
  name: string;
  region: string;
  tag: string;
  minor: boolean;
  note: string;
  chapter: string | null;
  chapterNext: string | null;
  passed: boolean;
}

export interface MissableRewardView {
  id: string;
  name: string;
  owned: boolean;
}

export interface MissableItemView {
  id: string;
  name: string;
  region: string;
  before: string;
  how: string;
  ponr: string;
  status: 'done' | 'ready' | 'missed' | 'open' | 'todo' | 'late';
  statusNote: string | null;
  rewards: MissableRewardView[];
  progressCurrent: number | null;
  progressTotal: number | null;
  progressLabel: string | null;
  canFix: boolean;
  fixText: string | null;
  noFixNote: string | null;
}

export interface MissablesView {
  pointsOfNoReturn: PonrView[];
  missables: MissableItemView[];
}

export interface QuestBranchView {
  id: string;
  text: string;
  details: string | null;
  state: 'done' | 'active' | 'failed' | 'none';
  dirtyTime: string;
  taskDone: number | null;
  taskTotal: number | null;
  mapRegion: string | null;
  u: number | null;
  v: number | null;
  insideMap: boolean;
}

export interface QuestMapPin {
  questId: string;
  questTitle: string;
  categoryName: string;
  branchId: string;
  stepText: string;
  details: string | null;
  mapRegion: string;
  u: number;
  v: number;
  insideMap: boolean;
}

export interface QuestItemView {
  id: string;
  cls: string;
  category: string;
  categoryName: string;
  title: string;
  subtitle: string | null;
  region: string | null;
  regionName: string;
  status: 'done' | 'progress' | 'todo' | 'failed';
  tracked: boolean;
  startTime: number | null;
  currentStep: string | null;
  branches: QuestBranchView[];
  missableIds: string[];
}

export interface QuestsView {
  done: number;
  inProgress: number;
  notStarted: number;
  failed: number;
  quests: QuestItemView[];
}

export interface WeaponEntryView {
  id: string;
  name: string;
  nameZh: string;
  description: string;
  kind: 'weapon' | 'phantom';
  owned: boolean;
  equipped: boolean;
  level: number;
  snapSoul: boolean;
  acquiredCycle: number;
  saveKey: string;
}

export interface GearEntryView {
  id: string;
  name: string;
  nameZh: string;
  description: string;
  kind: 'accessory' | 'medicine';
  owned: boolean;
  equipped: boolean;
  level: number;
  currentCharges: number;
  maxCharges: number;
  acquiredCycle: number;
  saveKey: string;
}

export interface InventoryEntryView {
  id: string;
  name: string;
  nameZh: string;
  subcategory: string;
  description: string;
  owned: boolean;
  amount: number;
  maxAmount: number;
  acquiredCycle: number;
  saveKey: string;
}

export interface RawSectionSummary {
  key: string;
  kind: string;
  len: number;
}

export interface RawOverviewView {
  sections: RawSectionSummary[];
  globalTags: string[];
}
