use pbz_core::catalog::Catalog;
use pbz_core::domain;
use pbz_core::save::SaveSession;
use std::path::PathBuf;

#[test]
#[ignore = "Runs against a real PBZSaveGame.sav copied to a temp folder"]
fn real_save_full_roundtrip() {
    let src = std::env::var("PBZ_SAVE")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            PathBuf::from(r"C:\Users\Gary\Desktop\PBZ-COMPANION\PBZ-Map-Companion\PBZSaveGame.sav")
        });
    assert!(src.exists(), "Real save not found at {}", src.display());

    let assets_dir = std::env::var("APPDATA")
        .map(|a| {
            PathBuf::from(a)
                .join("io.github.dysasm.pbz-companion")
                .join("game-assets")
        })
        .unwrap_or_else(|_| PathBuf::from("game-assets"));
    let cat = Catalog::load_from_dir(&assets_dir);
    assert!(
        cat.status.ready,
        "Expected local game-assets cache at {}",
        assets_dir.display()
    );

    let tmp_dir = std::env::temp_dir().join(format!("pbz-companion-test-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&tmp_dir);
    std::fs::create_dir_all(&tmp_dir).unwrap();
    let copy_path = tmp_dir.join("PBZSaveGame.sav");
    std::fs::copy(&src, &copy_path).unwrap();

    let mut session = SaveSession::open(&copy_path).unwrap();
    let meta = session.metadata();
    assert!(meta.slots.len() >= 10, "Expected multiple slots");
    println!(
        "Opened {} with {} slots; active={}",
        meta.file_name,
        meta.slots.len(),
        meta.active_slot
    );

    let ov = domain::get_overview(&session, &cat).unwrap();
    println!(
        "Overview: overall={}% ({}/{}), dust={}, spirit_shadow={}, quests={}/{}",
        ov.overall_percent,
        ov.overall_collected,
        ov.overall_total,
        ov.dust,
        ov.spirit_shadow,
        ov.counts.quests_done,
        ov.counts.quests_total
    );
    assert!(ov.overall_total > 400);

    let world = domain::get_completion_world(&session, &cat).unwrap();
    assert_eq!(world.regions.len(), 8);
    assert!(!world.entries.is_empty());

    let miss = domain::get_missables(&session, &cat).unwrap();
    assert!(miss.points_of_no_return.len() >= 7);

    let weapons = domain::get_weapons(&session, &cat).unwrap();
    assert!(weapons.len() >= 40);

    // Mutate Dust, add a test tag, write back, and verify reopening + backup creation
    let next_dust = ov.dust.saturating_add(123);
    domain::set_player_resource(&mut session, "Dust", next_dust).unwrap();
    domain::add_global_tag(&mut session, "pbz.companion.roundtrip.test").unwrap();
    assert!(session.is_dirty());

    let report = session.write().unwrap();
    assert!(report.backup_path.is_some());
    assert!(!session.is_dirty());

    let reopened = SaveSession::open(&copy_path).unwrap();
    let ov2 = domain::get_overview(&reopened, &cat).unwrap();
    assert_eq!(ov2.dust, next_dust);
    let raw2 = domain::get_raw_overview(&reopened).unwrap();
    assert!(
        raw2.global_tags
            .contains(&"pbz.companion.roundtrip.test".to_string())
    );

    let _ = std::fs::remove_dir_all(&tmp_dir);
}
