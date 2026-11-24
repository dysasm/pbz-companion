//! Save discovery, stale-file detection, timestamped backups, and active session management.

use crate::error::{Error, Result};
use crate::json_patch::{PatchOp, apply_ops};
use crate::pbzs::PbzsContainer;
use chrono::Local;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;

const DEFAULT_STEAM_DIRS: &[&str] = &[
    r"C:\Program Files (x86)\Steam\steamapps\common\PBZ",
    r"C:\Program Files\Steam\steamapps\common\PBZ",
    r"D:\SteamLibrary\steamapps\common\PBZ",
    r"E:\SteamLibrary\steamapps\common\PBZ",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredSave {
    pub path: String,
    pub file_name: String,
    pub kind: String,
    pub folder: String,
    pub modified_epoch_ms: u64,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub roots: Vec<String>,
    pub saves: Vec<DiscoveredSave>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotSummary {
    pub name: String,
    pub date_time: String,
    pub cycle_count: i64,
    pub difficulty: i64,
    pub game_time_seconds: i64,
    pub current_level: String,
    pub last_bell_id: String,
    pub alg: u8,
    pub raw_size: u32,
    pub is_newest: bool,
    pub dirty: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveMetadata {
    pub path: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub active_slot: String,
    pub slots: Vec<SlotSummary>,
    pub dirty: bool,
    pub pending_changes: usize,
    pub backup_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteReport {
    pub path: String,
    pub backup_path: Option<String>,
    pub slots_modified: Vec<String>,
    pub total_bytes: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FileFingerprint {
    size: u64,
    mtime_secs: u64,
    sha256: [u8; 32],
}

fn fingerprint(path: &Path) -> Result<FileFingerprint> {
    let meta = fs::metadata(path)?;
    let bytes = fs::read(path)?;
    let mtime_secs = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_secs());
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let digest: [u8; 32] = hasher.finalize().into();
    Ok(FileFingerprint {
        size: meta.len(),
        mtime_secs,
        sha256: digest,
    })
}

pub fn default_game_install_dir() -> Option<PathBuf> {
    if let Ok(env_game) = std::env::var("PBZ_GAME") {
        let p = PathBuf::from(env_game);
        if p.join("ProjectPBZ").exists() {
            return Some(p);
        }
    }
    for candidate in DEFAULT_STEAM_DIRS {
        let p = PathBuf::from(candidate);
        if p.join("ProjectPBZ").exists() {
            return Some(p);
        }
    }
    None
}

pub fn discover_saves(game_dir: Option<&Path>, extra_folders: &[PathBuf]) -> ScanResult {
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Some(gd) = game_dir {
        roots.push(gd.join("ProjectPBZ").join("Saved").join("SaveGames"));
    }
    for candidate in DEFAULT_STEAM_DIRS {
        roots.push(
            PathBuf::from(candidate)
                .join("ProjectPBZ")
                .join("Saved")
                .join("SaveGames"),
        );
    }
    if let Ok(local_app) = std::env::var("LOCALAPPDATA") {
        roots.push(
            PathBuf::from(local_app)
                .join("PBZ")
                .join("Saved")
                .join("SaveGames"),
        );
    }
    for extra in extra_folders {
        roots.push(extra.clone());
    }

    // Deduplicate existing roots
    let mut unique_roots: Vec<PathBuf> = Vec::new();
    let mut seen_roots = HashSet::new();
    for r in roots {
        if r.exists() {
            let canon = fs::canonicalize(&r).unwrap_or(r);
            if seen_roots.insert(canon.clone()) {
                unique_roots.push(canon);
            }
        }
    }

    let mut found: Vec<(DiscoveredSave, u8)> = Vec::new();
    let mut seen_files = HashSet::new();

    for root in &unique_roots {
        for entry in WalkDir::new(root).max_depth(6).into_iter().flatten() {
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();
            if path
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_lowercase())
                .as_deref()
                != Some("sav")
            {
                continue;
            }
            let Ok(meta) = entry.metadata() else {
                continue;
            };
            if meta.len() < 4096 {
                continue;
            }
            // Quick magic check so non-PBZS Unreal settings files are skipped
            let Ok(head) = read_head_4(path) else {
                continue;
            };
            if &head != b"PBZS" {
                continue;
            }

            let mtime_ms = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_millis() as u64);
            let dedupe_key = (meta.len(), mtime_ms / 1000);
            if !seen_files.insert(dedupe_key) {
                continue;
            }

            let file_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("PBZSaveGame.sav")
                .to_string();
            let parent_name = path
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or("");
            let grandparent_name = path
                .parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or("");

            let (kind, folder, rank) = match parent_name {
                "1RealTime" => (
                    "Game backup (real-time)".to_string(),
                    grandparent_name.to_string(),
                    2u8,
                ),
                "2Hourly" => (
                    "Game backup (hourly)".to_string(),
                    grandparent_name.to_string(),
                    3u8,
                ),
                "3Daily" => (
                    "Game backup (daily)".to_string(),
                    grandparent_name.to_string(),
                    4u8,
                ),
                _ if file_name.eq_ignore_ascii_case("PBZSaveGame.sav")
                    && parent_name.contains("Copy") =>
                {
                    ("Copied save".to_string(), parent_name.to_string(), 1u8)
                }
                _ if file_name.eq_ignore_ascii_case("PBZSaveGame.sav") => {
                    ("Live save".to_string(), parent_name.to_string(), 0u8)
                }
                _ => ("Save file".to_string(), parent_name.to_string(), 1u8),
            };

            found.push((
                DiscoveredSave {
                    path: path.to_string_lossy().to_string(),
                    file_name,
                    kind,
                    folder,
                    modified_epoch_ms: mtime_ms,
                    size_bytes: meta.len(),
                },
                rank,
            ));
        }
    }

    found.sort_by(|a, b| {
        a.1.cmp(&b.1)
            .then_with(|| b.0.modified_epoch_ms.cmp(&a.0.modified_epoch_ms))
    });

    ScanResult {
        roots: unique_roots
            .into_iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect(),
        saves: found.into_iter().map(|(s, _)| s).collect(),
    }
}

fn read_head_4(path: &Path) -> Result<[u8; 4]> {
    use std::io::Read;
    let mut f = fs::File::open(path)?;
    let mut buf = [0u8; 4];
    f.read_exact(&mut buf)?;
    Ok(buf)
}

pub struct SaveSession {
    path: PathBuf,
    fingerprint: FileFingerprint,
    container: PbzsContainer,
    active_slot: String,
    /// Staged lossless patch ops per slot name.
    pending_ops: HashMap<String, Vec<PatchOp>>,
    /// Live preview of patched JSON per slot name so reads reflect staged edits immediately.
    working_json: HashMap<String, Value>,
    working_text: HashMap<String, String>,
    last_backup: Option<PathBuf>,
}

impl SaveSession {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref().to_path_buf();
        let bytes = fs::read(&path)?;
        let fp = fingerprint(&path)?;
        let container = PbzsContainer::parse(&bytes)?;

        let active_slot = pick_newest_slot(&container).ok_or_else(|| {
            Error::InvalidFormat("No readable save slot found in container".into())
        })?;

        Ok(Self {
            path,
            fingerprint: fp,
            container,
            active_slot,
            pending_ops: HashMap::new(),
            working_json: HashMap::new(),
            working_text: HashMap::new(),
            last_backup: None,
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn active_slot_name(&self) -> &str {
        &self.active_slot
    }

    pub fn set_active_slot(&mut self, slot_name: &str) -> Result<()> {
        let slot = self
            .container
            .slot(slot_name)
            .ok_or_else(|| Error::NotFound(format!("Slot not found: {slot_name}")))?;
        if slot.json.is_none() {
            return Err(Error::InvalidFormat(format!(
                "Slot {slot_name} failed to decode"
            )));
        }
        self.active_slot = slot_name.to_string();
        Ok(())
    }

    pub fn is_dirty(&self) -> bool {
        self.pending_ops.values().any(|ops| !ops.is_empty())
    }

    pub fn pending_change_count(&self) -> usize {
        self.pending_ops.values().map(Vec::len).sum()
    }

    pub fn discard(&mut self) {
        self.pending_ops.clear();
        self.working_json.clear();
        self.working_text.clear();
    }

    pub fn active_json(&self) -> Result<&Value> {
        self.slot_json(&self.active_slot)
    }

    pub fn slot_json(&self, slot_name: &str) -> Result<&Value> {
        if let Some(v) = self.working_json.get(slot_name) {
            return Ok(v);
        }
        self.container
            .slot(slot_name)
            .and_then(|s| s.json.as_ref())
            .ok_or_else(|| Error::NotFound(format!("Readable slot not found: {slot_name}")))
    }

    pub fn slot_text(&self, slot_name: &str) -> Result<&str> {
        if let Some(t) = self.working_text.get(slot_name) {
            return Ok(t.as_str());
        }
        self.container
            .slot(slot_name)
            .and_then(|s| s.text.as_deref())
            .ok_or_else(|| Error::NotFound(format!("Readable slot text not found: {slot_name}")))
    }

    /// Stage lossless JSON patch operations against the currently active slot
    /// and immediately validate + update the in-memory working view.
    pub fn apply_to_active(&mut self, ops: Vec<PatchOp>) -> Result<()> {
        if ops.is_empty() {
            return Ok(());
        }
        let slot_name = self.active_slot.clone();
        self.apply_to_slot(&slot_name, ops)
    }

    pub fn apply_to_slot(&mut self, slot_name: &str, ops: Vec<PatchOp>) -> Result<()> {
        if ops.is_empty() {
            return Ok(());
        }
        let current_text = self.slot_text(slot_name)?.to_string();
        let next_text = apply_ops(&current_text, &ops)?;
        let next_json: Value = serde_json::from_str(&next_text)?;
        self.working_text.insert(slot_name.to_string(), next_text);
        self.working_json.insert(slot_name.to_string(), next_json);
        self.pending_ops
            .entry(slot_name.to_string())
            .or_default()
            .extend(ops);
        Ok(())
    }

    pub fn metadata(&self) -> SaveMetadata {
        let newest = pick_newest_slot(&self.container);
        let mut slots: Vec<SlotSummary> = self
            .container
            .slots
            .iter()
            .filter(|s| !s.name.starts_with("__"))
            .map(|s| {
                let json = self.working_json.get(&s.name).or(s.json.as_ref());
                let gs = json.and_then(|j| j.get("PBZGameSystem"));
                let date_time = gs
                    .and_then(|g| g.get("DateTimeString"))
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let cycle_count = gs
                    .and_then(|g| g.get("CycleCount"))
                    .and_then(Value::as_i64)
                    .unwrap_or(0);
                let difficulty = gs
                    .and_then(|g| g.get("DifficultModeByte"))
                    .and_then(Value::as_i64)
                    .unwrap_or(0);
                let game_time_seconds = gs
                    .and_then(|g| g.get("HasGameTime"))
                    .and_then(Value::as_i64)
                    .unwrap_or(0);
                let current_level = gs
                    .and_then(|g| g.get("CurrentLevelName"))
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let last_bell_id = gs
                    .and_then(|g| g.get("LastSaveActorID"))
                    .and_then(Value::as_str)
                    .or_else(|| {
                        json.and_then(|j| j.get("BellSaveID"))
                            .and_then(Value::as_str)
                    })
                    .unwrap_or("")
                    .to_string();
                let dirty = self
                    .pending_ops
                    .get(&s.name)
                    .is_some_and(|ops| !ops.is_empty());

                SlotSummary {
                    name: s.name.clone(),
                    date_time,
                    cycle_count,
                    difficulty,
                    game_time_seconds,
                    current_level,
                    last_bell_id,
                    alg: s.alg,
                    raw_size: s.raw_size,
                    is_newest: newest.as_deref() == Some(s.name.as_str()),
                    dirty,
                    error: s.error.clone(),
                }
            })
            .collect();

        slots.sort_by(|a, b| {
            b.date_time
                .cmp(&a.date_time)
                .then_with(|| a.name.cmp(&b.name))
        });

        SaveMetadata {
            path: self.path.to_string_lossy().to_string(),
            file_name: self
                .path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("PBZSaveGame.sav")
                .to_string(),
            size_bytes: self.fingerprint.size,
            active_slot: self.active_slot.clone(),
            slots,
            dirty: self.is_dirty(),
            pending_changes: self.pending_change_count(),
            backup_path: self
                .last_backup
                .as_ref()
                .map(|p| p.to_string_lossy().to_string()),
        }
    }

    pub fn create_backup(&mut self) -> Result<PathBuf> {
        let stamp = Local::now().format("%Y%m%d-%H%M%S").to_string();
        let file_name = self
            .path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("PBZSaveGame.sav");
        let parent = self.path.parent().unwrap_or_else(|| Path::new("."));
        let mut target = parent.join(format!("{file_name}.{stamp}.bak"));
        let mut idx = 1usize;
        while target.exists() {
            idx += 1;
            target = parent.join(format!("{file_name}.{stamp}-{idx}.bak"));
        }
        fs::copy(&self.path, &target)?;
        self.last_backup = Some(target.clone());
        Ok(target)
    }

    /// Safely write all staged edits to disk:
    /// 1. Refuses if the file changed on disk since open (stale-file guard).
    /// 2. Re-seals only modified slots with Oodle stored blocks + AES-256-GCM.
    /// 3. Re-parses the entire finished file to verify every slot decodes cleanly.
    /// 4. Creates a timestamped `.bak` copy if none was created yet in this session.
    /// 5. Writes to a temporary file beside the target and atomically replaces it.
    pub fn write(&mut self) -> Result<WriteReport> {
        if !self.is_dirty() {
            return Err(Error::Validation(
                "There are no unsaved changes to write.".into(),
            ));
        }

        // 1. Stale-file check
        let current_fp = fingerprint(&self.path)?;
        if current_fp != self.fingerprint {
            return Err(Error::StaleFile);
        }

        // 2. Build replacement map
        let mut replacements = HashMap::new();
        let mut slots_modified = Vec::new();
        for (slot_name, ops) in &self.pending_ops {
            if ops.is_empty() {
                continue;
            }
            let text = self.working_text.get(slot_name).ok_or_else(|| {
                Error::Verification(format!("Missing working text for {slot_name}"))
            })?;
            replacements.insert(slot_name.clone(), text.clone());
            slots_modified.push(slot_name.clone());
        }
        slots_modified.sort();

        // 3. Serialize and round-trip verify the entire container
        let encoded_bytes = self.container.write_with_replacements(&replacements)?;
        let verified = PbzsContainer::parse(&encoded_bytes)?;
        for slot in &verified.slots {
            if let Some(err) = &slot.error {
                return Err(Error::Verification(format!(
                    "Slot {} failed post-write verification: {err}",
                    slot.name
                )));
            }
        }

        // 4. Backup original before first write
        let backup_path = if let Some(existing) = &self.last_backup {
            Some(existing.clone())
        } else {
            Some(self.create_backup()?)
        };

        // 5. Atomic temp write + replace
        let parent = self.path.parent().unwrap_or_else(|| Path::new("."));
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos());
        let tmp_path = parent.join(format!(".pbz-companion-write-{nonce}.tmp"));
        fs::write(&tmp_path, &encoded_bytes)?;
        if let Err(err) = replace_file(&tmp_path, &self.path) {
            let _ = fs::remove_file(&tmp_path);
            return Err(err);
        }

        // 6. Refresh session state from verified container & new fingerprint
        self.container = verified;
        self.fingerprint = fingerprint(&self.path)?;
        self.pending_ops.clear();
        self.working_json.clear();
        self.working_text.clear();

        Ok(WriteReport {
            path: self.path.to_string_lossy().to_string(),
            backup_path: backup_path.map(|p| p.to_string_lossy().to_string()),
            slots_modified,
            total_bytes: encoded_bytes.len(),
        })
    }
}

fn replace_file(tmp: &Path, dest: &Path) -> Result<()> {
    match fs::rename(tmp, dest) {
        Ok(()) => Ok(()),
        Err(_) => {
            // On Windows, fs::rename may fail if destination exists on some filesystems.
            fs::copy(tmp, dest)?;
            let _ = fs::remove_file(tmp);
            Ok(())
        }
    }
}

fn pick_newest_slot(container: &PbzsContainer) -> Option<String> {
    container
        .slots
        .iter()
        .filter(|s| s.json.is_some() && !s.name.starts_with("__"))
        .max_by(|a, b| {
            let ta = a
                .json
                .as_ref()
                .and_then(|j| j.get("PBZGameSystem"))
                .and_then(|g| g.get("DateTimeString"))
                .and_then(Value::as_str)
                .unwrap_or("");
            let tb = b
                .json
                .as_ref()
                .and_then(|j| j.get("PBZGameSystem"))
                .and_then(|g| g.get("DateTimeString"))
                .and_then(Value::as_str)
                .unwrap_or("");
            ta.cmp(tb).then_with(|| a.name.cmp(&b.name))
        })
        .map(|s| s.name.clone())
        .or_else(|| {
            container
                .slots
                .iter()
                .find(|s| s.json.is_some())
                .map(|s| s.name.clone())
        })
}
