//! Phantom Blade Zero domain queries and validated save mutations.
//!
//! Mirrors the game's own rules for:
//! - Map completion (`MapItemCompletion.js` / `DT_MapItemData`)
//! - Missables & points of no return (`EventPipeline.GlobalTags`, `NarrativeSavedQuests`)
//! - Quests (`Narrative.NarrativeSavedQuests`)
//! - Player resources, weapons, Phantom Edges, accessories, medicine, inventory, bells, bosses, and raw tags.

use crate::catalog::{Catalog, MapEntry, MissableCond, PointOfNoReturn};
use crate::error::{Error, Result};
use crate::json_patch::PatchOp;
use crate::save::SaveSession;
use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};

const EXTRA_CATS: &[&str] = &["key", "treasure"];
const DEDUPE_CATS: &[&str] = &["bell", "weapon", "accessory"];

pub fn now_pbz_timestamp() -> String {
    Local::now().format("%Y.%m.%d-%H.%M.%S").to_string()
}

fn table_of_arr(arr: &str) -> Option<&'static str> {
    match arr {
        "Weapon" => Some("MainWeaponInfos"),
        "ShaChiWeapon" => Some("ShaChiWeaponInfo"),
        "Accessory" => Some("AccessoryInfos"),
        "Medicine" => Some("MedicineInfos"),
        "MemoryFlower" => Some("InventoryInfos"),
        _ => None,
    }
}

fn bare_actor(actor: &str) -> &str {
    match actor.find('-') {
        Some(idx) => &actor[idx + 1..],
        None => actor,
    }
}

fn enum_tail(value: &str) -> &str {
    value.rsplit("::").next().unwrap_or(value)
}

fn default_item_record(table: &str, ts: &str, cycle: i64) -> Value {
    match table {
        "AccessoryInfos" => json!({
            "CurrentLevel": 1,
            "HasUIRedPoint": false,
            "DirtyTime": ts,
            "AcquiredCycle": cycle
        }),
        "MedicineInfos" => json!({
            "CurrentLevel": 0,
            "AlreadyHasUIRedPoint": false,
            "CurrentTime": 0,
            "MaxTime": 2,
            "BuffRemainTime": 0,
            "DirtyTime": ts,
            "AcquiredCycle": cycle
        }),
        "MainWeaponInfos" => json!({
            "DateTime": ts,
            "WeaponLevel": 30,
            "AlreadySnapSoul": 1,
            "HasUIRedPoint": false,
            "AcquiredCycle": cycle,
            "FirstAcquiredCycle": cycle
        }),
        "ShaChiWeaponInfo" => json!({
            "ShaChiWeaponLevel": 30,
            "AcquiredCycle": cycle,
            "FirstAcquiredCycle": cycle,
            "DirtyTime": ts,
            "AlreadySnapSoul": true,
            "SnapSoulCycle": cycle,
            "HasUIRedPoint": false
        }),
        _ => json!({
            "CurrentAmount": 1,
            "MaxAmount": 1,
            "FirstAddTime": ts,
            "DirtyTime": ts,
            "AcquiredCycle": cycle
        }),
    }
}

/// Fast case-insensitive index over a single save slot's JSON.
struct SaveIndex<'a> {
    cycle: i64,
    bells: HashSet<String>,
    inv_keys: HashMap<&'static str, HashMap<String, String>>,
    inv_root: Option<&'a serde_json::Map<String, Value>>,
    exec_guids: HashSet<String>,
    mob_domains: HashSet<String>,
    actors: HashSet<String>,
    bare_actors: HashSet<String>,
    global_tags: HashSet<String>,
    quests: HashMap<String, &'a Value>,
    quest_times: HashMap<String, f64>,
    tracked_quest: String,
    all_owned_items: HashSet<String>,
}

impl<'a> SaveIndex<'a> {
    fn build(json: &'a Value) -> Self {
        let gs = json.get("PBZGameSystem");
        let cycle = gs
            .and_then(|g| g.get("CycleCount"))
            .and_then(Value::as_i64)
            .unwrap_or(0);

        let bells: HashSet<String> = json
            .get("BellManager")
            .and_then(|b| b.get("ActivateBellIDs"))
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter_map(Value::as_str)
                    .map(str::to_lowercase)
                    .collect()
            })
            .unwrap_or_default();

        let inv_root = json.get("Inventory").and_then(Value::as_object);
        let mut inv_keys: HashMap<&'static str, HashMap<String, String>> = HashMap::new();
        let mut all_owned_items = HashSet::new();
        for table in [
            "InventoryInfos",
            "MainWeaponInfos",
            "ShaChiWeaponInfo",
            "AccessoryInfos",
            "MedicineInfos",
        ] {
            let mut map = HashMap::new();
            if let Some(obj) = inv_root
                .and_then(|i| i.get(table))
                .and_then(Value::as_object)
            {
                for k in obj.keys() {
                    let lower = k.to_lowercase();
                    all_owned_items.insert(lower.clone());
                    map.insert(lower, k.clone());
                }
            }
            inv_keys.insert(table, map);
        }

        let exec_guids: HashSet<String> = json
            .get("EventPipeline")
            .and_then(|e| e.get("ExecuteNodeGuid"))
            .and_then(Value::as_object)
            .map(|obj| obj.keys().cloned().collect())
            .unwrap_or_default();

        let global_tags: HashSet<String> = json
            .get("EventPipeline")
            .and_then(|e| e.get("GlobalTags"))
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter_map(Value::as_str)
                    .map(String::from)
                    .collect()
            })
            .unwrap_or_default();

        let mob_domains: HashSet<String> = gs
            .and_then(|g| g.get("CompleteAddItemMobDomainNames"))
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter_map(Value::as_str)
                    .map(String::from)
                    .collect()
            })
            .unwrap_or_default();

        let mut actors = HashSet::new();
        let mut bare_actors = HashSet::new();
        if let Some(lam) = json.get("LevelActorManager").and_then(Value::as_object) {
            for k in lam.keys() {
                actors.insert(k.clone());
                bare_actors.insert(bare_actor(k).to_string());
            }
        }

        let mut quests = HashMap::new();
        if let Some(arr) = json
            .get("Narrative")
            .and_then(|n| n.get("NarrativeSavedQuests"))
            .and_then(Value::as_array)
        {
            for q in arr {
                if let Some(cls) = q.get("QuestClass").and_then(Value::as_str) {
                    quests.insert(cls.to_lowercase(), q);
                }
            }
        }

        let mut quest_times = HashMap::new();
        if let Some(arr) = json
            .get("Narrative")
            .and_then(|n| n.get("QuestGameTimes"))
            .and_then(Value::as_array)
        {
            for t in arr {
                if let (Some(cls), Some(gt)) = (
                    t.get("QuestClass").and_then(Value::as_str),
                    t.get("GameTime").and_then(Value::as_f64),
                ) {
                    quest_times.insert(cls.to_lowercase(), gt);
                }
            }
        }

        let tracked_quest = json
            .get("Narrative")
            .and_then(|n| n.get("TrackedQuestPath"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_lowercase();

        Self {
            cycle,
            bells,
            inv_keys,
            inv_root,
            exec_guids,
            mob_domains,
            actors,
            bare_actors,
            global_tags,
            quests,
            quest_times,
            tracked_quest,
            all_owned_items,
        }
    }

    fn inv_entry(&self, table: &'static str, id: &str) -> Option<(&str, &'a Value)> {
        let actual_key = self.inv_keys.get(table)?.get(&id.to_lowercase())?;
        let val = self.inv_root?.get(table)?.as_object()?.get(actual_key)?;
        Some((actual_key.as_str(), val))
    }

    fn entry_status(&self, entry: &MapEntry) -> &'static str {
        match entry.cat.as_str() {
            "bell" => {
                if entry
                    .id
                    .as_deref()
                    .is_some_and(|id| self.bells.contains(&id.to_lowercase()))
                {
                    "done"
                } else {
                    "missing"
                }
            }
            "weapon" | "accessory" | "flower" => {
                let Some(table) = table_of_arr(&entry.arr) else {
                    return "missing";
                };
                let Some(id) = entry.id.as_deref() else {
                    return "missing";
                };
                match self.inv_entry(table, id) {
                    None => "missing",
                    Some((_, row)) => {
                        let acq = row
                            .get("AcquiredCycle")
                            .and_then(Value::as_i64)
                            .unwrap_or(0);
                        if acq == self.cycle {
                            "done"
                        } else {
                            "oldcycle"
                        }
                    }
                }
            }
            "challenge" => {
                if entry.guids.iter().any(|g| self.exec_guids.contains(g)) {
                    "done"
                } else {
                    "missing"
                }
            }
            "key" => {
                if entry
                    .id
                    .as_deref()
                    .is_some_and(|id| self.inv_entry("InventoryInfos", id).is_some())
                {
                    return "done";
                }
                if entry
                    .mob
                    .as_deref()
                    .is_some_and(|m| self.mob_domains.contains(m))
                {
                    return "done";
                }
                if entry.guids.iter().any(|g| self.exec_guids.contains(g)) {
                    return "done";
                }
                "missing"
            }
            _ => {
                if entry.actor.as_deref().is_some_and(|a| {
                    self.actors.contains(a) || self.bare_actors.contains(bare_actor(a))
                }) {
                    return "done";
                }
                if entry
                    .mob
                    .as_deref()
                    .is_some_and(|m| self.mob_domains.contains(m))
                {
                    return "done";
                }
                if entry.guids.iter().any(|g| self.exec_guids.contains(g)) {
                    return "done";
                }
                "missing"
            }
        }
    }

    fn quest_record_by_path(&self, path: &str) -> Option<&'a Value> {
        let needle = format!("/{}.", path).to_lowercase();
        self.quests
            .iter()
            .find(|(cls, _)| cls.contains(&needle))
            .map(|(_, v)| *v)
    }

    fn cond_met(&self, cond: &MissableCond) -> bool {
        let mut any_checks = Vec::new();
        if !cond.any_tag.is_empty() {
            any_checks.push(cond.any_tag.iter().any(|t| self.global_tags.contains(t)));
        }
        if !cond.any_item.is_empty() {
            any_checks.push(
                cond.any_item
                    .iter()
                    .any(|id| self.all_owned_items.contains(&id.to_lowercase())),
            );
        }
        if !cond.all_items.is_empty() {
            any_checks.push(
                cond.all_items
                    .iter()
                    .all(|id| self.all_owned_items.contains(&id.to_lowercase())),
            );
        }
        if let Some(path) = &cond.quest_done {
            let ok = self
                .quest_record_by_path(path)
                .and_then(|q| q.get("QuestCompletion"))
                .and_then(Value::as_str)
                .is_some_and(|c| enum_tail(c) == "QC_Succeded");
            any_checks.push(ok);
        }
        if let Some(path) = &cond.quest_started {
            let ok = self
                .quest_record_by_path(path)
                .and_then(|q| q.get("QuestCompletion"))
                .and_then(Value::as_str)
                .is_some_and(|c| enum_tail(c) == "QC_Started");
            any_checks.push(ok);
        }
        if !cond.any_quest_branch.is_empty() {
            let ok = cond.any_quest_branch.iter().any(|(path, branch_id)| {
                self.quest_record_by_path(path)
                    .and_then(|q| q.get("QuestBranches"))
                    .and_then(Value::as_array)
                    .is_some_and(|branches| {
                        branches.iter().any(|b| {
                            b.get("BranchID").and_then(Value::as_str) == Some(branch_id.as_str())
                                && b.get("BranchType")
                                    .and_then(Value::as_str)
                                    .is_some_and(|bt| enum_tail(bt) != "None")
                        })
                    })
            });
            any_checks.push(ok);
        }

        if !any_checks.is_empty() && !any_checks.iter().any(|&b| b) {
            return false;
        }
        if !cond.all_tags.is_empty() && !cond.all_tags.iter().all(|t| self.global_tags.contains(t))
        {
            return false;
        }
        if !cond.none_tags.is_empty() && cond.none_tags.iter().any(|t| self.global_tags.contains(t))
        {
            return false;
        }
        !any_checks.is_empty() || !cond.all_tags.is_empty()
    }
}

/* ==================== VIEW STRUCTS ==================== */

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionCompletionSummary {
    pub id: String,
    pub name: String,
    pub map_region_id: Option<String>,
    pub collected: usize,
    pub total: usize,
    pub percent: u32,
    pub totals: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverviewView {
    pub slot_name: String,
    pub date_time: String,
    pub cycle_count: i64,
    pub difficulty: i64,
    pub can_select_nightmare: bool,
    pub finished_game: bool,
    pub game_time_seconds: i64,
    pub cycle_game_time_seconds: i64,
    pub died_times: i64,
    pub current_level: String,
    pub last_bell_id: String,
    pub dust: i64,
    pub spirit_shadow: i64,
    pub remaining_days: i64,
    pub ultimate_charge: i64,
    pub ultimate_charge_count: i64,
    pub overall_percent: u32,
    pub overall_collected: usize,
    pub overall_total: usize,
    pub regions: Vec<RegionCompletionSummary>,
    pub equipped_weapons: Vec<String>,
    pub equipped_phantom_edges: Vec<String>,
    pub equipped_accessories: Vec<String>,
    pub top_medicine: String,
    pub bottom_medicine: String,
    pub counts: OverviewCounts,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverviewCounts {
    pub bells_activated: usize,
    pub weapons_owned: usize,
    pub weapons_total: usize,
    pub phantom_owned: usize,
    pub phantom_total: usize,
    pub accessories_owned: usize,
    pub accessories_total: usize,
    pub medicines_owned: usize,
    pub medicines_total: usize,
    pub inventory_items: usize,
    pub quests_done: usize,
    pub quests_in_progress: usize,
    pub quests_total: usize,
    pub missables_missed: usize,
    pub missables_open: usize,
    pub bosses_recorded: usize,
    pub global_tags: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionEntryView {
    pub key: String,
    pub cat: String,
    pub arr: String,
    pub region: String,
    pub sub_map: String,
    pub sub_map_name: String,
    pub item_id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub how: Option<String>,
    pub petal: Option<String>,
    pub status: String,
    pub extra: bool,
    pub map_region: Option<String>,
    pub u: Option<f64>,
    pub v: Option<f64>,
    pub inside_map: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryProgress {
    pub id: String,
    pub name: String,
    pub extra: bool,
    pub collected: usize,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionMapMetaView {
    pub id: String,
    pub completion_region_id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub layers: Vec<MapLayerView>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapLayerView {
    pub id: String,
    pub path: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionWorldView {
    pub overall_percent: u32,
    pub overall_collected: usize,
    pub overall_total: usize,
    pub regions: Vec<RegionCompletionSummary>,
    pub map_regions: Vec<RegionMapMetaView>,
    pub categories: Vec<CategoryProgress>,
    pub entries: Vec<CompletionEntryView>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissableRewardView {
    pub id: String,
    pub name: String,
    pub owned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissableItemView {
    pub id: String,
    pub name: String,
    pub region: String,
    pub before: String,
    pub how: String,
    pub ponr: String,
    pub status: String,
    pub status_note: Option<String>,
    pub rewards: Vec<MissableRewardView>,
    pub progress_current: Option<usize>,
    pub progress_total: Option<usize>,
    pub progress_label: Option<String>,
    pub can_fix: bool,
    pub fix_text: Option<String>,
    pub no_fix_note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PonrView {
    pub id: String,
    pub name: String,
    pub region: String,
    pub tag: String,
    pub minor: bool,
    pub note: String,
    pub chapter: Option<String>,
    pub chapter_next: Option<String>,
    pub passed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissablesView {
    pub points_of_no_return: Vec<PonrView>,
    pub missables: Vec<MissableItemView>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestBranchView {
    pub id: String,
    pub text: String,
    pub details: Option<String>,
    pub state: String,
    pub dirty_time: String,
    pub task_done: Option<usize>,
    pub task_total: Option<usize>,
    pub map_region: Option<String>,
    pub u: Option<f64>,
    pub v: Option<f64>,
    pub inside_map: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestItemView {
    pub id: String,
    pub cls: String,
    pub category: String,
    pub category_name: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub region: Option<String>,
    pub region_name: String,
    pub status: String,
    pub tracked: bool,
    pub start_time: Option<f64>,
    pub current_step: Option<String>,
    pub branches: Vec<QuestBranchView>,
    pub missable_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestsView {
    pub done: usize,
    pub in_progress: usize,
    pub not_started: usize,
    pub failed: usize,
    pub quests: Vec<QuestItemView>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeaponEntryView {
    pub id: String,
    pub name: String,
    pub name_zh: String,
    pub description: String,
    pub kind: String, // "weapon" | "phantom"
    pub owned: bool,
    pub equipped: bool,
    pub level: i64,
    pub snap_soul: bool,
    pub acquired_cycle: i64,
    pub save_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GearEntryView {
    pub id: String,
    pub name: String,
    pub name_zh: String,
    pub description: String,
    pub kind: String, // "accessory" | "medicine"
    pub owned: bool,
    pub equipped: bool,
    pub level: i64,
    pub current_charges: i64,
    pub max_charges: i64,
    pub acquired_cycle: i64,
    pub save_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryEntryView {
    pub id: String,
    pub name: String,
    pub name_zh: String,
    pub subcategory: String,
    pub description: String,
    pub owned: bool,
    pub amount: i64,
    pub max_amount: i64,
    pub acquired_cycle: i64,
    pub save_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawSectionSummary {
    pub key: String,
    pub kind: String,
    pub len: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawOverviewView {
    pub sections: Vec<RawSectionSummary>,
    pub global_tags: Vec<String>,
}

/* ==================== QUERIES ==================== */

fn compute_region_stats(
    cat: &Catalog,
    idx: &SaveIndex<'_>,
) -> (Vec<RegionCompletionSummary>, usize, usize) {
    let mut regions = Vec::with_capacity(cat.gamedata.regions.len());
    let mut overall_cur = 0usize;
    let mut overall_tot = 0usize;

    for reg in &cat.gamedata.regions {
        let mut seen = HashSet::new();
        let mut cur = 0usize;
        let mut tot = 0usize;
        for entry in &cat.gamedata.entries {
            if entry.region != reg.id || EXTRA_CATS.contains(&entry.cat.as_str()) {
                continue;
            }
            if DEDUPE_CATS.contains(&entry.cat.as_str()) {
                let dkey = format!("{}:{}", entry.cat, entry.id.as_deref().unwrap_or(""));
                if !seen.insert(dkey) {
                    continue;
                }
            }
            let done = idx.entry_status(entry) == "done";
            tot += 1;
            if done {
                cur += 1;
            }
            if reg.totals && !entry.no_total {
                overall_tot += 1;
                if done {
                    overall_cur += 1;
                }
            }
        }
        let pct = (cur * 100).checked_div(tot).unwrap_or(0) as u32;
        regions.push(RegionCompletionSummary {
            id: reg.id.clone(),
            name: reg.name.clone(),
            map_region_id: cat.map_region_for_completion_region(&reg.id),
            collected: cur,
            total: tot,
            percent: pct,
            totals: reg.totals,
        });
    }

    (regions, overall_cur, overall_tot)
}

pub fn get_overview(session: &SaveSession, cat: &Catalog) -> Result<OverviewView> {
    let json = session.active_json()?;
    let idx = SaveIndex::build(json);
    let gs = json.get("PBZGameSystem");
    let player = json.get("Player");
    let inv = json.get("Inventory");

    let (regions, overall_collected, overall_total) = compute_region_stats(cat, &idx);
    let overall_percent = (overall_collected * 100)
        .checked_div(overall_total)
        .unwrap_or(0) as u32;

    let quests = get_quests(session, cat)?;
    let missables = get_missables(session, cat)?;

    let read_str_list = |obj: Option<&Value>, key: &str| -> Vec<String> {
        obj.and_then(|o| o.get(key))
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(Value::as_str)
                    .filter(|s| !s.is_empty() && *s != "None")
                    .map(|id| cat.item_display_name(id))
                    .collect()
            })
            .unwrap_or_default()
    };

    let cat_count = |category: &str| cat.items.iter().filter(|i| i.category == category).count();

    Ok(OverviewView {
        slot_name: session.active_slot_name().to_string(),
        date_time: gs
            .and_then(|g| g.get("DateTimeString"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        cycle_count: idx.cycle,
        difficulty: gs
            .and_then(|g| g.get("DifficultModeByte"))
            .and_then(Value::as_i64)
            .unwrap_or(0),
        can_select_nightmare: gs
            .and_then(|g| g.get("bCanSelectNightMare"))
            .and_then(Value::as_bool)
            .unwrap_or(false),
        finished_game: gs
            .and_then(|g| g.get("bIsFinishGame"))
            .and_then(Value::as_bool)
            .unwrap_or(false),
        game_time_seconds: gs
            .and_then(|g| g.get("HasGameTime"))
            .and_then(Value::as_i64)
            .unwrap_or(0),
        cycle_game_time_seconds: gs
            .and_then(|g| g.get("CurrentCycleGameTime"))
            .and_then(Value::as_i64)
            .unwrap_or(0),
        died_times: json
            .get("PBZDeathMeta")
            .and_then(|d| d.get("DiedTimes"))
            .and_then(Value::as_i64)
            .unwrap_or(0),
        current_level: gs
            .and_then(|g| g.get("CurrentLevelName"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        last_bell_id: gs
            .and_then(|g| g.get("LastSaveActorID"))
            .and_then(Value::as_str)
            .or_else(|| json.get("BellSaveID").and_then(Value::as_str))
            .unwrap_or("")
            .to_string(),
        dust: player
            .and_then(|p| p.get("Dust"))
            .and_then(Value::as_i64)
            .unwrap_or(0),
        spirit_shadow: player
            .and_then(|p| p.get("SpiritShadow"))
            .and_then(Value::as_i64)
            .unwrap_or(0),
        remaining_days: player
            .and_then(|p| p.get("RemainingDays"))
            .and_then(Value::as_i64)
            .unwrap_or(0),
        ultimate_charge: player
            .and_then(|p| p.get("UltimateCharge"))
            .and_then(Value::as_i64)
            .unwrap_or(0),
        ultimate_charge_count: player
            .and_then(|p| p.get("UltimateChargeCount"))
            .and_then(Value::as_i64)
            .unwrap_or(0),
        overall_percent,
        overall_collected,
        overall_total,
        regions,
        equipped_weapons: read_str_list(inv, "MainWeapons"),
        equipped_phantom_edges: read_str_list(inv, "ShaqiWeapons"),
        equipped_accessories: read_str_list(inv, "AccessoryIDs"),
        top_medicine: inv
            .and_then(|i| i.get("TopMedicine"))
            .and_then(Value::as_str)
            .map(|id| cat.item_display_name(id))
            .unwrap_or_default(),
        bottom_medicine: inv
            .and_then(|i| i.get("BottomMedicine"))
            .and_then(Value::as_str)
            .map(|id| cat.item_display_name(id))
            .unwrap_or_default(),
        counts: OverviewCounts {
            bells_activated: idx.bells.len(),
            weapons_owned: idx.inv_keys.get("MainWeaponInfos").map_or(0, HashMap::len),
            weapons_total: cat_count("weapon"),
            phantom_owned: idx.inv_keys.get("ShaChiWeaponInfo").map_or(0, HashMap::len),
            phantom_total: cat_count("phantom"),
            accessories_owned: idx.inv_keys.get("AccessoryInfos").map_or(0, HashMap::len),
            accessories_total: cat_count("accessory"),
            medicines_owned: idx.inv_keys.get("MedicineInfos").map_or(0, HashMap::len),
            medicines_total: cat_count("medicine"),
            inventory_items: idx.inv_keys.get("InventoryInfos").map_or(0, HashMap::len),
            quests_done: quests.done,
            quests_in_progress: quests.in_progress,
            quests_total: quests.quests.len(),
            missables_missed: missables
                .missables
                .iter()
                .filter(|m| m.status == "missed" || m.status == "late")
                .count(),
            missables_open: missables
                .missables
                .iter()
                .filter(|m| m.status != "done" && m.status != "missed" && m.status != "late")
                .count(),
            bosses_recorded: json
                .get("BossRecord")
                .and_then(Value::as_object)
                .map_or(0, serde_json::Map::len),
            global_tags: idx.global_tags.len(),
        },
    })
}

pub fn get_completion_world(session: &SaveSession, cat: &Catalog) -> Result<CompletionWorldView> {
    let json = session.active_json()?;
    let idx = SaveIndex::build(json);
    let (regions, overall_collected, overall_total) = compute_region_stats(cat, &idx);
    let overall_percent = (overall_collected * 100)
        .checked_div(overall_total)
        .unwrap_or(0) as u32;

    let mut cat_totals: HashMap<&str, (usize, usize)> = HashMap::new();
    let mut entries = Vec::with_capacity(cat.gamedata.entries.len());

    for entry in &cat.gamedata.entries {
        let status = idx.entry_status(entry);
        let extra = EXTRA_CATS.contains(&entry.cat.as_str());
        let counter = cat_totals.entry(entry.cat.as_str()).or_insert((0, 0));
        counter.1 += 1;
        if status == "done" {
            counter.0 += 1;
        }
        let pos = cat.positions.get(&entry.k);
        entries.push(CompletionEntryView {
            key: entry.k.clone(),
            cat: entry.cat.clone(),
            arr: entry.arr.clone(),
            region: entry.region.clone(),
            sub_map: entry.sub.clone(),
            sub_map_name: cat
                .gamedata
                .sub_maps
                .get(&entry.sub)
                .cloned()
                .unwrap_or_else(|| entry.sub.clone()),
            item_id: entry.id.clone(),
            name: entry.name.clone(),
            description: entry.desc.clone(),
            how: entry.how.clone(),
            petal: entry.petal.clone(),
            status: status.to_string(),
            extra,
            map_region: pos.map(|p| p.region.clone()),
            u: pos.map(|p| p.u),
            v: pos.map(|p| p.v),
            inside_map: pos.is_some_and(|p| p.inside),
        });
    }

    let categories = cat
        .gamedata
        .categories
        .iter()
        .map(|c| {
            let (collected, total) = cat_totals.get(c.id.as_str()).copied().unwrap_or((0, 0));
            CategoryProgress {
                id: c.id.clone(),
                name: c.name.clone(),
                extra: c.extra,
                collected,
                total,
            }
        })
        .collect();

    let mut map_regions = Vec::new();
    for reg in &cat.gamedata.regions {
        if let Some(gm_id) = cat.map_region_for_completion_region(&reg.id)
            && let Some(meta) = cat.map_regions.get(&gm_id)
        {
            let layers = if meta.layers.is_empty() {
                vec![MapLayerView {
                    id: "default".into(),
                    path: meta.path.clone(),
                    label: "Normal".into(),
                }]
            } else {
                meta.layers
                    .iter()
                    .map(|l| MapLayerView {
                        id: l.id.clone(),
                        path: l.path.clone(),
                        label: if l.id == "winter" {
                            "Winter".into()
                        } else {
                            "Normal".into()
                        },
                    })
                    .collect()
            };
            map_regions.push(RegionMapMetaView {
                id: gm_id,
                completion_region_id: reg.id.clone(),
                name: reg.name.clone(),
                width: meta.width,
                height: meta.height,
                layers,
            });
        }
    }

    Ok(CompletionWorldView {
        overall_percent,
        overall_collected,
        overall_total,
        regions,
        map_regions,
        categories,
        entries,
    })
}

pub fn get_missables(session: &SaveSession, cat: &Catalog) -> Result<MissablesView> {
    let json = session.active_json()?;
    let idx = SaveIndex::build(json);

    let ponr_map: HashMap<&str, &PointOfNoReturn> = cat
        .missables
        .points_of_no_return
        .iter()
        .map(|p| (p.id.as_str(), p))
        .collect();

    let points_of_no_return = cat
        .missables
        .points_of_no_return
        .iter()
        .map(|p| PonrView {
            id: p.id.clone(),
            name: p.name.clone(),
            region: p.region.clone(),
            tag: p.tag.clone(),
            minor: p.minor,
            note: p.note.clone(),
            chapter: p.chapter.clone(),
            chapter_next: p.chapter_next.clone(),
            passed: idx.global_tags.contains(&p.tag),
        })
        .collect();

    let missables = cat
        .missables
        .missables
        .iter()
        .map(|m| {
            let ponr = ponr_map.get(m.ponr.as_str()).copied();
            let ponr_passed = ponr.is_some_and(|p| idx.global_tags.contains(&p.tag));
            let done_met = m.done.as_ref().is_some_and(|c| idx.cond_met(c));
            let ready_met = m.ready.as_ref().is_some_and(|c| idx.cond_met(c));
            let missed_met = m.missed.as_ref().is_some_and(|c| idx.cond_met(c));

            let status = if done_met {
                "done"
            } else if ready_met {
                "ready"
            } else if missed_met {
                "missed"
            } else if ponr_passed {
                if m.locked_by_ponr { "missed" } else { "late" }
            } else if m.missed.is_some() {
                "open"
            } else {
                "todo"
            };

            let status_note = match status {
                "late" => ponr.map(|p| {
                    format!(
                        "Guides say this closes at: {}. You are past it, but it may still be possible; check in game.",
                        p.name
                    )
                }),
                "missed" if m.locked_by_ponr && !missed_met => {
                    ponr.map(|p| format!("Locked when you passed: {}.", p.name))
                }
                "missed" => m.missed.as_ref().and_then(|c| c.text.clone()),
                "ready" => m.ready.as_ref().and_then(|c| c.text.clone()),
                _ => None,
            };

            let rewards = m
                .rewards
                .iter()
                .map(|id| MissableRewardView {
                    id: id.clone(),
                    name: cat.item_display_name(id),
                    owned: idx.all_owned_items.contains(&id.to_lowercase()),
                })
                .collect();

            let (progress_current, progress_total) = if !m.progress_tags.is_empty() {
                let done = m
                    .progress_tags
                    .iter()
                    .filter(|t| idx.global_tags.contains(*t))
                    .count();
                (Some(done), Some(m.progress_tags.len()))
            } else {
                (None, None)
            };

            let can_fix = m.fix.as_ref().is_some_and(|f| {
                status != "done" && (f.tags.is_empty() || status == "missed")
            });

            MissableItemView {
                id: m.id.clone(),
                name: m.name.clone(),
                region: m.region.clone(),
                before: m.before.clone(),
                how: m.how.clone(),
                ponr: m.ponr.clone(),
                status: status.to_string(),
                status_note,
                rewards,
                progress_current,
                progress_total,
                progress_label: m.progress_label.clone(),
                can_fix,
                fix_text: m.fix.as_ref().map(|f| f.text.clone()),
                no_fix_note: m.no_fix.clone(),
            }
        })
        .collect();

    Ok(MissablesView {
        points_of_no_return,
        missables,
    })
}

pub fn get_quests(session: &SaveSession, cat: &Catalog) -> Result<QuestsView> {
    let json = session.active_json()?;
    let idx = SaveIndex::build(json);

    let cat_names: HashMap<&str, &str> = cat
        .quests
        .categories
        .iter()
        .map(|c| (c.id.as_str(), c.name.as_str()))
        .collect();
    let reg_names: HashMap<&str, &str> = cat
        .quests
        .regions
        .iter()
        .map(|r| (r.id.as_str(), r.name.as_str()))
        .collect();

    let mut quests = Vec::new();
    let mut done_cnt = 0usize;
    let mut prog_cnt = 0usize;
    let mut todo_cnt = 0usize;
    let mut fail_cnt = 0usize;

    for q in &cat.quests.quests {
        let cls_lower = q.cls.to_lowercase();
        let saved = idx.quests.get(&cls_lower).copied();
        if q.cat == "tutorial" || (q.unused && saved.is_none()) {
            continue;
        }

        let mut saved_branches: HashMap<&str, (&str, &str)> = HashMap::new();
        let mut all_completed = false;
        let mut active_branch_id: Option<String> = None;

        let status = if let Some(sq) = saved {
            let comp = sq
                .get("QuestCompletion")
                .and_then(Value::as_str)
                .map(enum_tail)
                .unwrap_or("");
            if let Some(arr) = sq.get("QuestBranches").and_then(Value::as_array) {
                if !arr.is_empty()
                    && arr.iter().all(|b| {
                        b.get("BranchType")
                            .and_then(Value::as_str)
                            .is_some_and(|bt| enum_tail(bt) == "BranchCompleted")
                    })
                {
                    all_completed = true;
                }
                let mut active: Vec<(&str, &str)> = Vec::new();
                for b in arr {
                    if let Some(bid) = b.get("BranchID").and_then(Value::as_str) {
                        let bt = b
                            .get("BranchType")
                            .and_then(Value::as_str)
                            .map(enum_tail)
                            .unwrap_or("None");
                        let dt = b.get("DirtyTime").and_then(Value::as_str).unwrap_or("");
                        saved_branches.insert(bid, (bt, dt));
                        if matches!(bt, "BranchActivating" | "BranchLocked") {
                            active.push((bid, dt));
                        }
                    }
                }
                active.sort_by(|a, b| b.1.cmp(a.1));
                active_branch_id = active.first().map(|(id, _)| (*id).to_string());
            }

            if comp == "QC_Succeded" || all_completed {
                "done"
            } else if comp == "QC_Failed" {
                "failed"
            } else if comp == "QC_NotStarted" {
                "todo"
            } else {
                "progress"
            }
        } else {
            "todo"
        };

        match status {
            "done" => done_cnt += 1,
            "progress" => prog_cnt += 1,
            "failed" => fail_cnt += 1,
            _ => todo_cnt += 1,
        }

        let mut branches: Vec<QuestBranchView> = q
            .branches
            .iter()
            .map(|br| {
                let (bt, dt) = saved_branches
                    .get(br.id.as_str())
                    .copied()
                    .unwrap_or(("None", ""));
                let state = match bt {
                    "BranchCompleted" => "done",
                    "BranchActivating" | "BranchLocked" => "active",
                    "Failed" => "failed",
                    _ => "none",
                };
                let tag_tasks: Vec<&str> =
                    br.tasks.iter().filter_map(|t| t.tag.as_deref()).collect();
                let (task_done, task_total) = if tag_tasks.len() >= 2 {
                    let done = tag_tasks
                        .iter()
                        .filter(|t| idx.global_tags.contains(**t))
                        .count();
                    (Some(done), Some(tag_tasks.len()))
                } else {
                    (None, None)
                };
                QuestBranchView {
                    id: br.id.clone(),
                    text: br.text.clone(),
                    details: br.details.clone(),
                    state: state.to_string(),
                    dirty_time: dt.to_string(),
                    task_done,
                    task_total,
                    map_region: br.map_region.clone().or_else(|| {
                        br.map
                            .as_deref()
                            .and_then(|m| cat.map_region_for_completion_region(m))
                    }),
                    u: br.u,
                    v: br.v,
                    inside_map: br.inside.unwrap_or(true),
                }
            })
            .collect();

        // Keep reached branches ordered chronologically first, then unreached.
        branches.sort_by(|a, b| {
            let ra = a.state != "none";
            let rb = b.state != "none";
            rb.cmp(&ra).then_with(|| a.dirty_time.cmp(&b.dirty_time))
        });

        let current_step = active_branch_id
            .as_deref()
            .and_then(|bid| q.branches.iter().find(|b| b.id == bid))
            .map(|b| b.text.clone());

        quests.push(QuestItemView {
            id: q.id.clone(),
            cls: q.cls.clone(),
            category: q.cat.clone(),
            category_name: cat_names
                .get(q.cat.as_str())
                .copied()
                .unwrap_or(&q.cat)
                .to_string(),
            title: crate::catalog::title_case_if_all_caps(&q.title),
            subtitle: q.subtitle.clone(),
            region: q.region.clone(),
            region_name: q
                .region
                .as_deref()
                .and_then(|r| reg_names.get(r).copied())
                .unwrap_or("Across regions")
                .to_string(),
            status: status.to_string(),
            tracked: !idx.tracked_quest.is_empty() && idx.tracked_quest == cls_lower,
            start_time: idx.quest_times.get(&cls_lower).copied(),
            current_step,
            branches,
            missable_ids: q.missables.clone(),
        });
    }

    Ok(QuestsView {
        done: done_cnt,
        in_progress: prog_cnt,
        not_started: todo_cnt,
        failed: fail_cnt,
        quests,
    })
}

pub fn get_weapons(session: &SaveSession, cat: &Catalog) -> Result<Vec<WeaponEntryView>> {
    let json = session.active_json()?;
    let idx = SaveIndex::build(json);
    let inv = json.get("Inventory");

    let eq_main: HashSet<String> = inv
        .and_then(|i| i.get("MainWeapons"))
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .map(str::to_lowercase)
                .collect()
        })
        .unwrap_or_default();
    let eq_shachi: HashSet<String> = inv
        .and_then(|i| i.get("ShaqiWeapons"))
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .map(str::to_lowercase)
                .collect()
        })
        .unwrap_or_default();

    let mut out = Vec::new();
    let mut seen = HashSet::new();

    for item in &cat.items {
        if item.category != "weapon" && item.category != "phantom" {
            continue;
        }
        let lower = item.id.to_lowercase();
        if !seen.insert(lower.clone()) {
            continue;
        }
        let table = if item.category == "weapon" {
            "MainWeaponInfos"
        } else {
            "ShaChiWeaponInfo"
        };
        let entry = idx.inv_entry(table, &item.id);
        let owned = entry.is_some();
        let save_key = entry
            .map(|(k, _)| k.to_string())
            .unwrap_or_else(|| item.id.clone());
        let level = entry
            .and_then(|(_, v)| {
                v.get(if item.category == "weapon" {
                    "WeaponLevel"
                } else {
                    "ShaChiWeaponLevel"
                })
            })
            .and_then(Value::as_i64)
            .unwrap_or(0);
        let snap_soul = entry
            .and_then(|(_, v)| v.get("AlreadySnapSoul"))
            .is_some_and(|v| v.as_bool().unwrap_or(false) || v.as_i64().unwrap_or(0) > 0);
        let acquired_cycle = entry
            .and_then(|(_, v)| v.get("AcquiredCycle"))
            .and_then(Value::as_i64)
            .unwrap_or(0);
        let equipped = if item.category == "weapon" {
            eq_main.contains(&lower)
        } else {
            eq_shachi.contains(&lower)
        };

        out.push(WeaponEntryView {
            id: item.id.clone(),
            name: cat.item_display_name(&item.id),
            name_zh: item.name.clone(),
            description: if item.description_en.is_empty() {
                item.description.clone()
            } else {
                item.description_en.clone()
            },
            kind: item.category.clone(),
            owned,
            equipped,
            level,
            snap_soul,
            acquired_cycle,
            save_key,
        });
    }

    out.sort_by(|a, b| {
        b.owned
            .cmp(&a.owned)
            .then_with(|| b.equipped.cmp(&a.equipped))
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(out)
}

pub fn get_gear(session: &SaveSession, cat: &Catalog) -> Result<Vec<GearEntryView>> {
    let json = session.active_json()?;
    let idx = SaveIndex::build(json);
    let inv = json.get("Inventory");

    let eq_acc: HashSet<String> = inv
        .and_then(|i| i.get("AccessoryIDs"))
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .map(str::to_lowercase)
                .collect()
        })
        .unwrap_or_default();
    let top_med = inv
        .and_then(|i| i.get("TopMedicine"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_lowercase();
    let bot_med = inv
        .and_then(|i| i.get("BottomMedicine"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_lowercase();

    let mut out = Vec::new();
    let mut seen = HashSet::new();

    for item in &cat.items {
        if item.category != "accessory" && item.category != "medicine" {
            continue;
        }
        let lower = item.id.to_lowercase();
        if !seen.insert(lower.clone()) {
            continue;
        }
        let table = if item.category == "accessory" {
            "AccessoryInfos"
        } else {
            "MedicineInfos"
        };
        let entry = idx.inv_entry(table, &item.id);
        let owned = entry.is_some();
        let save_key = entry
            .map(|(k, _)| k.to_string())
            .unwrap_or_else(|| item.id.clone());
        let level = entry
            .and_then(|(_, v)| v.get("CurrentLevel"))
            .and_then(Value::as_i64)
            .unwrap_or(0);
        let current_charges = entry
            .and_then(|(_, v)| v.get("CurrentTime"))
            .and_then(Value::as_i64)
            .unwrap_or(0);
        let max_charges = entry
            .and_then(|(_, v)| v.get("MaxTime"))
            .and_then(Value::as_i64)
            .unwrap_or(0);
        let acquired_cycle = entry
            .and_then(|(_, v)| v.get("AcquiredCycle"))
            .and_then(Value::as_i64)
            .unwrap_or(0);
        let equipped = if item.category == "accessory" {
            eq_acc.contains(&lower)
        } else {
            lower == top_med || lower == bot_med
        };

        out.push(GearEntryView {
            id: item.id.clone(),
            name: cat.item_display_name(&item.id),
            name_zh: item.name.clone(),
            description: if item.description_en.is_empty() {
                item.description.clone()
            } else {
                item.description_en.clone()
            },
            kind: item.category.clone(),
            owned,
            equipped,
            level,
            current_charges,
            max_charges,
            acquired_cycle,
            save_key,
        });
    }

    out.sort_by(|a, b| {
        b.owned
            .cmp(&a.owned)
            .then_with(|| b.equipped.cmp(&a.equipped))
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(out)
}

pub fn get_inventory(session: &SaveSession, cat: &Catalog) -> Result<Vec<InventoryEntryView>> {
    let json = session.active_json()?;
    let idx = SaveIndex::build(json);

    let mut out = Vec::new();
    let mut seen = HashSet::new();

    for item in &cat.items {
        if item.category != "goods" {
            continue;
        }
        let lower = item.id.to_lowercase();
        if !seen.insert(lower) {
            continue;
        }
        let entry = idx.inv_entry("InventoryInfos", &item.id);
        let owned = entry.is_some();
        let save_key = entry
            .map(|(k, _)| k.to_string())
            .unwrap_or_else(|| item.id.clone());
        let amount = entry
            .and_then(|(_, v)| v.get("CurrentAmount"))
            .and_then(Value::as_i64)
            .unwrap_or(0);
        let max_amount = entry
            .and_then(|(_, v)| v.get("MaxAmount"))
            .and_then(Value::as_i64)
            .unwrap_or(1);
        let acquired_cycle = entry
            .and_then(|(_, v)| v.get("AcquiredCycle"))
            .and_then(Value::as_i64)
            .unwrap_or(0);

        out.push(InventoryEntryView {
            id: item.id.clone(),
            name: cat.item_display_name(&item.id),
            name_zh: item.name.clone(),
            subcategory: item.subcategory.clone(),
            description: if item.description_en.is_empty() {
                item.description.clone()
            } else {
                item.description_en.clone()
            },
            owned,
            amount,
            max_amount,
            acquired_cycle,
            save_key,
        });
    }

    // Also include save-only InventoryInfos entries not in catalog
    if let Some(inv_map) = idx
        .inv_root
        .and_then(|i| i.get("InventoryInfos"))
        .and_then(Value::as_object)
    {
        for (k, v) in inv_map {
            let lower = k.to_lowercase();
            if seen.insert(lower) {
                out.push(InventoryEntryView {
                    id: k.clone(),
                    name: k.clone(),
                    name_zh: String::new(),
                    subcategory: "Save-only".into(),
                    description: String::new(),
                    owned: true,
                    amount: v.get("CurrentAmount").and_then(Value::as_i64).unwrap_or(1),
                    max_amount: v.get("MaxAmount").and_then(Value::as_i64).unwrap_or(1),
                    acquired_cycle: v.get("AcquiredCycle").and_then(Value::as_i64).unwrap_or(0),
                    save_key: k.clone(),
                });
            }
        }
    }

    out.sort_by(|a, b| b.owned.cmp(&a.owned).then_with(|| a.name.cmp(&b.name)));
    Ok(out)
}

pub fn get_raw_overview(session: &SaveSession) -> Result<RawOverviewView> {
    let json = session.active_json()?;
    let obj = json
        .as_object()
        .ok_or_else(|| Error::InvalidFormat("Save slot root is not a JSON object".into()))?;
    let mut sections: Vec<RawSectionSummary> = obj
        .iter()
        .map(|(k, v)| {
            let (kind, len) = match v {
                Value::Object(m) => ("object", m.len()),
                Value::Array(a) => ("array", a.len()),
                Value::String(s) => ("string", s.len()),
                Value::Number(_) => ("number", 1),
                Value::Bool(_) => ("bool", 1),
                Value::Null => ("null", 0),
            };
            RawSectionSummary {
                key: k.clone(),
                kind: kind.to_string(),
                len,
            }
        })
        .collect();
    sections.sort_by(|a, b| a.key.cmp(&b.key));

    let mut global_tags: Vec<String> = json
        .get("EventPipeline")
        .and_then(|e| e.get("GlobalTags"))
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(String::from)
                .collect()
        })
        .unwrap_or_default();
    global_tags.sort();

    Ok(RawOverviewView {
        sections,
        global_tags,
    })
}

pub fn get_raw_section(session: &SaveSession, section: &str) -> Result<String> {
    let json = session.active_json()?;
    let val = json
        .get(section)
        .ok_or_else(|| Error::NotFound(format!("Section not found: {section}")))?;
    Ok(serde_json::to_string_pretty(val)?)
}

/* ==================== MUTATIONS ==================== */

pub fn set_player_resource(session: &mut SaveSession, field: &str, value: i64) -> Result<()> {
    let max_val = match field {
        "Dust" | "SpiritShadow" => 999_999_999,
        "RemainingDays" => 999,
        "UltimateCharge" | "UltimateChargeCount" => 100,
        _ => {
            return Err(Error::Validation(format!(
                "Unsupported player field: {field}"
            )));
        }
    };
    if value < 0 || value > max_val {
        return Err(Error::Validation(format!(
            "{field} must be between 0 and {max_val}"
        )));
    }
    session.apply_to_active(vec![PatchOp::Set {
        path: vec!["Player".into()],
        key: field.to_string(),
        val_json: value.to_string(),
    }])
}

pub fn set_game_option(session: &mut SaveSession, field: &str, value: Value) -> Result<()> {
    match field {
        "DifficultModeByte" => {
            let v = value
                .as_i64()
                .ok_or_else(|| Error::Validation("Difficulty must be an integer".into()))?;
            if !(0..=4).contains(&v) {
                return Err(Error::Validation(
                    "Difficulty must be between 0 and 4".into(),
                ));
            }
        }
        "bCanSelectNightMare" => {
            if !value.is_boolean() {
                return Err(Error::Validation(
                    "bCanSelectNightMare must be a boolean".into(),
                ));
            }
        }
        _ => {
            return Err(Error::Validation(format!(
                "Unsupported game option: {field}"
            )));
        }
    }
    session.apply_to_active(vec![PatchOp::Set {
        path: vec!["PBZGameSystem".into()],
        key: field.to_string(),
        val_json: serde_json::to_string(&value)?,
    }])
}

pub fn mark_completion_entries(
    session: &mut SaveSession,
    cat: &Catalog,
    keys: &[String],
) -> Result<usize> {
    let json = session.active_json()?.clone();
    let idx = SaveIndex::build(&json);
    let ts = now_pbz_timestamp();
    let mut ops = Vec::new();
    let mut added_bells = idx.bells.clone();
    let mut added_tags = idx.global_tags.clone();
    let mut count = 0usize;

    for key in keys {
        let Some(entry) = cat.entry(key) else {
            continue;
        };
        let status = idx.entry_status(entry);
        if status == "done" {
            continue;
        }
        let before = ops.len();
        match entry.cat.as_str() {
            "bell" => {
                if let Some(id) = &entry.id
                    && added_bells.insert(id.to_lowercase())
                {
                    ops.push(PatchOp::Push {
                        path: vec!["BellManager".into(), "ActivateBellIDs".into()],
                        val_json: serde_json::to_string(id)?,
                    });
                }
            }
            "weapon" | "accessory" | "flower" => {
                if let (Some(table), Some(id)) = (table_of_arr(&entry.arr), entry.id.as_deref()) {
                    if status == "oldcycle"
                        && let Some((existing_key, _)) = idx.inv_entry(table, id)
                    {
                        ops.push(PatchOp::Set {
                            path: vec!["Inventory".into(), table.into(), existing_key.to_string()],
                            key: "AcquiredCycle".into(),
                            val_json: idx.cycle.to_string(),
                        });
                    } else {
                        let rec = default_item_record(table, &ts, idx.cycle);
                        ops.push(PatchOp::Set {
                            path: vec!["Inventory".into(), table.into()],
                            key: id.to_string(),
                            val_json: serde_json::to_string(&rec)?,
                        });
                    }
                }
            }
            "key" => {
                if let Some(id) = entry.id.as_deref() {
                    if idx.inv_entry("InventoryInfos", id).is_none() {
                        let rec = default_item_record("InventoryInfos", &ts, idx.cycle);
                        ops.push(PatchOp::Set {
                            path: vec!["Inventory".into(), "InventoryInfos".into()],
                            key: id.to_string(),
                            val_json: serde_json::to_string(&rec)?,
                        });
                    }
                } else if let Some(guid) = entry.guids.first() {
                    ops.push(PatchOp::Set {
                        path: vec!["EventPipeline".into(), "ExecuteNodeGuid".into()],
                        key: guid.clone(),
                        val_json: "true".into(),
                    });
                }
            }
            "challenge" => {
                if let Some(guid) = entry.guids.first() {
                    ops.push(PatchOp::Set {
                        path: vec!["EventPipeline".into(), "ExecuteNodeGuid".into()],
                        key: guid.clone(),
                        val_json: "true".into(),
                    });
                    // Human-Faced Banyan challenges also track `rszx.榕树之心.完成挑战N` tags.
                    if entry.arr == "RongShu"
                        && let Some(num) = entry
                            .flow
                            .as_deref()
                            .and_then(|f| f.rsplit('_').next())
                            .filter(|n| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()))
                    {
                        let tag = format!("rszx.榕树之心.完成挑战{num}");
                        if added_tags.insert(tag.clone()) {
                            ops.push(PatchOp::Push {
                                path: vec!["EventPipeline".into(), "GlobalTags".into()],
                                val_json: serde_json::to_string(&tag)?,
                            });
                        }
                    }
                }
            }
            _ => {
                if let Some(mob) = &entry.mob {
                    ops.push(PatchOp::Push {
                        path: vec![
                            "PBZGameSystem".into(),
                            "CompleteAddItemMobDomainNames".into(),
                        ],
                        val_json: serde_json::to_string(mob)?,
                    });
                } else if let Some(actor) = &entry.actor {
                    ops.push(PatchOp::Set {
                        path: vec!["LevelActorManager".into()],
                        key: actor.clone(),
                        val_json: r#"{"SwitchState":true}"#.into(),
                    });
                } else if let Some(guid) = entry.guids.first() {
                    ops.push(PatchOp::Set {
                        path: vec!["EventPipeline".into(), "ExecuteNodeGuid".into()],
                        key: guid.clone(),
                        val_json: "true".into(),
                    });
                }
            }
        }
        if ops.len() > before {
            count += 1;
        }
    }

    session.apply_to_active(ops)?;
    Ok(count)
}

pub fn apply_missable_fix(
    session: &mut SaveSession,
    cat: &Catalog,
    missable_id: &str,
) -> Result<usize> {
    let def = cat
        .missables
        .missables
        .iter()
        .find(|m| m.id == missable_id)
        .ok_or_else(|| Error::NotFound(format!("Missable not found: {missable_id}")))?;
    let fix = def
        .fix
        .as_ref()
        .ok_or_else(|| Error::Validation("This missable has no automated save fix.".into()))?;

    let json = session.active_json()?.clone();
    let idx = SaveIndex::build(&json);
    let ts = now_pbz_timestamp();
    let mut ops = Vec::new();
    let mut seen_tags = idx.global_tags.clone();

    for tag in &fix.tags {
        if seen_tags.insert(tag.clone()) {
            ops.push(PatchOp::Push {
                path: vec!["EventPipeline".into(), "GlobalTags".into()],
                val_json: serde_json::to_string(tag)?,
            });
        }
    }
    for item_id in &fix.items {
        if !idx.all_owned_items.contains(&item_id.to_lowercase()) {
            let table = cat.table_for_item_id(item_id);
            let rec = default_item_record(table, &ts, idx.cycle);
            ops.push(PatchOp::Set {
                path: vec!["Inventory".into(), table.into()],
                key: item_id.clone(),
                val_json: serde_json::to_string(&rec)?,
            });
        }
    }

    let n = ops.len();
    session.apply_to_active(ops)?;
    Ok(n)
}

pub fn update_weapon(
    session: &mut SaveSession,
    id: &str,
    kind: &str,
    level: i64,
    snap_soul: bool,
) -> Result<()> {
    if !(0..=100).contains(&level) {
        return Err(Error::Validation(
            "Weapon level must be between 0 and 100".into(),
        ));
    }
    let table = match kind {
        "weapon" => "MainWeaponInfos",
        "phantom" => "ShaChiWeaponInfo",
        _ => return Err(Error::Validation(format!("Invalid weapon kind: {kind}"))),
    };
    let json = session.active_json()?.clone();
    let idx = SaveIndex::build(&json);
    let ts = now_pbz_timestamp();

    let mut ops = Vec::new();
    if let Some((save_key, _)) = idx.inv_entry(table, id) {
        let level_field = if kind == "weapon" {
            "WeaponLevel"
        } else {
            "ShaChiWeaponLevel"
        };
        let snap_val = if kind == "weapon" {
            if snap_soul { "1" } else { "0" }
        } else if snap_soul {
            "true"
        } else {
            "false"
        };
        ops.push(PatchOp::Set {
            path: vec!["Inventory".into(), table.into(), save_key.to_string()],
            key: level_field.into(),
            val_json: level.to_string(),
        });
        ops.push(PatchOp::Set {
            path: vec!["Inventory".into(), table.into(), save_key.to_string()],
            key: "AlreadySnapSoul".into(),
            val_json: snap_val.into(),
        });
    } else {
        let mut rec = default_item_record(table, &ts, idx.cycle);
        if let Some(obj) = rec.as_object_mut() {
            if kind == "weapon" {
                obj.insert("WeaponLevel".into(), json!(level));
                obj.insert(
                    "AlreadySnapSoul".into(),
                    json!(if snap_soul { 1 } else { 0 }),
                );
            } else {
                obj.insert("ShaChiWeaponLevel".into(), json!(level));
                obj.insert("AlreadySnapSoul".into(), json!(snap_soul));
            }
        }
        ops.push(PatchOp::Set {
            path: vec!["Inventory".into(), table.into()],
            key: id.to_string(),
            val_json: serde_json::to_string(&rec)?,
        });
    }

    session.apply_to_active(ops)
}

pub fn update_gear(
    session: &mut SaveSession,
    id: &str,
    kind: &str,
    level: i64,
    max_charges: Option<i64>,
) -> Result<()> {
    if !(0..=100).contains(&level) {
        return Err(Error::Validation("Level must be between 0 and 100".into()));
    }
    let table = match kind {
        "accessory" => "AccessoryInfos",
        "medicine" => "MedicineInfos",
        _ => return Err(Error::Validation(format!("Invalid gear kind: {kind}"))),
    };
    let json = session.active_json()?.clone();
    let idx = SaveIndex::build(&json);
    let ts = now_pbz_timestamp();

    let mut ops = Vec::new();
    if let Some((save_key, _)) = idx.inv_entry(table, id) {
        ops.push(PatchOp::Set {
            path: vec!["Inventory".into(), table.into(), save_key.to_string()],
            key: "CurrentLevel".into(),
            val_json: level.to_string(),
        });
        if kind == "medicine"
            && let Some(mc) = max_charges
        {
            if !(0..=99).contains(&mc) {
                return Err(Error::Validation(
                    "Max charges must be between 0 and 99".into(),
                ));
            }
            ops.push(PatchOp::Set {
                path: vec!["Inventory".into(), table.into(), save_key.to_string()],
                key: "MaxTime".into(),
                val_json: mc.to_string(),
            });
        }
    } else {
        let mut rec = default_item_record(table, &ts, idx.cycle);
        if let Some(obj) = rec.as_object_mut() {
            obj.insert("CurrentLevel".into(), json!(level));
            if kind == "medicine"
                && let Some(mc) = max_charges
            {
                obj.insert("MaxTime".into(), json!(mc));
            }
        }
        ops.push(PatchOp::Set {
            path: vec!["Inventory".into(), table.into()],
            key: id.to_string(),
            val_json: serde_json::to_string(&rec)?,
        });
    }
    session.apply_to_active(ops)
}

pub fn set_inventory_amount(session: &mut SaveSession, id: &str, amount: i64) -> Result<()> {
    if !(0..=99_999).contains(&amount) {
        return Err(Error::Validation(
            "Amount must be between 0 and 99,999".into(),
        ));
    }
    let json = session.active_json()?.clone();
    let idx = SaveIndex::build(&json);
    let ts = now_pbz_timestamp();

    let mut ops = Vec::new();
    if let Some((save_key, row)) = idx.inv_entry("InventoryInfos", id) {
        if amount == 0 {
            ops.push(PatchOp::RemoveKey {
                path: vec!["Inventory".into(), "InventoryInfos".into()],
                key: save_key.to_string(),
            });
        } else {
            let cur_max = row.get("MaxAmount").and_then(Value::as_i64).unwrap_or(1);
            ops.push(PatchOp::Set {
                path: vec![
                    "Inventory".into(),
                    "InventoryInfos".into(),
                    save_key.to_string(),
                ],
                key: "CurrentAmount".into(),
                val_json: amount.to_string(),
            });
            if amount > cur_max {
                ops.push(PatchOp::Set {
                    path: vec![
                        "Inventory".into(),
                        "InventoryInfos".into(),
                        save_key.to_string(),
                    ],
                    key: "MaxAmount".into(),
                    val_json: amount.to_string(),
                });
            }
        }
    } else if amount > 0 {
        let mut rec = default_item_record("InventoryInfos", &ts, idx.cycle);
        if let Some(obj) = rec.as_object_mut() {
            obj.insert("CurrentAmount".into(), json!(amount));
            obj.insert("MaxAmount".into(), json!(amount.max(1)));
        }
        ops.push(PatchOp::Set {
            path: vec!["Inventory".into(), "InventoryInfos".into()],
            key: id.to_string(),
            val_json: serde_json::to_string(&rec)?,
        });
    }

    session.apply_to_active(ops)
}

pub fn add_global_tag(session: &mut SaveSession, tag: &str) -> Result<()> {
    let trimmed = tag.trim();
    if trimmed.is_empty() {
        return Err(Error::Validation("Tag cannot be empty".into()));
    }
    let json = session.active_json()?;
    let idx = SaveIndex::build(json);
    if idx.global_tags.contains(trimmed) {
        return Ok(());
    }
    session.apply_to_active(vec![PatchOp::Push {
        path: vec!["EventPipeline".into(), "GlobalTags".into()],
        val_json: serde_json::to_string(trimmed)?,
    }])
}

pub fn remove_global_tag(session: &mut SaveSession, tag: &str) -> Result<()> {
    session.apply_to_active(vec![PatchOp::RemoveArrayString {
        path: vec!["EventPipeline".into(), "GlobalTags".into()],
        value: tag.to_string(),
    }])
}
