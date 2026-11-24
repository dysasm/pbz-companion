# PBZ Companion — Phantom Blade Zero

A local, offline desktop companion and save editor for **Phantom Blade Zero**, built with **Tauri 2**, **Rust**, **React 19**, **Tailwind CSS v4**, and **shadcn/ui**.

## Features

- **Native PBZS v3 Save Engine (`crates/core`)**: Decrypts AES-256-GCM containers and decompresses Oodle Kraken slots natively in pure Rust (`unsafe_code = "forbid"`). Edits are staged in memory and written back using lossless JSON-text patching + Oodle stored blocks (`0xCC 0x06`), preserving every untouched slot byte-for-byte.
- **Automatic Save Discovery**: Scans your Phantom Blade Zero Steam `SaveGames` folder (live saves, user copies, and rolling `1RealTime` / `2Hourly` / `3Daily` backups) and picks the most recent slot automatically.
- **Interactive World Map**: Pan and zoom across all 8 region ink paintings (including Normal / Winter toggle for Crimson Forest) with exact anchor-mesh positions, real in-game ink icons, layer toggles, and click-to-inspect markers.
- **Exact Map Completion**: Mirrors the game's `MapItemCompletion.js` rules across Bells, Weapons & Phantom Edges, Accessories & Medicine, Challenge Areas (Human-Faced Banyan, Lóng Pillar, Scarecrow), Sha-Chi Amber, Blackstone, and Memory Flowers—with one-click fixes for glitched collectibles.
- **Missables & Points of No Return**: Chapter timeline of all 7 points of no return (`passed` / `ahead`) and every missable quest step (`done` / `ready` / `still possible` / `missed`), with one-click story-flag and reward fixes.
- **Quest Log**: All 63 quests read directly from `Narrative.NarrativeSavedQuests` with branch history, task tag counters, and region/start-time sorting.
- **Typed Save Editor**:
  - **Overview & Resources**: Edit Dust, Spirit Shadow, Remaining Days, Difficulty, and Nightmare unlock.
  - **Weapons & Phantom Edges**: Edit levels, toggle Snap Soul, or unlock missing blades.
  - **Accessories & Medicine**: Edit levels, max charges, or unlock missing gear.
  - **Inventory**: Search and edit quantities across all catalog and save-only items.
  - **Story Flags & Raw JSON**: Add/remove `EventPipeline.GlobalTags` and inspect any top-level save section.
- **Safe Writes**: Never writes until you press **Save** (`Ctrl+S`), refuses to overwrite if the save changed on disk since opening, verifies every slot after re-sealing, and keeps a timestamped `.bak` copy beside the original.

## Development

### Requirements

- Node.js 22+
- Rust 1.99+ (with `cargo` and `clippy`)
- Tauri v2 prerequisites for your platform (WebView2 on Windows)

### Commands

```bash
npm install
npm run desktop        # launch Tauri dev window
npm run desktop:build  # build Windows NSIS installer, MSI, and binary
npm run check          # Biome lint, TypeScript, Vitest, Vite build, cargo fmt/clippy/test
```

### Testing against a real save

```bash
PBZ_SAVE="C:\Program Files (x86)\Steam\steamapps\common\PBZ\ProjectPBZ\Saved\SaveGames\Steam\<id>\PBZSaveGame.sav" \
  cargo test -p pbz-core --test roundtrip -- --ignored --nocapture
```

The test copies the save to a temporary folder first and never touches your original file.

## Repository Layout

| Path                     | Purpose                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `crates/core`            | Pure Rust PBZS crypto/Oodle engine, lossless JSON patcher, save discovery, backups, game rules, and typed mutations. |
| `apps/desktop/src-tauri` | Tauri 2 commands, persistent settings, close guard, and window lifecycle.                                            |
| `apps/desktop/src`       | React 19 + TypeScript + Tailwind v4 + shadcn/ui frontend and Zustand store.                                          |
