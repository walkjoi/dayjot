# DayJot — product overview

DayJot is a daily notebook for Mac and iPhone built on a folder of plain
markdown files. It descends from an open-source fork of Reflect, stripped to
a deliberately small core: writing, linking, finding, and syncing your own
notes — nothing else.

## What DayJot is

- **Daily notes first.** The app opens to today's note; capture defaults
  there. `⌘D` always lands on today. `⌘⇧T` (configurable) drops a `- HH:mm`
  timestamp at the cursor — the interstitial-journaling gesture.
- **Association over hierarchy.** `[[Wiki Links]]` connect notes; backlinks
  make the connections navigable. There are no folders to file into.
- **Markdown is the source of truth.** Notes are `.md` files
  (`daily/YYYY-MM-DD.md`, `notes/<title>.md`, attachments under `assets/`).
  The SQLite index in `.dayjot/` is a rebuildable projection — deleting it
  loses nothing.
- **Fast, local, lexical search.** `⌘K` searches titles, content, backlinks,
  and tags entirely on-device.
- **Your sync, your keys.** GitHub (or any SSH git remote) is the default
  sync path: versioned, private, yours. iCloud Drive is the zero-config
  Apple alternative. A graph syncs through one or the other, never both.
- **Keyboard-native.** Every core workflow is reachable from the keyboard;
  `⌘/` lists everything. This is product identity, not polish.
- **Capture from anywhere.** The Chrome extension and iOS share sheet spool
  into the graph's local inbox; captures are enriched from the page's own
  metadata.

## What DayJot is not

- **No AI.** No chat, no model providers, no API keys, no embeddings, no
  transcription. Removed by design, not omitted by accident.
- **No accounts, no server.** There is no DayJot backend in any code path
  and no product analytics.
- **No audio recording.** Notes are written, not dictated.
- **No plugin API, no Windows/Android** — out of scope for now.

## Privacy invariants

- `private: true` frontmatter is a hard block: that note's content never
  reaches any external service (gist publishing refuses it). Enforced in
  `packages/core/src/privacy.ts`, re-read from disk at call time.
- Every network call the app can make is enumerated in
  [privacy.md](privacy.md).

## Lineage

DayJot forked from [Reflect](https://github.com/team-reflect/reflect-open)
(MIT) in July 2026 and diverged: GitHub-first sync, the AI surface and audio
memos removed, new branding. Importing a Reflect V1 export is still
supported. The pre-fork design notes and implementation plans live in git
history rather than in the tree.
