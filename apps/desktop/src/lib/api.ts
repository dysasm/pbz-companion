import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type {
  AppInfo,
  AppSettings,
  AssetStatus,
  CompletionWorldView,
  GearEntryView,
  InventoryEntryView,
  MissablesView,
  OverviewView,
  QuestsView,
  RawOverviewView,
  SaveMetadata,
  ScanResult,
  WeaponEntryView,
  WriteReport,
} from './types';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function pickSaveFile(): Promise<string | null> {
  const chosen = await open({
    title: 'Open Phantom Blade Zero save',
    multiple: false,
    filters: [{ name: 'PBZ Save', extensions: ['sav'] }],
  });
  return typeof chosen === 'string' ? chosen : null;
}

export async function pickFolder(title = 'Select folder'): Promise<string | null> {
  const chosen = await open({
    title,
    directory: true,
    multiple: false,
  });
  return typeof chosen === 'string' ? chosen : null;
}

export const api = {
  getAppInfo: () => invoke<AppInfo>('get_app_info'),
  getAssetStatus: () => invoke<AssetStatus>('get_asset_status'),
  reloadAssets: () => invoke<AssetStatus>('reload_assets'),
  getSettings: () => invoke<AppSettings>('get_settings'),
  updateSettings: (patch: Partial<AppSettings>) => invoke<AppSettings>('update_settings', { patch }),
  scanSaves: (extraFolder?: string | null) => invoke<ScanResult>('scan_saves', { extraFolder: extraFolder ?? null }),
  openSave: (path: string) => invoke<SaveMetadata>('open_save', { path }),
  closeSave: () => invoke<void>('close_save'),
  selectSlot: (slotName: string) => invoke<SaveMetadata>('select_slot', { slotName }),
  getSaveMetadata: () => invoke<SaveMetadata>('get_save_metadata'),
  discardChanges: () => invoke<SaveMetadata>('discard_changes'),
  createBackup: () => invoke<string>('create_backup'),
  writeSave: () => invoke<WriteReport>('write_save'),
  getOverview: () => invoke<OverviewView>('get_overview'),
  getCompletionWorld: () => invoke<CompletionWorldView>('get_completion_world'),
  getMissables: () => invoke<MissablesView>('get_missables'),
  getQuests: () => invoke<QuestsView>('get_quests'),
  getWeapons: () => invoke<WeaponEntryView[]>('get_weapons'),
  getGear: () => invoke<GearEntryView[]>('get_gear'),
  getInventory: () => invoke<InventoryEntryView[]>('get_inventory'),
  getRawOverview: () => invoke<RawOverviewView>('get_raw_overview'),
  getRawSection: (section: string) => invoke<string>('get_raw_section', { section }),
  setPlayerResource: (field: string, value: number) => invoke<SaveMetadata>('set_player_resource', { field, value }),
  setGameOption: (field: string, value: number | boolean) => invoke<SaveMetadata>('set_game_option', { field, value }),
  markCompletionEntries: (keys: string[]) => invoke<SaveMetadata>('mark_completion_entries', { keys }),
  applyMissableFix: (missableId: string) => invoke<SaveMetadata>('apply_missable_fix', { missableId }),
  updateWeapon: (id: string, kind: 'weapon' | 'phantom', level: number, snapSoul: boolean) =>
    invoke<SaveMetadata>('update_weapon', { id, kind, level, snapSoul }),
  updateGear: (id: string, kind: 'accessory' | 'medicine', level: number, maxCharges?: number | null) =>
    invoke<SaveMetadata>('update_gear', { id, kind, level, maxCharges: maxCharges ?? null }),
  setInventoryAmount: (id: string, amount: number) => invoke<SaveMetadata>('set_inventory_amount', { id, amount }),
  addGlobalTag: (tag: string) => invoke<SaveMetadata>('add_global_tag', { tag }),
  removeGlobalTag: (tag: string) => invoke<SaveMetadata>('remove_global_tag', { tag }),
  closeWindow: () => invoke<void>('close_window'),
};
