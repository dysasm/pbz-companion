use pbz_core::save::default_game_install_dir;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
    pub game_dir: Option<String>,
    #[serde(default)]
    pub last_folder: Option<String>,
    #[serde(default)]
    pub compact_rows: bool,
    #[serde(default)]
    pub show_internal_ids: bool,
}

fn default_theme() -> String {
    "dark".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            game_dir: default_game_install_dir().map(|p| p.to_string_lossy().to_string()),
            last_folder: None,
            compact_rows: false,
            show_internal_ids: false,
        }
    }
}

pub fn load_settings(dir: &Path) -> AppSettings {
    let path = dir.join("settings.json");
    let mut s = fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str::<AppSettings>(&raw).ok())
        .unwrap_or_default();
    if s.game_dir.is_none() {
        s.game_dir = default_game_install_dir().map(|p| p.to_string_lossy().to_string());
    }
    s
}

pub fn save_settings(dir: &Path, settings: &AppSettings) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let path: PathBuf = dir.join("settings.json");
    let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}
