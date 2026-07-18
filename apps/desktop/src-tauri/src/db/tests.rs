//! Cross-module index tests: most exercise the write path and the query bridge
//! together against a migrated in-memory database, the same shape the commands
//! compose at runtime.

use dayjot_index_schema::LATEST_SCHEMA_VERSION;
use rusqlite::Connection;
use serde_json::Value;

use super::migrations::{migrate, migrate_to, open_in_memory, open_index_at, validate_migrations};
use super::query::run_query;
use super::scan::scan_reconcile;
use super::write::{
    apply_note, clear_index, move_note, touch_note, IndexedAlias, IndexedEmail, IndexedLink,
    IndexedNote, IndexedTag, IndexedTask,
};

fn migrated() -> Connection {
    // Registers sqlite-vec before migrating — the 0002 migration creates a
    // vec0 table, so a raw rusqlite open would fail with "no such module".
    let mut conn = open_in_memory().expect("open");
    conn.execute_batch("PRAGMA foreign_keys=ON;").expect("fk");
    migrate(&mut conn).expect("migrate");
    conn
}

fn note(path: &str, title: &str, links: Vec<IndexedLink>) -> IndexedNote {
    IndexedNote {
        path: path.to_string(),
        id: None,
        title: title.to_string(),
        title_key: title.to_lowercase(),
        kind: "note".to_string(),
        daily_date: None,
        is_private: false,
        is_pinned: false,
        pinned_order: None,
        has_conflict: false,
        gist_url: None,
        gist_stale: false,
        file_hash: "h".to_string(),
        mtime: 0,
        text: format!("{title} body"),
        asset_text: String::new(),
        preview: "body".to_string(),
        links,
        tags: vec![],
        aliases: vec![],
        emails: vec![],
        assets: vec![],
        tasks: vec![],
    }
}

fn wiki(target: &str) -> IndexedLink {
    IndexedLink {
        kind: "wiki".to_string(),
        target_raw: target.to_string(),
        target_key: target.to_lowercase(),
        alias: None,
        pos_from: 0,
        pos_to: 0,
    }
}

fn aliased_note(path: &str, title: &str, alias: &str) -> IndexedNote {
    let mut indexed = note(path, title, vec![]);
    indexed.aliases = vec![IndexedAlias {
        alias: alias.to_string(),
        alias_key: alias.to_lowercase(),
    }];
    indexed
}

fn daily_note(path: &str, date: &str) -> IndexedNote {
    let mut indexed = note(path, date, vec![]);
    indexed.kind = "daily".to_string();
    indexed.daily_date = Some(date.to_string());
    indexed
}

fn task(marker_offset: i64, text: &str, checked: bool) -> IndexedTask {
    IndexedTask {
        marker_offset,
        text: text.to_string(),
        raw: format!("[{}] {text}", if checked { "x" } else { " " }),
        breadcrumbs: vec![],
        checked,
        due_date: None,
    }
}

#[test]
fn migrations_are_valid_and_idempotent() {
    // Guards every migration's SQL (rusqlite_migration validates the set).
    validate_migrations().expect("migration set is valid");
    let mut conn = migrated();
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, LATEST_SCHEMA_VERSION as i64);
    migrate(&mut conn).expect("re-running to_latest is a no-op");
}

#[test]
fn tag_search_indexes_are_created() {
    let conn = migrated();
    let has_tags_index: bool = conn
        .prepare("SELECT 1 FROM pragma_index_list('tags') WHERE name = ?1")
        .unwrap()
        .exists(["tags_tag_key_note_path"])
        .unwrap();
    assert!(has_tags_index);

    let has_notes_index: bool = conn
        .prepare("SELECT 1 FROM pragma_index_list('notes') WHERE name = ?1")
        .unwrap()
        .exists(["notes_daily_date_mtime_path"])
        .unwrap();
    assert!(has_notes_index);

    let tag_columns: Vec<(String, i64)> = conn
        .prepare(
            "SELECT name, seqno FROM pragma_index_xinfo('tags_tag_key_note_path')
             WHERE key = 1 ORDER BY seqno",
        )
        .unwrap()
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    assert_eq!(
        tag_columns,
        vec![("tag_key".to_string(), 0), ("note_path".to_string(), 1)]
    );

    let notes_columns: Vec<(String, i64, i64)> = conn
        .prepare(
            "SELECT name, seqno, \"desc\" FROM pragma_index_xinfo('notes_daily_date_mtime_path')
             WHERE key = 1 ORDER BY seqno",
        )
        .unwrap()
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    assert_eq!(
        notes_columns,
        vec![
            ("daily_date".to_string(), 0, 0),
            ("mtime".to_string(), 1, 1),
            ("path".to_string(), 2, 0),
        ]
    );
}

#[test]
fn preview_and_tag_keys_round_trip() {
    let conn = migrated();
    let mut tagged = note("notes/a.md", "A", vec![]);
    tagged.preview = "first body line".to_string();
    tagged.tags = vec![IndexedTag {
        tag: "Café".to_string(),
        tag_key: "café".to_string(),
    }];
    apply_note(&conn, &tagged).unwrap();

    let notes = run_query(&conn, "SELECT preview FROM notes", &[]).unwrap();
    assert_eq!(notes[0]["preview"], Value::from("first body line"));

    // Display casing and the TS-folded key are stored side by side — matching
    // happens on tag_key (SQLite's lower() couldn't fold the É).
    let tags = run_query(&conn, "SELECT tag, tag_key FROM tags", &[]).unwrap();
    assert_eq!(tags[0]["tag"], Value::from("Café"));
    assert_eq!(tags[0]["tag_key"], Value::from("café"));
}

#[test]
fn note_emails_apply_move_and_cascade() {
    let conn = migrated();
    let mut person = note("notes/jane-doe.md", "Jane Doe", vec![]);
    person.emails = vec![IndexedEmail {
        email: "Jane@Corp.com".to_string(),
        email_key: "jane@corp.com".to_string(),
    }];
    apply_note(&conn, &person).unwrap();

    // Display casing and the folded match key are stored side by side, like tags.
    let rows = run_query(
        &conn,
        "SELECT note_path, email, email_key FROM note_emails",
        &[],
    )
    .unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["email"], Value::from("Jane@Corp.com"));
    assert_eq!(rows[0]["email_key"], Value::from("jane@corp.com"));

    // A rename carries the rows to the new path (inside the same deferred-FK
    // transaction the command layer would open).
    conn.execute_batch("BEGIN; PRAGMA defer_foreign_keys = ON;")
        .unwrap();
    move_note(&conn, "notes/jane-doe.md", "notes/jane.md").unwrap();
    conn.execute_batch("COMMIT;").unwrap();
    let moved = run_query(&conn, "SELECT note_path FROM note_emails", &[]).unwrap();
    assert_eq!(moved[0]["note_path"], Value::from("notes/jane.md"));

    // Re-applying with no emails replaces the rows rather than accreting.
    let mut renamed = note("notes/jane.md", "Jane Doe", vec![]);
    renamed.emails = vec![];
    apply_note(&conn, &renamed).unwrap();
    let cleared = run_query(&conn, "SELECT note_path FROM note_emails", &[]).unwrap();
    assert!(cleared.is_empty());
}

#[test]
fn backlinks_resolve_by_title_at_query_time() {
    let conn = migrated();
    // Source links to "Target" before the target note even exists.
    apply_note(&conn, &note("notes/a.md", "A", vec![wiki("Target")])).unwrap();
    let none = run_query(
        &conn,
        "SELECT source_path FROM backlinks WHERE target_path = ?1",
        &[Value::from("notes/target.md")],
    )
    .unwrap();
    assert!(none.is_empty());

    // Creating the target immediately resolves the inbound link (join, no reindex).
    apply_note(&conn, &note("notes/target.md", "Target", vec![])).unwrap();
    let rows = run_query(
        &conn,
        "SELECT source_path FROM backlinks WHERE target_path = ?1",
        &[Value::from("notes/target.md")],
    )
    .unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["source_path"], Value::from("notes/a.md"));
}

#[test]
fn backlinks_resolve_by_alias_when_the_key_has_no_stronger_claimant() {
    let conn = migrated();
    apply_note(
        &conn,
        &aliased_note("notes/tim-maccaw-dad.md", "Tim MacCaw // Dad", "Dad"),
    )
    .unwrap();
    apply_note(&conn, &note("notes/source.md", "Source", vec![wiki("Dad")])).unwrap();

    let rows = run_query(
        &conn,
        "SELECT target_path FROM backlinks WHERE source_path = 'notes/source.md'",
        &[],
    )
    .unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(
        rows[0]["target_path"],
        Value::from("notes/tim-maccaw-dad.md")
    );
}

#[test]
fn backlink_resolution_uses_daily_then_title_then_alias_precedence() {
    let conn = migrated();
    apply_note(
        &conn,
        &aliased_note("notes/aliased-date.md", "Release Day", "2026-07-10"),
    )
    .unwrap();
    apply_note(&conn, &note("notes/titled-date.md", "2026-07-10", vec![])).unwrap();
    apply_note(&conn, &daily_note("daily/2026-07-10.md", "2026-07-10")).unwrap();
    apply_note(
        &conn,
        &note(
            "notes/date-source.md",
            "Date Source",
            vec![wiki("2026-07-10")],
        ),
    )
    .unwrap();

    apply_note(
        &conn,
        &aliased_note("notes/tim-maccaw-dad.md", "Tim MacCaw // Dad", "Dad"),
    )
    .unwrap();
    apply_note(&conn, &note("notes/dad.md", "Dad", vec![])).unwrap();
    apply_note(
        &conn,
        &note("notes/dad-source.md", "Dad Source", vec![wiki("Dad")]),
    )
    .unwrap();

    let rows = run_query(
        &conn,
        "SELECT source_path, target_path FROM backlinks ORDER BY source_path",
        &[],
    )
    .unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0]["source_path"], Value::from("notes/dad-source.md"));
    assert_eq!(rows[0]["target_path"], Value::from("notes/dad.md"));
    assert_eq!(rows[1]["source_path"], Value::from("notes/date-source.md"));
    assert_eq!(rows[1]["target_path"], Value::from("daily/2026-07-10.md"));
}

#[test]
fn note_key_precedence_migration_preserves_existing_projection_rows() {
    let mut conn = open_in_memory().expect("open");
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    migrate_to(&mut conn, 17).expect("stage v17");

    apply_note(
        &conn,
        &aliased_note("notes/tim-maccaw-dad.md", "Tim MacCaw // Dad", "Dad"),
    )
    .unwrap();
    apply_note(&conn, &note("notes/dad.md", "Dad", vec![])).unwrap();
    apply_note(&conn, &note("notes/source.md", "Source", vec![wiki("Dad")])).unwrap();

    let counts_before: Vec<i64> = ["notes", "links", "aliases"]
        .iter()
        .map(|table| {
            conn.query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .unwrap()
        })
        .collect();

    migrate(&mut conn).expect("migrate to v18");

    let counts_after: Vec<i64> = ["notes", "links", "aliases"]
        .iter()
        .map(|table| {
            conn.query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .unwrap()
        })
        .collect();
    assert_eq!(counts_after, counts_before);

    let rows = run_query(
        &conn,
        "SELECT target_path FROM backlinks WHERE source_path = 'notes/source.md'",
        &[],
    )
    .unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["target_path"], Value::from("notes/dad.md"));
}

#[test]
fn alias_collisions_choose_the_first_path_for_backlinks() {
    let conn = migrated();
    apply_note(&conn, &aliased_note("notes/zeta.md", "Zeta", "Shared Name")).unwrap();
    apply_note(
        &conn,
        &aliased_note("notes/alpha.md", "Alpha", "Shared Name"),
    )
    .unwrap();
    conn.execute(
        "INSERT INTO aliases(note_path, alias, alias_key) VALUES (?1, ?2, ?3)",
        ["notes/alpha.md", "SHARED NAME", "shared name"],
    )
    .unwrap();
    apply_note(
        &conn,
        &note("notes/source.md", "Source", vec![wiki("Shared Name")]),
    )
    .unwrap();

    let rows = run_query(
        &conn,
        "SELECT target_path FROM backlinks WHERE source_path = 'notes/source.md'",
        &[],
    )
    .unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["target_path"], Value::from("notes/alpha.md"));

    let keys = run_query(
        &conn,
        "SELECT note_path, claim_count FROM note_keys WHERE key = 'shared name'",
        &[],
    )
    .unwrap();
    assert_eq!(keys.len(), 1);
    assert_eq!(keys[0]["note_path"], Value::from("notes/alpha.md"));
    assert_eq!(keys[0]["claim_count"], Value::from(2));

    conn.execute("DELETE FROM notes WHERE path = ?1", ["notes/alpha.md"])
        .unwrap();
    let fallback = run_query(
        &conn,
        "SELECT target_path FROM backlinks WHERE source_path = 'notes/source.md'",
        &[],
    )
    .unwrap();
    assert_eq!(fallback.len(), 1);
    assert_eq!(fallback[0]["target_path"], Value::from("notes/zeta.md"));
    let fallback_key = run_query(
        &conn,
        "SELECT note_path, claim_count FROM note_keys WHERE key = 'shared name'",
        &[],
    )
    .unwrap();
    assert_eq!(fallback_key[0]["note_path"], Value::from("notes/zeta.md"));
    assert_eq!(fallback_key[0]["claim_count"], Value::from(1));
}

#[test]
fn templates_are_invisible_to_backlink_resolution() {
    let conn = migrated();
    let mut template = note("templates/journal.md", "Journal", vec![wiki("Target")]);
    template.kind = "template".to_string();
    apply_note(&conn, &template).unwrap();
    apply_note(&conn, &note("notes/target.md", "Target", vec![])).unwrap();
    apply_note(&conn, &note("notes/a.md", "A", vec![wiki("Journal")])).unwrap();

    // A note linking [[Journal]] must not resolve to the template's title…
    let to_template = run_query(
        &conn,
        "SELECT source_path FROM backlinks WHERE target_path = ?1",
        &[Value::from("templates/journal.md")],
    )
    .unwrap();
    assert!(to_template.is_empty());

    // …and the template's boilerplate [[Target]] link is not a graph edge.
    let from_template = run_query(
        &conn,
        "SELECT source_path FROM backlinks WHERE target_path = ?1",
        &[Value::from("notes/target.md")],
    )
    .unwrap();
    assert!(from_template.is_empty());
}

#[test]
fn asset_description_text_is_searchable_but_stays_out_of_preview_and_note_text() {
    let conn = migrated();
    // The note body says nothing about a waterfall; only the asset description
    // (folded into the FTS body, Plan 20) does.
    let mut sample = note("notes/a.md", "Trip", vec![]);
    sample.text = "Trip planning".to_string();
    sample.preview = "Trip planning".to_string();
    sample.asset_text = "A photo of a waterfall in a green canyon.".to_string();
    apply_note(&conn, &sample).unwrap();

    // A query that appears only in the asset description surfaces the note.
    let hits = run_query(
        &conn,
        "SELECT path FROM search_fts WHERE search_fts MATCH ?1",
        &[Value::from("waterfall")],
    )
    .unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0]["path"], Value::from("notes/a.md"));

    // The note body is still searchable alongside it.
    let body_hits = run_query(
        &conn,
        "SELECT path FROM search_fts WHERE search_fts MATCH ?1",
        &[Value::from("planning")],
    )
    .unwrap();
    assert_eq!(body_hits.len(), 1);

    // The asset text never leaks into the preview or the AI-reachable note_text.
    let preview: String = conn
        .query_row(
            "SELECT preview FROM notes WHERE path = 'notes/a.md'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!(
        !preview.contains("waterfall"),
        "preview must not carry asset text"
    );
    let note_body: String = conn
        .query_row(
            "SELECT text FROM note_text WHERE note_path = 'notes/a.md'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!(
        !note_body.contains("waterfall"),
        "note_text must not carry asset text"
    );
}

#[test]
fn pinned_migration_drops_stale_note_rows_for_reindex() {
    // Rows indexed before 0003 would keep is_pinned=0 even where the file
    // already says `pinned: true` (the open-time reconcile hash-skips
    // unchanged files) — the migration wipes the projection so the next open
    // re-indexes everything with the new column populated.
    let mut conn = open_in_memory().expect("open");
    migrate_to(&mut conn, 2).expect("migrate to v2");
    conn.execute_batch(
        "INSERT INTO notes(path, title, title_key, file_hash) VALUES('notes/a.md', 'A', 'a', 'h');
         INSERT INTO tags(note_path, tag) VALUES('notes/a.md', 'x');
         INSERT INTO search_fts(path, title, body) VALUES('notes/a.md', 'A', 'A body');
         INSERT INTO index_meta(key, value) VALUES('k', 'v');",
    )
    .expect("stage v2 rows");

    migrate(&mut conn).expect("migrate to latest");
    for table in ["notes", "tags", "search_fts"] {
        let count: i64 = conn
            .query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0, "{table} should be wiped for the re-index");
    }
    // Bookkeeping outlives the wipe (same contract as index_clear).
    let meta: i64 = conn
        .query_row("SELECT count(*) FROM index_meta", [], |row| row.get(0))
        .unwrap();
    assert_eq!(meta, 1);
}

#[test]
fn pinned_flag_and_order_round_trip_into_the_notes_row() {
    let conn = migrated();
    let mut pinned = note("notes/p.md", "P", vec![]);
    pinned.is_pinned = true;
    pinned.pinned_order = Some(1.5);
    apply_note(&conn, &pinned).unwrap();
    apply_note(&conn, &note("notes/q.md", "Q", vec![])).unwrap();
    let rows = run_query(
        &conn,
        "SELECT path, pinned_order FROM notes WHERE is_pinned = 1",
        &[],
    )
    .unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["path"], Value::from("notes/p.md"));
    assert_eq!(rows[0]["pinned_order"], Value::from(1.5));
}

#[test]
fn conflict_flag_round_trips_into_the_notes_row() {
    let conn = migrated();
    let mut conflicted = note("notes/c.md", "C", vec![]);
    conflicted.has_conflict = true;
    apply_note(&conn, &conflicted).unwrap();
    apply_note(&conn, &note("notes/clean.md", "Clean", vec![])).unwrap();
    let rows = run_query(&conn, "SELECT path FROM notes WHERE has_conflict = 1", &[]).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["path"], Value::from("notes/c.md"));

    // Re-indexing without markers clears the flag (resolution detection).
    apply_note(&conn, &note("notes/c.md", "C", vec![])).unwrap();
    let rows = run_query(&conn, "SELECT path FROM notes WHERE has_conflict = 1", &[]).unwrap();
    assert!(rows.is_empty());
}

#[test]
fn gist_columns_round_trip_into_the_notes_row() {
    let conn = migrated();
    let mut published = note("notes/g.md", "G", vec![]);
    published.gist_url = Some("https://gist.github.com/alex/abc123".to_string());
    published.gist_stale = true;
    apply_note(&conn, &published).unwrap();
    apply_note(&conn, &note("notes/plain.md", "Plain", vec![])).unwrap();
    let rows = run_query(
        &conn,
        "SELECT path, gist_url FROM notes WHERE gist_stale = 1",
        &[],
    )
    .unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["path"], Value::from("notes/g.md"));
    assert_eq!(
        rows[0]["gist_url"],
        Value::from("https://gist.github.com/alex/abc123")
    );

    // Re-indexing after a republish (matching hash again) clears the flag.
    published.gist_stale = false;
    apply_note(&conn, &published).unwrap();
    let rows = run_query(&conn, "SELECT path FROM notes WHERE gist_stale = 1", &[]).unwrap();
    assert!(rows.is_empty());
}

#[test]
fn reapplying_a_note_replaces_its_rows() {
    let conn = migrated();
    apply_note(&conn, &note("notes/a.md", "A", vec![wiki("X"), wiki("Y")])).unwrap();
    apply_note(&conn, &note("notes/a.md", "A", vec![wiki("Z")])).unwrap();
    let rows = run_query(&conn, "SELECT target_key FROM links", &[]).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["target_key"], Value::from("z"));
}

#[test]
fn reconcile_scan_classifies_candidates_orphans_and_skips() {
    let conn = migrated();
    let now: u64 = 100_000;
    let indexed = |path: &str, mtime: i64, hash: &str| {
        let mut row = note(path, "T", vec![]);
        row.mtime = mtime;
        row.file_hash = hash.to_string();
        apply_note(&conn, &row).unwrap();
    };
    indexed("notes/settled.md", 1_000, "settled-hash");
    indexed("notes/moved.md", 1_000, "moved-hash");
    indexed("notes/fresh.md", (now - 1_000) as i64, "fresh-hash");
    indexed("notes/evicted.md", 1_000, "evicted-hash");
    indexed("notes/gone.md", 1_000, "gone-hash");

    let meta = |path: &str, modified_ms: u64, placeholder: bool| crate::fs::FileMeta {
        path: path.to_string(),
        size: 1,
        modified_ms,
        placeholder,
    };
    let files = [
        meta("notes/settled.md", 1_000, false), // row matches, settled → skipped
        meta("notes/moved.md", 2_000, false),   // mtime moved → candidate with facts
        meta("notes/fresh.md", now - 1_000, false), // matches but too fresh to trust → candidate
        meta("notes/new.md", 3_000, false),     // no row → arrival candidate
        meta("notes/evicted.md", 9_000, true),  // placeholder → never a candidate, never orphaned
    ];

    let scan = scan_reconcile(&conn, &files, now).unwrap();

    assert_eq!(scan.total, 5);
    let paths: Vec<&str> = scan
        .candidates
        .iter()
        .map(|candidate| candidate.path.as_str())
        .collect();
    assert_eq!(paths, ["notes/moved.md", "notes/fresh.md", "notes/new.md"]);
    let moved = &scan.candidates[0];
    assert_eq!(moved.modified_ms, 2_000);
    assert_eq!(moved.stored_mtime, Some(1_000));
    assert_eq!(moved.stored_hash.as_deref(), Some("moved-hash"));
    let arrival = &scan.candidates[2];
    assert_eq!(arrival.stored_mtime, None);
    assert_eq!(arrival.stored_hash, None);

    // Only the vanished row is an orphan — eviction must not read as deletion.
    let orphan_paths: Vec<&str> = scan
        .orphans
        .iter()
        .map(|orphan| orphan.path.as_str())
        .collect();
    assert_eq!(orphan_paths, ["notes/gone.md"]);
    assert_eq!(scan.orphans[0].stored_hash, "gone-hash");
    assert_eq!(scan.orphans[0].stored_mtime, 1_000);
}

#[test]
fn touch_note_restamps_mtime_and_updated_at_without_creating_rows() {
    let conn = migrated();
    apply_note(&conn, &note("notes/a.md", "A", vec![])).unwrap();

    touch_note(&conn, "notes/a.md", 4_200).unwrap();
    let rows = run_query(
        &conn,
        "SELECT mtime, updated_at FROM notes WHERE path = ?1",
        &[Value::from("notes/a.md")],
    )
    .unwrap();
    assert_eq!(rows[0]["mtime"], Value::from(4_200));
    assert_eq!(rows[0]["updated_at"], Value::from(4_200));

    // A path with no row updates nothing — a touch must never resurrect a
    // removed note.
    touch_note(&conn, "notes/gone.md", 4_200).unwrap();
    let count = run_query(&conn, "SELECT COUNT(*) AS n FROM notes", &[]).unwrap();
    assert_eq!(count[0]["n"], Value::from(1));
}

#[test]
fn fts_matches_indexed_body() {
    let conn = migrated();
    apply_note(&conn, &note("notes/a.md", "Quick", vec![])).unwrap();
    let rows = run_query(
        &conn,
        "SELECT path FROM search_fts WHERE search_fts MATCH ?1",
        &[Value::from("quick")],
    )
    .unwrap();
    assert_eq!(rows.len(), 1);
}

#[test]
fn db_query_rejects_mutating_statements() {
    let conn = migrated();
    assert!(run_query(&conn, "DELETE FROM notes", &[]).is_err());
    assert!(run_query(&conn, "SELECT count(*) FROM notes", &[]).is_ok());
}

#[test]
fn read_bridge_refuses_attach_and_pragma() {
    // `Statement::readonly()` alone treats ATTACH/DETACH and connection-state
    // PRAGMAs as "read only", but neither reads *our* projection: an ATTACH
    // would let a caller open and SELECT from an arbitrary SQLite file on disk
    // (exfiltration), and `PRAGMA foreign_keys = OFF` would disable the cascades
    // the write path depends on. The read bridge's authorizer denies both at
    // prepare time (see `query::read_only_authorization`).
    let conn = migrated();
    let secret = tempfile::tempdir().expect("tempdir");
    let secret_db = secret.path().join("secret.sqlite");
    {
        let other = Connection::open(&secret_db).expect("open secret db");
        other
            .execute_batch("CREATE TABLE secret(x); INSERT INTO secret(x) VALUES ('exfiltrated');")
            .expect("seed secret");
    }
    let attach = format!("ATTACH DATABASE '{}' AS evil", secret_db.display());
    assert!(
        run_query(&conn, &attach, &[]).is_err(),
        "read bridge must refuse ATTACH"
    );
    assert!(
        run_query(&conn, "PRAGMA foreign_keys = OFF", &[]).is_err(),
        "read bridge must refuse PRAGMA"
    );

    // The guard is scoped per call and never blocks a legitimate read: indexing
    // a note and reading it back (incl. an FTS MATCH) still works afterwards.
    apply_note(&conn, &note("notes/a.md", "Quick", vec![])).unwrap();
    let rows = run_query(
        &conn,
        "SELECT path FROM search_fts WHERE search_fts MATCH ?1",
        &[Value::from("quick")],
    )
    .unwrap();
    assert_eq!(rows.len(), 1);
}

#[test]
fn clear_cascades_to_child_tables() {
    let conn = migrated();
    let mut seeded = note("notes/a.md", "A", vec![wiki("X")]);
    seeded.tasks = vec![task(0, "buy milk", false)];
    apply_note(&conn, &seeded).unwrap();
    clear_index(&conn).unwrap();
    // Deleting notes cascades to children; search_fts is cleared explicitly.
    for table in [
        "notes",
        "note_text",
        "links",
        "tags",
        "aliases",
        "assets",
        "tasks",
        "search_fts",
    ] {
        let rows = run_query(&conn, &format!("SELECT count(*) AS n FROM {table}"), &[]).unwrap();
        assert_eq!(rows[0]["n"], Value::from(0), "{table} should be empty");
    }
}

#[test]
fn reapplying_a_note_cascades_away_stale_children() {
    let conn = migrated();
    apply_note(&conn, &note("notes/a.md", "A", vec![wiki("X"), wiki("Y")])).unwrap();
    // Re-applying clears the note (cascade) before reinserting, so the old
    // tags/links don't linger even though apply_note lists no explicit deletes.
    apply_note(&conn, &note("notes/a.md", "A", vec![])).unwrap();
    let rows = run_query(&conn, "SELECT count(*) AS n FROM links", &[]).unwrap();
    assert_eq!(rows[0]["n"], Value::from(0));
}

#[test]
fn apply_note_inserts_tasks_and_replace_clears_them() {
    let conn = migrated();
    let mut seeded = note("notes/a.md", "A", vec![]);
    let mut due = task(4, "buy milk", false);
    due.due_date = Some("2026-07-01".to_string());
    seeded.tasks = vec![due, task(20, "call mum", true)];
    apply_note(&conn, &seeded).unwrap();

    let rows = run_query(
        &conn,
        "SELECT marker_offset, text, breadcrumbs, checked, due_date FROM tasks WHERE note_path = 'notes/a.md' ORDER BY marker_offset",
        &[],
    )
    .unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0]["marker_offset"], Value::from(4));
    assert_eq!(rows[0]["text"], Value::from("buy milk"));
    assert_eq!(rows[0]["breadcrumbs"], Value::from("[]"));
    assert_eq!(rows[0]["checked"], Value::from(0));
    assert_eq!(rows[0]["due_date"], Value::from("2026-07-01"));
    assert_eq!(rows[1]["checked"], Value::from(1));
    assert_eq!(rows[1]["due_date"], Value::Null);

    // Re-applying with no tasks cascades the old rows away (no explicit delete).
    apply_note(&conn, &note("notes/a.md", "A", vec![])).unwrap();
    let after = run_query(&conn, "SELECT count(*) AS n FROM tasks", &[]).unwrap();
    assert_eq!(after[0]["n"], Value::from(0));
}

#[test]
fn apply_note_serializes_task_breadcrumbs() {
    let conn = migrated();
    let mut seeded = note("notes/a.md", "A", vec![]);
    let mut with_context = task(4, "ship it", false);
    with_context.breadcrumbs = vec!["Project".to_string(), "Phase one".to_string()];
    seeded.tasks = vec![with_context];
    apply_note(&conn, &seeded).unwrap();

    let rows = run_query(
        &conn,
        "SELECT breadcrumbs FROM tasks WHERE note_path = 'notes/a.md'",
        &[],
    )
    .unwrap();
    assert_eq!(
        rows[0]["breadcrumbs"],
        Value::from("[\"Project\",\"Phase one\"]")
    );
}

#[test]
fn open_tasks_read_includes_private_notes_and_excludes_completed() {
    // The semantics `getOpenTasks` (queries.ts) relies on: open checkboxes joined
    // to note context, completed tasks excluded, and `private: true` notes' tasks
    // INCLUDED (the Tasks view is a local-only surface, like local search).
    let conn = migrated();
    let mut public = note("daily/2026-06-10.md", "A", vec![]);
    public.kind = "daily".to_string();
    public.daily_date = Some("2026-06-10".to_string());
    public.tasks = vec![task(2, "open a", false)];
    apply_note(&conn, &public).unwrap();

    let mut private = note("notes/b.md", "B", vec![]);
    private.is_private = true;
    private.tasks = vec![task(2, "open b", false), task(20, "done b", true)];
    apply_note(&conn, &private).unwrap();

    let rows = run_query(
        &conn,
        "SELECT tasks.note_path, tasks.text, notes.title AS note_title, notes.daily_date \
         FROM tasks INNER JOIN notes ON notes.path = tasks.note_path \
         WHERE tasks.checked = 0 ORDER BY tasks.note_path, tasks.marker_offset",
        &[],
    )
    .unwrap();

    assert_eq!(rows.len(), 2); // both open tasks; the completed one is gone
    assert_eq!(rows[0]["note_path"], Value::from("daily/2026-06-10.md"));
    assert_eq!(rows[0]["text"], Value::from("open a"));
    assert_eq!(rows[0]["note_title"], Value::from("A"));
    assert_eq!(rows[0]["daily_date"], Value::from("2026-06-10"));
    // The private note's open task is present (local-only surface).
    assert_eq!(rows[1]["note_path"], Value::from("notes/b.md"));
    assert_eq!(rows[1]["text"], Value::from("open b"));
}

#[test]
fn link_kind_check_rejects_unknown_kinds() {
    let conn = migrated();
    apply_note(&conn, &note("notes/a.md", "A", vec![])).unwrap();
    let bogus = conn.execute(
        "INSERT INTO links(source_path, kind, target_raw, target_key, pos_from, pos_to)
         VALUES('notes/a.md', 'bogus', 'X', 'x', 0, 0)",
        [],
    );
    assert!(
        bogus.is_err(),
        "CHECK should reject kinds other than wiki/md"
    );
}

#[test]
fn note_kind_daily_date_invariant_is_enforced() {
    // `kind` and `daily_date` both derive from the path in `buildIndexedNote`,
    // so they agree by construction — the 0015 CHECK makes SQLite reject any
    // writer that drifts: kind = 'daily' iff daily_date is set.
    let conn = migrated();

    let note_with_date = conn.execute(
        "INSERT INTO notes(path, title, title_key, kind, daily_date, file_hash)
         VALUES('notes/a.md', 'A', 'a', 'note', '2026-07-01', 'h')",
        [],
    );
    assert!(
        note_with_date.is_err(),
        "CHECK should reject kind='note' with a daily_date"
    );

    let daily_without_date = conn.execute(
        "INSERT INTO notes(path, title, title_key, kind, daily_date, file_hash)
         VALUES('daily/2026-07-01.md', 'July 1st, 2026', 'july 1st, 2026', 'daily', NULL, 'h')",
        [],
    );
    assert!(
        daily_without_date.is_err(),
        "CHECK should reject kind='daily' without a daily_date"
    );

    let template_with_date = conn.execute(
        "INSERT INTO notes(path, title, title_key, kind, daily_date, file_hash)
         VALUES('templates/j.md', 'J', 'j', 'template', '2026-07-01', 'h')",
        [],
    );
    assert!(
        template_with_date.is_err(),
        "CHECK should reject kind='template' with a daily_date"
    );

    // The three shapes buildIndexedNote actually emits all pass.
    conn.execute_batch(
        "INSERT INTO notes(path, title, title_key, kind, daily_date, file_hash) VALUES
           ('daily/2026-07-01.md', 'July 1st, 2026', 'july 1st, 2026', 'daily', '2026-07-01', 'h'),
           ('notes/a.md', 'A', 'a', 'note', NULL, 'h'),
           ('templates/j.md', 'J', 'j', 'template', NULL, 'h');",
    )
    .expect("consistent rows insert");
}

#[test]
fn kind_invariant_migration_wipes_the_projection_for_reindex() {
    // 0015 drops and recreates `notes` (a table-level CHECK cannot be ADDed)
    // while six child tables reference it ON DELETE CASCADE. The projection
    // is wiped children-first (so the DROP's implicit DELETE cascades over
    // empty tables even with enforcement on) and the next open re-indexes.
    let mut conn = open_in_memory().expect("open");
    conn.execute_batch("PRAGMA foreign_keys=ON;").expect("fk");
    migrate_to(&mut conn, 14).expect("migrate to v14");
    conn.execute_batch(
        "INSERT INTO notes(path, title, title_key, kind, daily_date, file_hash) VALUES
           ('daily/2026-07-01.md', 'July 1st, 2026', 'july 1st, 2026', 'daily', '2026-07-01', 'h1'),
           ('notes/a.md', 'A', 'a', 'note', NULL, 'h2');
         INSERT INTO note_text(note_path, text) VALUES('notes/a.md', 'A body');
         INSERT INTO links(source_path, kind, target_raw, target_key, pos_from, pos_to)
           VALUES('notes/a.md', 'wiki', 'July 1st, 2026', 'july 1st, 2026', 0, 0);
         INSERT INTO tags(note_path, tag, tag_key) VALUES('notes/a.md', 'X', 'x');
         INSERT INTO tasks(note_path, marker_offset, text, raw, checked)
           VALUES('notes/a.md', 0, 'buy milk', '[ ] buy milk', 0);
         INSERT INTO search_fts(path, title, body) VALUES('notes/a.md', 'A', 'A body');
         INSERT INTO index_meta(key, value) VALUES('k', 'v');",
    )
    .expect("stage v14 rows");

    migrate(&mut conn).expect("migrate to latest");

    for table in ["notes", "note_text", "links", "tags", "tasks", "search_fts"] {
        let count: i64 = conn
            .query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0, "{table} should be wiped for the re-index");
    }
    // Bookkeeping outlives the wipe (same contract as index_clear).
    let meta: i64 = conn
        .query_row("SELECT count(*) FROM index_meta", [], |row| row.get(0))
        .unwrap();
    assert_eq!(meta, 1);

    // Every notes index came back with the recreated table.
    for index in [
        "notes_title_key",
        "notes_daily_date",
        "notes_id",
        "notes_daily_date_mtime_path",
        "notes_non_daily_mtime",
        "notes_pinned",
        "notes_has_conflict",
    ] {
        let exists: bool = conn
            .prepare("SELECT 1 FROM pragma_index_list('notes') WHERE name = ?1")
            .unwrap()
            .exists([index])
            .unwrap();
        assert!(exists, "index {index} must be recreated with the table");
    }

    // The write path, the views, and the child cascades all bind to `notes`
    // by name — prove they resolve against the recreated table.
    apply_note(&conn, &note("notes/a.md", "A", vec![wiki("Target")])).unwrap();
    apply_note(&conn, &note("notes/target.md", "Target", vec![])).unwrap();
    let backlink_sources: i64 = conn
        .query_row(
            "SELECT count(*) FROM backlinks WHERE target_path = 'notes/target.md'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(backlink_sources, 1);
    conn.execute("DELETE FROM notes WHERE path = 'notes/a.md'", [])
        .unwrap();
    let orphans: i64 = conn
        .query_row("SELECT count(*) FROM links", [], |row| row.get(0))
        .unwrap();
    assert_eq!(
        orphans, 0,
        "ON DELETE CASCADE must target the recreated table"
    );
}

#[test]
fn open_index_at_creates_migrates_and_reopens() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = dir.path();

    let conn = open_index_at(root).expect("first open");
    assert!(root.join(".dayjot/index.sqlite").exists());
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, LATEST_SCHEMA_VERSION as i64);
    let journal: String = conn
        .query_row("PRAGMA journal_mode", [], |row| row.get(0))
        .unwrap();
    assert_eq!(journal, "wal");
    drop(conn);

    // Reopening an existing index is a no-op migration and preserves data.
    let conn = open_index_at(root).expect("first open");
    apply_note(&conn, &note("notes/a.md", "A", vec![])).unwrap();
    drop(conn);
    let conn = open_index_at(root).expect("reopen");
    let rows = run_query(&conn, "SELECT count(*) AS n FROM notes", &[]).unwrap();
    assert_eq!(rows[0]["n"], Value::from(1));
}

/// The note-window adoption contract (`windows::window_bootstrap`): reading
/// the open sessions must never bump either generation — a bump here would
/// strand every command the main window has pinned to the current ones.
#[test]
fn session_adoption_reads_never_bump_generations() {
    use tauri::Manager;
    let app = tauri::test::mock_builder()
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .expect("mock app");
    app.manage(crate::fs::GraphState::default());
    app.manage(super::IndexState::default());
    app.manage(crate::background_task::BackgroundTaskState::default());

    let graph_dir = tempfile::tempdir().expect("tempdir");
    {
        let state: tauri::State<crate::fs::GraphState> = app.state();
        let mut inner = state.0.lock().unwrap();
        inner.generation = 3;
        inner.root = Some(graph_dir.path().to_path_buf());
    }

    // Before any index opens, adoption reports that honestly (None), rather
    // than opening one itself.
    assert_eq!(super::current_generation(&app.state()).unwrap(), None);

    let opened = super::index_open(app.state(), app.state(), app.state()).expect("open");
    for _ in 0..2 {
        let info = crate::fs::current_graph_info(&app.state()).expect("graph info");
        assert_eq!(info.generation, 3);
        assert_eq!(
            super::current_generation(&app.state()).unwrap(),
            Some(opened)
        );
    }

    // Both counters sit exactly where the main window left them.
    let graph: tauri::State<crate::fs::GraphState> = app.state();
    assert_eq!(graph.0.lock().unwrap().generation, 3);
}

/// Command-level integration: the generation gate that every TS write relies on.
/// A write carrying a stale generation (issued before the index was reopened)
/// must silently no-op rather than mutate the newly-opened index.
#[test]
fn stale_generation_writes_are_dropped_end_to_end() {
    use tauri::Manager;
    let app = tauri::test::mock_builder()
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .expect("mock app");
    app.manage(crate::fs::GraphState::default());
    app.manage(super::IndexState::default());
    app.manage(crate::background_task::BackgroundTaskState::default());

    let graph_dir = tempfile::tempdir().expect("tempdir");
    {
        let state: tauri::State<crate::fs::GraphState> = app.state();
        let mut inner = state.0.lock().unwrap();
        inner.generation = 1;
        inner.root = Some(graph_dir.path().to_path_buf());
    }

    let count = |label: &str| -> Value {
        let rows = super::db_query(
            "SELECT count(*) AS n FROM notes".to_string(),
            vec![],
            app.state(),
        )
        .unwrap_or_else(|err| panic!("{label}: {err:?}"));
        rows[0]["n"].clone()
    };

    let stale = super::index_open(app.state(), app.state(), app.state()).expect("first open");
    super::index_apply(
        note("notes/a.md", "A", vec![]),
        stale,
        app.handle().clone(),
        app.state(),
        app.state(),
    )
    .expect("apply");
    assert_eq!(count("after first apply"), Value::from(1));

    // Reopening (graph switch / reload) bumps the generation; the old one is stale.
    let fresh = super::index_open(app.state(), app.state(), app.state()).expect("reopen");
    assert_ne!(stale, fresh);

    super::index_apply(
        note("notes/b.md", "B", vec![]),
        stale,
        app.handle().clone(),
        app.state(),
        app.state(),
    )
    .expect("stale apply returns Ok");
    assert_eq!(count("after stale apply"), Value::from(1)); // dropped, not applied

    super::index_remove(
        "notes/a.md".to_string(),
        stale,
        app.handle().clone(),
        app.state(),
        app.state(),
    )
    .expect("stale remove returns Ok");
    assert_eq!(count("after stale remove"), Value::from(1)); // also dropped

    super::index_apply(
        note("notes/b.md", "B", vec![]),
        fresh,
        app.handle().clone(),
        app.state(),
        app.state(),
    )
    .expect("fresh apply");
    assert_eq!(count("after fresh apply"), Value::from(2));

    // index_meta_set rides the same gate: stale stamps vanish, fresh ones land
    // (and upsert — the projection-version stamp is written after every rebuild).
    let meta = |label: &str| -> Vec<serde_json::Map<String, Value>> {
        super::db_query(
            "SELECT value FROM index_meta WHERE key = 'k'".to_string(),
            vec![],
            app.state(),
        )
        .unwrap_or_else(|err| panic!("{label}: {err:?}"))
    };
    super::index_meta_set(
        "k".to_string(),
        "stale".to_string(),
        stale,
        app.state(),
        app.state(),
    )
    .expect("stale meta set returns Ok");
    assert!(meta("after stale meta set").is_empty());
    super::index_meta_set(
        "k".to_string(),
        "v1".to_string(),
        fresh,
        app.state(),
        app.state(),
    )
    .expect("fresh meta set");
    super::index_meta_set(
        "k".to_string(),
        "v2".to_string(),
        fresh,
        app.state(),
        app.state(),
    )
    .expect("meta upsert");
    assert_eq!(meta("after meta upsert")[0]["value"], Value::from("v2"));
}

#[test]
fn fts5_is_compiled_in() {
    let conn = Connection::open_in_memory().expect("open");
    conn.execute_batch(
        "CREATE VIRTUAL TABLE fts USING fts5(body);
         INSERT INTO fts(body) VALUES ('the quick brown fox');",
    )
    .expect("fts5 create/insert");
    let hits: i64 = conn
        .query_row(
            "SELECT count(*) FROM fts WHERE fts MATCH 'quick'",
            [],
            |row| row.get(0),
        )
        .expect("fts5 match");
    assert_eq!(hits, 1);
}

#[test]
fn sqlite_vec_loads_and_runs_knn() {
    let conn = open_in_memory().expect("open with vec");
    let version: String = conn
        .query_row("SELECT vec_version()", [], |row| row.get(0))
        .expect("vec_version");
    assert!(!version.is_empty());

    conn.execute_batch(
        "CREATE VIRTUAL TABLE vec_items USING vec0(embedding float[4]);
         INSERT INTO vec_items(rowid, embedding) VALUES
           (1, '[1, 2, 3, 4]'),
           (2, '[9, 9, 9, 9]');",
    )
    .expect("vec0 create/insert");

    let nearest: i64 = conn
        .query_row(
            "SELECT rowid FROM vec_items \
             WHERE embedding MATCH '[1, 2, 3, 4]' ORDER BY distance LIMIT 1",
            [],
            |row| row.get(0),
        )
        .expect("vec0 knn");
    assert_eq!(nearest, 1);
}

#[test]
fn drop_ai_leftovers_migration_removes_populated_chat_and_embedding_tables() {
    // 0019 runs against real user databases still at v18, which may hold chat
    // history and embedding rows from before the AI removal. Stage v18, seed
    // the affected tables with rows (chat_messages carries the FK to
    // chat_conversations), then apply the rest — 0019 must drop them all
    // without error, leaving the index a pure markdown projection. (The
    // vec0 embedding_vectors table's populated drop is already exercised by
    // 0003's own copy-and-drop, replayed here.)
    let mut conn = open_in_memory().expect("open with vec");
    migrate_to(&mut conn, 18).expect("stage v18");
    conn.execute_batch(
        "INSERT INTO chat_conversations(id, title, created_ms, updated_ms)
           VALUES ('c1', 'q', 1, 1);
         INSERT INTO chat_messages(
             id, conversation_id, seq, user_text, attachments, parts,
             response_messages, created_ms)
           VALUES ('m1', 'c1', 0, 'hi', '[]', '[]', '[]', 1);
         INSERT INTO embedding_chunks(
             note_path, pos_from, pos_to, text, content_hash, model_id)
           VALUES ('notes/a.md', 0, 3, 'hi', 'h1', 'm');",
    )
    .expect("seed v18 rows");

    migrate(&mut conn).expect("apply 0019 over populated tables");

    for table in [
        "chat_messages",
        "chat_conversations",
        "embedding_vectors",
        "embedding_chunks",
    ] {
        let exists: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE name = ?1",
                [table],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(exists, 0, "{table} should be dropped by 0019");
    }

    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, LATEST_SCHEMA_VERSION as i64);
}
