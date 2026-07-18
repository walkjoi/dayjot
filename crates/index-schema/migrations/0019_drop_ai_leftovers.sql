-- Drop the dormant AI-era tables. DayJot has no AI features: the semantic-
-- search embeddings (0002/0003) were never written after the AI removal, and
-- the Reflect chat history (0008) had no shipping writer. The chat tables were
-- also the *only* durable, non-rebuildable rows in the index — dropping them
-- makes `index.sqlite` a pure projection of the markdown again, so deleting
-- the file loses nothing.
--
-- Child-before-parent for the chat FK; embedding_vectors is a vec0 virtual
-- table (DROP TABLE handles it, as 0003 already relied on).
DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS chat_conversations;
DROP TABLE IF EXISTS embedding_vectors;
DROP TABLE IF EXISTS embedding_chunks;
