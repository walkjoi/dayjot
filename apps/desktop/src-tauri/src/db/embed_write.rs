//! Embedding-table cleanup. The legacy `embedding_chunks`/`embedding_vectors`
//! tables stay in the shared schema (dormant — DayJot has no AI features and
//! nothing writes them), but graphs created before the removal may still hold
//! rows, so genuine note deletion clears them alongside everything else.

use rusqlite::{params, Connection};

use crate::error::AppResult;

/// Drop every chunk + vector belonging to `note_path` (note deletion).
pub(super) fn remove_chunks(conn: &Connection, note_path: &str) -> AppResult<()> {
    conn.prepare_cached(
        "DELETE FROM embedding_vectors WHERE rowid IN
           (SELECT id FROM embedding_chunks WHERE note_path = ?1)",
    )?
    .execute(params![note_path])?;
    conn.prepare_cached("DELETE FROM embedding_chunks WHERE note_path = ?1")?
        .execute(params![note_path])?;
    Ok(())
}
