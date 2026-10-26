-- Stats page projection: a daily note's mood rating (the Year in Pixels).
--
-- The rating lives in the note's frontmatter (`mood: 4`, written by the daily
-- mood bar), so like `is_private` it is a column on the note's own row: 1
-- (Awful) to 5 (Great), NULL when the note carries none — an unrated day, so
-- there is no zero. Rows written before this migration read NULL until the
-- projection-version rebuild re-indexes them (see `syncIndex` in @dayjot/core).
-- Only daily notes' ratings surface; filtering is the query's job.
ALTER TABLE notes ADD COLUMN mood INTEGER CHECK (mood BETWEEN 1 AND 5);
