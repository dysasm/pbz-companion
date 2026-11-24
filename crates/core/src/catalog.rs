//! Dynamic Phantom Blade Zero catalog loader.
//!
//! Only the hand-authored `missables.json` guide is embedded in the binary.
//! All game-extracted tables (`gamedata.json`, `quests.json`, `catalog.json`,
//! `gamemaps_index.json`, `gamemaps_positions.json`), region map paintings, and
//! ink icons are loaded at runtime from the user's local `game-assets/` cache,
//! extracted directly from their own Phantom Blade Zero installation.

use serde::{Deserialize, Deserializer, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

fn null_to_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    T: Default + Deserialize<'de>,
    D: Deserializer<'de>,
{
    Ok(Option::<T>::deserialize(deserializer)?.unwrap_or_default())
}

const GAMEDATA_JSON: &str = include_str!("../data/gamedata.json");
const QUESTS_JSON: &str = include_str!("../data/quests.json");
const MISSABLES_JSON: &str = include_str!("../data/missables.json");
const CATALOG_JSON: &str = include_str!("../data/catalog.json");
const GAMEMAPS_INDEX_JSON: &str = include_str!("../data/gamemaps_index.json");
const GAMEMAPS_POSITIONS_JSON: &str = include_str!("../data/gamemaps_positions.json");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetStatus {
    pub assets_dir: String,
    pub has_gamedata: bool,
    pub has_quests: bool,
    pub has_catalog: bool,
    pub has_map_positions: bool,
    pub map_image_count: usize,
    pub icon_count: usize,
    pub ready: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryMeta {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub extra: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionMeta {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub sub_maps: Vec<String>,
    #[serde(default)]
    pub map: Option<String>,
    #[serde(default)]
    pub totals: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapEntry {
    pub k: String,
    pub cat: String,
    #[serde(default, deserialize_with = "null_to_default")]
    pub arr: String,
    pub region: String,
    #[serde(default, deserialize_with = "null_to_default")]
    pub sub: String,
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub actor: Option<String>,
    #[serde(default)]
    pub mob: Option<String>,
    #[serde(default)]
    pub flow: Option<String>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub guids: Vec<String>,
    #[serde(default)]
    pub pos: Option<Vec<f64>>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub name: String,
    #[serde(default)]
    pub desc: Option<String>,
    #[serde(default)]
    pub how: Option<String>,
    #[serde(default)]
    pub petal: Option<String>,
    #[serde(default)]
    pub dead: Option<serde_json::Value>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub no_total: bool,
}

impl MapEntry {
    pub fn is_dead(&self) -> bool {
        match &self.dead {
            Some(serde_json::Value::Bool(b)) => *b,
            Some(serde_json::Value::String(s)) => !s.is_empty(),
            _ => false,
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameDataFile {
    #[serde(default)]
    pub categories: Vec<CategoryMeta>,
    #[serde(default)]
    pub regions: Vec<RegionMeta>,
    #[serde(default)]
    pub sub_maps: HashMap<String, String>,
    #[serde(default)]
    pub entries: Vec<MapEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestCategoryMeta {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestRegionMeta {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestTask {
    #[serde(default)]
    pub tag: Option<String>,
    #[serde(default)]
    pub text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestBranchDef {
    pub id: String,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub details: Option<String>,
    #[serde(default)]
    pub map: Option<String>,
    #[serde(default)]
    pub map_region: Option<String>,
    #[serde(default)]
    pub u: Option<f64>,
    #[serde(default)]
    pub v: Option<f64>,
    #[serde(default)]
    pub inside: Option<bool>,
    #[serde(default)]
    pub pos: Option<Vec<f64>>,
    #[serde(default)]
    pub tasks: Vec<QuestTask>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestDef {
    pub id: String,
    pub cls: String,
    pub cat: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub subtitle: Option<String>,
    #[serde(default)]
    pub unused: bool,
    #[serde(default)]
    pub region: Option<String>,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub branches: Vec<QuestBranchDef>,
    #[serde(default)]
    pub missables: Vec<String>,
    #[serde(default)]
    pub entries: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct QuestsFile {
    #[serde(default)]
    pub categories: Vec<QuestCategoryMeta>,
    #[serde(default)]
    pub regions: Vec<QuestRegionMeta>,
    #[serde(default)]
    pub quests: Vec<QuestDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PointOfNoReturn {
    pub id: String,
    pub name: String,
    pub region: String,
    pub tag: String,
    #[serde(default)]
    pub minor: bool,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub chapter: Option<String>,
    #[serde(default)]
    pub chapter_next: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissableCond {
    #[serde(default)]
    pub any_tag: Vec<String>,
    #[serde(default)]
    pub all_tags: Vec<String>,
    #[serde(default)]
    pub none_tags: Vec<String>,
    #[serde(default)]
    pub any_item: Vec<String>,
    #[serde(default)]
    pub all_items: Vec<String>,
    #[serde(default)]
    pub quest_done: Option<String>,
    #[serde(default)]
    pub quest_started: Option<String>,
    #[serde(default)]
    pub any_quest_branch: Vec<(String, String)>,
    #[serde(default)]
    pub text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MissableFix {
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub items: Vec<String>,
    #[serde(default)]
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissableDef {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub region: String,
    #[serde(default)]
    pub before: String,
    #[serde(default)]
    pub how: String,
    #[serde(default)]
    pub rewards: Vec<String>,
    #[serde(default)]
    pub done: Option<MissableCond>,
    #[serde(default)]
    pub ready: Option<MissableCond>,
    #[serde(default)]
    pub missed: Option<MissableCond>,
    #[serde(default)]
    pub fix: Option<MissableFix>,
    #[serde(default)]
    pub no_fix: Option<String>,
    #[serde(default)]
    pub ponr: String,
    #[serde(default)]
    pub locked_by_ponr: bool,
    #[serde(default)]
    pub progress_tags: Vec<String>,
    #[serde(default)]
    pub progress_label: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissablesFile {
    pub points_of_no_return: Vec<PointOfNoReturn>,
    pub missables: Vec<MissableDef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogItem {
    pub id: String,
    #[serde(default, deserialize_with = "null_to_default")]
    pub name: String,
    #[serde(default, deserialize_with = "null_to_default")]
    pub name_en: String,
    #[serde(default, deserialize_with = "null_to_default")]
    pub category: String,
    #[serde(default, deserialize_with = "null_to_default")]
    pub subcategory: String,
    #[serde(default, deserialize_with = "null_to_default")]
    pub description_en: String,
    #[serde(default, deserialize_with = "null_to_default")]
    pub description: String,
    #[serde(default)]
    pub max_level: Option<u32>,
    #[serde(default, deserialize_with = "null_to_default")]
    pub supported: bool,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct CatalogFile {
    #[serde(default)]
    items: Vec<CatalogItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapLayerMeta {
    pub id: String,
    pub path: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameMapRegionMeta {
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub path: String,
    #[serde(default)]
    pub sub_maps: Vec<String>,
    #[serde(default)]
    pub layers: Vec<MapLayerMeta>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameMapsIndexFile {
    #[serde(default)]
    pub regions: HashMap<String, GameMapRegionMeta>,
    #[serde(default)]
    pub sub_maps: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapPosition {
    pub region: String,
    pub u: f64,
    pub v: f64,
    #[serde(default = "default_true")]
    pub inside: bool,
    #[serde(default)]
    pub px: f64,
    #[serde(default)]
    pub py: f64,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Default, Deserialize)]
struct GameMapsPositionsFile {
    #[serde(default)]
    positions: HashMap<String, MapPosition>,
}

pub struct Catalog {
    pub gamedata: GameDataFile,
    pub entries_by_key: HashMap<String, usize>,
    pub quests: QuestsFile,
    pub missables: MissablesFile,
    pub items: Vec<CatalogItem>,
    pub items_by_id: HashMap<String, usize>,
    pub map_regions: HashMap<String, GameMapRegionMeta>,
    pub positions: HashMap<String, MapPosition>,
    pub status: AssetStatus,
}

fn read_json_with_fallback<T: for<'de> Deserialize<'de>>(
    override_path: &Path,
    embedded: &str,
) -> T {
    if let Ok(raw) = fs::read_to_string(override_path)
        && let Ok(v) = serde_json::from_str::<T>(&raw)
    {
        return v;
    }
    serde_json::from_str::<T>(embedded).expect("embedded catalog JSON must be valid")
}

fn count_images(dir: &Path) -> usize {
    fs::read_dir(dir)
        .ok()
        .map(|rd| {
            rd.flatten()
                .filter(|e| {
                    e.path()
                        .extension()
                        .and_then(|s| s.to_str())
                        .is_some_and(|ext| {
                            ext.eq_ignore_ascii_case("webp") || ext.eq_ignore_ascii_case("png")
                        })
                })
                .count()
        })
        .unwrap_or(0)
}

impl Catalog {
    /// Load bundled game catalogs with optional local overrides from `assets_dir`.
    pub fn load_from_dir(assets_dir: &Path) -> Self {
        let missables: MissablesFile =
            serde_json::from_str(MISSABLES_JSON).expect("embedded missables.json must be valid");

        let mut gamedata: GameDataFile =
            read_json_with_fallback(&assets_dir.join("gamedata.json"), GAMEDATA_JSON);
        gamedata.entries.retain(|e| !e.is_dead());

        let mut entries_by_key = HashMap::with_capacity(gamedata.entries.len());
        for (idx, entry) in gamedata.entries.iter().enumerate() {
            entries_by_key.insert(entry.k.clone(), idx);
        }

        let quests: QuestsFile =
            read_json_with_fallback(&assets_dir.join("quests.json"), QUESTS_JSON);
        let cat_file: CatalogFile =
            read_json_with_fallback(&assets_dir.join("catalog.json"), CATALOG_JSON);
        let gm_index: GameMapsIndexFile =
            read_json_with_fallback(&assets_dir.join("gamemaps_index.json"), GAMEMAPS_INDEX_JSON);
        let gm_pos: GameMapsPositionsFile = read_json_with_fallback(
            &assets_dir.join("gamemaps_positions.json"),
            GAMEMAPS_POSITIONS_JSON,
        );

        let mut items_by_id = HashMap::with_capacity(cat_file.items.len());
        for (idx, item) in cat_file.items.iter().enumerate() {
            items_by_id.entry(item.id.to_lowercase()).or_insert(idx);
        }

        let override_maps = count_images(&assets_dir.join("maps"));
        let override_icons = count_images(&assets_dir.join("icons"));

        let status = AssetStatus {
            assets_dir: assets_dir.to_string_lossy().to_string(),
            has_gamedata: !gamedata.entries.is_empty(),
            has_quests: !quests.quests.is_empty(),
            has_catalog: !cat_file.items.is_empty(),
            has_map_positions: !gm_index.regions.is_empty() && !gm_pos.positions.is_empty(),
            map_image_count: override_maps.max(gm_index.regions.len()),
            icon_count: override_icons.max(20),
            ready: true,
        };

        Self {
            gamedata,
            entries_by_key,
            quests,
            missables,
            items: cat_file.items,
            items_by_id,
            map_regions: gm_index.regions,
            positions: gm_pos.positions,
            status,
        }
    }

    pub fn bundled() -> Self {
        Self::load_from_dir(Path::new(""))
    }

    pub fn entry(&self, key: &str) -> Option<&MapEntry> {
        self.entries_by_key
            .get(key)
            .map(|&idx| &self.gamedata.entries[idx])
    }

    pub fn item(&self, id: &str) -> Option<&CatalogItem> {
        self.items_by_id
            .get(&id.to_lowercase())
            .map(|&idx| &self.items[idx])
    }

    pub fn item_display_name(&self, id: &str) -> String {
        if let Some(it) = self.item(id) {
            let en = it.name_en.trim();
            if !en.is_empty() {
                return title_case_if_all_caps(en);
            }
            if !it.name.trim().is_empty() {
                return it.name.trim().to_string();
            }
        }
        id.to_string()
    }

    pub fn table_for_item_id(&self, id: &str) -> &'static str {
        match self.item(id).map(|i| i.category.as_str()) {
            Some("weapon") => "MainWeaponInfos",
            Some("phantom") => "ShaChiWeaponInfo",
            Some("accessory") => "AccessoryInfos",
            Some("medicine") => "MedicineInfos",
            _ => "InventoryInfos",
        }
    }

    pub fn map_region_for_completion_region(&self, region_id: &str) -> Option<String> {
        let reg = self.gamedata.regions.iter().find(|r| r.id == region_id)?;
        for (gm_id, meta) in &self.map_regions {
            if meta.sub_maps.iter().any(|sm| reg.sub_maps.contains(sm)) {
                return Some(gm_id.clone());
            }
        }
        None
    }
}

/// Convert ALL-CAPS English game strings into clean Title Case while leaving mixed-case strings intact.
pub fn title_case_if_all_caps(s: &str) -> String {
    let trimmed = s.trim();
    if trimmed.is_empty() || trimmed != trimmed.to_uppercase() {
        return trimmed.to_string();
    }
    const SMALL: &[&str] = &[
        "of", "the", "and", "a", "an", "in", "on", "to", "for", "at", "by", "with",
    ];
    trimmed
        .to_lowercase()
        .split(' ')
        .enumerate()
        .map(|(idx, word)| {
            if is_roman_numeral(word) {
                return word.to_uppercase();
            }
            if idx > 0 && SMALL.contains(&word) {
                return word.to_string();
            }
            word.split('-')
                .map(|part| {
                    let mut chars = part.chars();
                    match chars.next() {
                        Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                        None => String::new(),
                    }
                })
                .collect::<Vec<_>>()
                .join("-")
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn is_roman_numeral(word: &str) -> bool {
    let w = word.trim_end_matches('.');
    !w.is_empty() && w.chars().all(|c| matches!(c, 'i' | 'v' | 'x'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_catalogs_load_cleanly() {
        let cat = Catalog::bundled();
        assert!(cat.gamedata.entries.len() > 400);
        assert_eq!(cat.gamedata.regions.len(), 8);
        assert!(cat.quests.quests.len() >= 50);
        assert!(cat.missables.points_of_no_return.len() >= 7);
        assert!(cat.items.len() >= 700);
        assert!(!cat.positions.is_empty());
        assert!(cat.status.ready);
    }
}
