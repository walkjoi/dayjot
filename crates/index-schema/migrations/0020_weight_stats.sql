-- Stats page projections: weight entries and per-note word counts.
--
-- A `weight:: 72.5` / `weight:: 72.5kg` inline field in a note body becomes one
-- row, keyed by the field's character offset in the file (UTF-16 code units,
-- matching `tasks.marker_offset`). A pure projection like tasks/tags: ON DELETE
-- CASCADE so a removed note's weights vanish with it, moved explicitly on
-- rename, rebuildable. The Stats chart reads only rows whose note is a daily
-- note (the date semantics live on `notes.daily_date`), but extraction projects
-- every note uniformly — filtering is the query's job.
CREATE TABLE weights (
  note_path    TEXT NOT NULL REFERENCES notes(path) ON DELETE CASCADE,
  field_offset INTEGER NOT NULL,
  kg           REAL NOT NULL,
  PRIMARY KEY (note_path, field_offset)
);

-- Words per note, derived once at index time in TS (`buildIndexedNote`) like
-- `preview` — CJK-aware counting has no SQLite equivalent. Rows written before
-- this migration carry the default until the projection-version rebuild
-- re-indexes them (see `syncIndex` in @dayjot/core).
ALTER TABLE notes ADD COLUMN word_count INTEGER NOT NULL DEFAULT 0;
