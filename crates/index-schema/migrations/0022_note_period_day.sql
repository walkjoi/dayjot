-- Stats page projection: whether a daily note's day was a period day (the
-- Cycle tiles, the weight chart's shading, the Year in Pixels' dots).
--
-- The flag lives in the note's frontmatter (`period: true`, written by the
-- daily bar's period toggle), so like `is_private` it is a column on the
-- note's own row. Rows written before this migration read 0 until the
-- projection-version rebuild re-indexes them (see `syncIndex` in
-- @dayjot/core). Only daily notes' flags surface; filtering is the query's job.
ALTER TABLE notes ADD COLUMN is_period_day INTEGER NOT NULL DEFAULT 0;
