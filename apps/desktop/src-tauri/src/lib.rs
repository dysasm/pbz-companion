mod settings;

use pbz_core::catalog::{AssetStatus, Catalog};
use pbz_core::domain::{
    self, CompletionWorldView, GearEntryView, InventoryEntryView, MissablesView, OverviewView,
    QuestsView, RawOverviewView, WeaponEntryView,
};
use pbz_core::save::{SaveMetadata, SaveSession, ScanResult, WriteReport, discover_saves};
use serde::Serialize;
use serde_json::Value;
use settings::{AppSettings, load_settings, save_settings};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

struct AppState {
    session: Mutex<Option<SaveSession>>,
    catalog: RwLock<Arc<Catalog>>,
    settings: Mutex<AppSettings>,
    config_dir: PathBuf,
    assets_dir: PathBuf,
    close_approved: AtomicBool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: String,
    catalog_items: usize,
    map_entries: usize,
    quests: usize,
    missables: usize,
    regions: usize,
    assets: AssetStatus,
}

impl AppState {
    fn catalog_snapshot(&self) -> Result<Arc<Catalog>, String> {
        self.catalog
            .read()
            .map(|g| Arc::clone(&g))
            .map_err(|_| "Catalog lock poisoned".to_string())
    }

    fn reload_catalog(&self) -> Result<AssetStatus, String> {
        let loaded = Arc::new(Catalog::load_from_dir(&self.assets_dir));
        let status = loaded.status.clone();
        let mut guard = self
            .catalog
            .write()
            .map_err(|_| "Catalog lock poisoned".to_string())?;
        *guard = loaded;
        Ok(status)
    }
}

fn with_session<T, F>(state: &State<'_, AppState>, f: F) -> Result<T, String>
where
    F: FnOnce(&SaveSession, &Catalog) -> pbz_core::Result<T>,
{
    let cat = state.catalog_snapshot()?;
    let guard = state
        .session
        .lock()
        .map_err(|_| "Session lock poisoned".to_string())?;
    let session = guard
        .as_ref()
        .ok_or_else(|| "No save file is currently open.".to_string())?;
    f(session, &cat).map_err(|e| e.to_string())
}

fn with_session_mut<T, F>(state: &State<'_, AppState>, f: F) -> Result<T, String>
where
    F: FnOnce(&mut SaveSession, &Catalog) -> pbz_core::Result<T>,
{
    let cat = state.catalog_snapshot()?;
    let mut guard = state
        .session
        .lock()
        .map_err(|_| "Session lock poisoned".to_string())?;
    let session = guard
        .as_mut()
        .ok_or_else(|| "No save file is currently open.".to_string())?;
    f(session, &cat).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_app_info(state: State<'_, AppState>) -> Result<AppInfo, String> {
    let cat = state.catalog_snapshot()?;
    Ok(AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        catalog_items: cat.items.len(),
        map_entries: cat.gamedata.entries.len(),
        quests: cat.quests.quests.len(),
        missables: cat.missables.missables.len(),
        regions: cat.gamedata.regions.len(),
        assets: cat.status.clone(),
    })
}

#[tauri::command]
fn get_asset_status(state: State<'_, AppState>) -> Result<AssetStatus, String> {
    Ok(state.catalog_snapshot()?.status.clone())
}

#[tauri::command]
fn reload_assets(state: State<'_, AppState>) -> Result<AssetStatus, String> {
    state.reload_catalog()
}

/// Extract game data, icons, and region paintings from the user's own Phantom Blade Zero install
/// into the local `game-assets` cache directory (never shipped in the repository).
#[tauri::command]
fn extract_game_assets(
    state: State<'_, AppState>,
    game_dir: Option<String>,
) -> Result<AssetStatus, String> {
    let resolved_game = match game_dir {
        Some(g) if !g.trim().is_empty() => {
            let mut s = state
                .settings
                .lock()
                .map_err(|_| "Settings lock poisoned".to_string())?;
            s.game_dir = Some(g.clone());
            let _ = save_settings(&state.config_dir, &s);
            g
        }
        _ => state
            .settings
            .lock()
            .map_err(|_| "Settings lock poisoned".to_string())?
            .game_dir
            .clone()
            .ok_or_else(|| "Set your Phantom Blade Zero installation folder first.".to_string())?,
    };

    let utoc = Path::new(&resolved_game)
        .join("ProjectPBZ")
        .join("Content")
        .join("Paks")
        .join("ProjectPBZ-Windows.utoc");
    if !utoc.exists() {
        return Err(format!(
            "Could not find ProjectPBZ-Windows.utoc inside {resolved_game}. Pick the PBZ folder containing ProjectPBZ."
        ));
    }

    let script = find_extractor_script()
        .ok_or_else(|| "Could not find scripts/extract_assets.py next to the app.".to_string())?;

    let output = Command::new("python")
        .arg(&script)
        .arg("--game")
        .arg(&resolved_game)
        .arg("--out")
        .arg(&state.assets_dir)
        .output()
        .map_err(|e| format!("Failed to launch python extractor: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "Asset extraction failed ({}):\n{}\n{}",
            output.status,
            stderr.trim(),
            stdout.trim()
        ));
    }

    state.reload_catalog()
}

fn find_extractor_script() -> Option<PathBuf> {
    let candidates = [
        std::env::current_dir()
            .ok()
            .map(|d| d.join("scripts").join("extract_assets.py")),
        std::env::current_dir().ok().and_then(|d| {
            d.parent()
                .map(|p| p.join("scripts").join("extract_assets.py"))
        }),
        std::env::current_dir().ok().and_then(|d| {
            d.parent()
                .and_then(Path::parent)
                .map(|p| p.join("scripts").join("extract_assets.py"))
        }),
        std::env::current_exe().ok().and_then(|e| {
            e.parent()
                .map(|p| p.join("scripts").join("extract_assets.py"))
        }),
    ];
    candidates.into_iter().flatten().find(|p| p.exists())
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let guard = state
        .settings
        .lock()
        .map_err(|_| "Settings lock poisoned".to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
fn update_settings(state: State<'_, AppState>, patch: Value) -> Result<AppSettings, String> {
    let mut guard = state
        .settings
        .lock()
        .map_err(|_| "Settings lock poisoned".to_string())?;
    if let Some(theme) = patch.get("theme").and_then(Value::as_str) {
        guard.theme = theme.to_string();
    }
    if let Some(v) = patch.get("gameDir") {
        guard.game_dir = v.as_str().map(String::from);
    }
    if let Some(v) = patch.get("lastFolder") {
        guard.last_folder = v.as_str().map(String::from);
    }
    if let Some(v) = patch.get("compactRows").and_then(Value::as_bool) {
        guard.compact_rows = v;
    }
    if let Some(v) = patch.get("showInternalIds").and_then(Value::as_bool) {
        guard.show_internal_ids = v;
    }
    save_settings(&state.config_dir, &guard)?;
    Ok(guard.clone())
}

#[tauri::command]
fn scan_saves(
    state: State<'_, AppState>,
    extra_folder: Option<String>,
) -> Result<ScanResult, String> {
    let settings = state
        .settings
        .lock()
        .map_err(|_| "Settings lock poisoned".to_string())?
        .clone();
    let game_dir = settings.game_dir.as_deref().map(PathBuf::from);
    let mut extras = Vec::new();
    if let Some(f) = settings.last_folder {
        extras.push(PathBuf::from(f));
    }
    if let Some(f) = extra_folder {
        extras.push(PathBuf::from(f));
    }
    Ok(discover_saves(game_dir.as_deref(), &extras))
}

#[tauri::command]
fn open_save(state: State<'_, AppState>, path: String) -> Result<SaveMetadata, String> {
    let session = SaveSession::open(&path).map_err(|e| e.to_string())?;
    let meta = session.metadata();
    let mut guard = state
        .session
        .lock()
        .map_err(|_| "Session lock poisoned".to_string())?;
    *guard = Some(session);
    Ok(meta)
}

#[tauri::command]
fn close_save(state: State<'_, AppState>) -> Result<(), String> {
    let mut guard = state
        .session
        .lock()
        .map_err(|_| "Session lock poisoned".to_string())?;
    *guard = None;
    Ok(())
}

#[tauri::command]
fn select_slot(state: State<'_, AppState>, slot_name: String) -> Result<SaveMetadata, String> {
    with_session_mut(&state, |s, _| {
        s.set_active_slot(&slot_name)?;
        Ok(s.metadata())
    })
}

#[tauri::command]
fn get_save_metadata(state: State<'_, AppState>) -> Result<SaveMetadata, String> {
    with_session(&state, |s, _| Ok(s.metadata()))
}

#[tauri::command]
fn discard_changes(state: State<'_, AppState>) -> Result<SaveMetadata, String> {
    with_session_mut(&state, |s, _| {
        s.discard();
        Ok(s.metadata())
    })
}

#[tauri::command]
fn create_backup(state: State<'_, AppState>) -> Result<String, String> {
    with_session_mut(&state, |s, _| {
        let p = s.create_backup()?;
        Ok(p.to_string_lossy().to_string())
    })
}

#[tauri::command]
fn write_save(state: State<'_, AppState>) -> Result<WriteReport, String> {
    with_session_mut(&state, |s, _| s.write())
}

#[tauri::command]
fn get_overview(state: State<'_, AppState>) -> Result<OverviewView, String> {
    with_session(&state, domain::get_overview)
}

#[tauri::command]
fn get_completion_world(state: State<'_, AppState>) -> Result<CompletionWorldView, String> {
    with_session(&state, domain::get_completion_world)
}

#[tauri::command]
fn get_missables(state: State<'_, AppState>) -> Result<MissablesView, String> {
    with_session(&state, domain::get_missables)
}

#[tauri::command]
fn get_quests(state: State<'_, AppState>) -> Result<QuestsView, String> {
    with_session(&state, domain::get_quests)
}

#[tauri::command]
fn get_weapons(state: State<'_, AppState>) -> Result<Vec<WeaponEntryView>, String> {
    with_session(&state, domain::get_weapons)
}

#[tauri::command]
fn get_gear(state: State<'_, AppState>) -> Result<Vec<GearEntryView>, String> {
    with_session(&state, domain::get_gear)
}

#[tauri::command]
fn get_inventory(state: State<'_, AppState>) -> Result<Vec<InventoryEntryView>, String> {
    with_session(&state, domain::get_inventory)
}

#[tauri::command]
fn get_raw_overview(state: State<'_, AppState>) -> Result<RawOverviewView, String> {
    with_session(&state, |s, _| domain::get_raw_overview(s))
}

#[tauri::command]
fn get_raw_section(state: State<'_, AppState>, section: String) -> Result<String, String> {
    with_session(&state, |s, _| domain::get_raw_section(s, &section))
}

#[tauri::command]
fn set_player_resource(
    state: State<'_, AppState>,
    field: String,
    value: i64,
) -> Result<SaveMetadata, String> {
    with_session_mut(&state, |s, _| {
        domain::set_player_resource(s, &field, value)?;
        Ok(s.metadata())
    })
}

#[tauri::command]
fn set_game_option(
    state: State<'_, AppState>,
    field: String,
    value: Value,
) -> Result<SaveMetadata, String> {
    with_session_mut(&state, |s, _| {
        domain::set_game_option(s, &field, value)?;
        Ok(s.metadata())
    })
}

#[tauri::command]
fn mark_completion_entries(
    state: State<'_, AppState>,
    keys: Vec<String>,
) -> Result<SaveMetadata, String> {
    with_session_mut(&state, |s, cat| {
        domain::mark_completion_entries(s, cat, &keys)?;
        Ok(s.metadata())
    })
}

#[tauri::command]
fn apply_missable_fix(
    state: State<'_, AppState>,
    missable_id: String,
) -> Result<SaveMetadata, String> {
    with_session_mut(&state, |s, cat| {
        domain::apply_missable_fix(s, cat, &missable_id)?;
        Ok(s.metadata())
    })
}

#[tauri::command]
fn update_weapon(
    state: State<'_, AppState>,
    id: String,
    kind: String,
    level: i64,
    snap_soul: bool,
) -> Result<SaveMetadata, String> {
    with_session_mut(&state, |s, _| {
        domain::update_weapon(s, &id, &kind, level, snap_soul)?;
        Ok(s.metadata())
    })
}

#[tauri::command]
fn update_gear(
    state: State<'_, AppState>,
    id: String,
    kind: String,
    level: i64,
    max_charges: Option<i64>,
) -> Result<SaveMetadata, String> {
    with_session_mut(&state, |s, _| {
        domain::update_gear(s, &id, &kind, level, max_charges)?;
        Ok(s.metadata())
    })
}

#[tauri::command]
fn set_inventory_amount(
    state: State<'_, AppState>,
    id: String,
    amount: i64,
) -> Result<SaveMetadata, String> {
    with_session_mut(&state, |s, _| {
        domain::set_inventory_amount(s, &id, amount)?;
        Ok(s.metadata())
    })
}

#[tauri::command]
fn add_global_tag(state: State<'_, AppState>, tag: String) -> Result<SaveMetadata, String> {
    with_session_mut(&state, |s, _| {
        domain::add_global_tag(s, &tag)?;
        Ok(s.metadata())
    })
}

#[tauri::command]
fn remove_global_tag(state: State<'_, AppState>, tag: String) -> Result<SaveMetadata, String> {
    with_session_mut(&state, |s, _| {
        domain::remove_global_tag(s, &tag)?;
        Ok(s.metadata())
    })
}

#[tauri::command]
fn close_window(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.close_approved.store(true, Ordering::SeqCst);
    if let Some(window) = app.get_webview_window("main") {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn serve_local_asset(assets_dir: &Path, uri_path: &str) -> tauri::http::Response<Vec<u8>> {
    let trimmed = uri_path.trim_start_matches('/');
    let rel = Path::new(trimmed);
    // Reject any path traversal attempts
    let safe = !trimmed.is_empty() && rel.components().all(|c| matches!(c, Component::Normal(_)));
    if !safe {
        return tauri::http::Response::builder()
            .status(403)
            .body(Vec::new())
            .expect("valid 403 response");
    }

    let full = assets_dir.join(rel);
    let Ok(bytes) = fs::read(&full) else {
        return tauri::http::Response::builder()
            .status(404)
            .body(Vec::new())
            .expect("valid 404 response");
    };

    let mime = match full.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "webp" => "image/webp",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "json" => "application/json",
        _ => "application/octet-stream",
    };

    tauri::http::Response::builder()
        .status(200)
        .header("Content-Type", mime)
        .header("Cache-Control", "public, max-age=3600")
        .body(bytes)
        .expect("valid asset response")
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .register_uri_scheme_protocol("pbzasset", |ctx, request| {
            let assets_dir = ctx
                .app_handle()
                .try_state::<AppState>()
                .map(|s| s.assets_dir.clone())
                .unwrap_or_else(|| PathBuf::from("game-assets"));
            serve_local_asset(&assets_dir, request.uri().path())
        })
        .setup(|app| {
            let config_dir = app
                .path()
                .app_config_dir()
                .unwrap_or_else(|_| PathBuf::from("."));
            let assets_dir = config_dir.join("game-assets");
            let loaded_settings = load_settings(&config_dir);
            let loaded_catalog = Arc::new(Catalog::load_from_dir(&assets_dir));
            app.manage(AppState {
                session: Mutex::new(None),
                catalog: RwLock::new(loaded_catalog),
                settings: Mutex::new(loaded_settings),
                config_dir,
                assets_dir,
                close_approved: AtomicBool::new(false),
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                if state.close_approved.load(Ordering::SeqCst) {
                    return;
                }
                let dirty = state
                    .session
                    .lock()
                    .ok()
                    .and_then(|g| g.as_ref().map(SaveSession::is_dirty))
                    .unwrap_or(false);
                if dirty {
                    api.prevent_close();
                    let _ = window.emit("window-close-requested", true);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            get_asset_status,
            reload_assets,
            extract_game_assets,
            get_settings,
            update_settings,
            scan_saves,
            open_save,
            close_save,
            select_slot,
            get_save_metadata,
            discard_changes,
            create_backup,
            write_save,
            get_overview,
            get_completion_world,
            get_missables,
            get_quests,
            get_weapons,
            get_gear,
            get_inventory,
            get_raw_overview,
            get_raw_section,
            set_player_resource,
            set_game_option,
            mark_completion_entries,
            apply_missable_fix,
            update_weapon,
            update_gear,
            set_inventory_amount,
            add_global_tag,
            remove_global_tag,
            close_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running PBZ Companion");
}
