# The `dayjot` CLI

A small, self-contained read/discovery CLI over a DayJot graph (Plan 14). It
reads the graph's markdown files directly and opens `.dayjot/index.sqlite`
strictly read-only — no running desktop app required. It never writes: markdown
edits are the write path, and the index is refreshed by the desktop app.

```
dayjot today              # print today's daily note
dayjot today --path       # its absolute path (works before the file exists)
dayjot search <query>     # ranked full-text search over the index
dayjot show <note>        # print a note by date, path, title, or alias
dayjot path <note>        # resolve a note to its absolute path
dayjot open <note>        # open a note in the app (dayjot:// deep link)
```

Built from `apps/cli` (`cargo build -p dayjot-cli`); bundled with the desktop
app as a Tauri sidecar (macOS: `DayJot.app/Contents/MacOS/dayjot`, Linux
`.deb`: `/usr/bin/dayjot`). For local development:
`cargo install --path apps/cli`.

## Graph resolution

First match wins:

1. `--graph <path>` — must contain a `.dayjot/` directory.
2. `$DAYJOT_GRAPH` — same requirement.
3. The nearest ancestor of the current directory containing `.dayjot/`
   (git-style walk-up).

There is deliberately no fallback to the desktop app's recent-graphs config:
the CLI stays deterministic for scripts and agents.

## Privacy

Notes with `private: true` frontmatter are **invisible through the CLI** — no
content, no paths, no search hits — and there is no flag that overrides this.
`search` filters them out; `show`/`today`/`path` print nothing to stdout,
explain on stderr, and exit `3`. The check reads the resolved file's own
frontmatter (never just the index row), so a stale index can't leak a
just-flagged note.

## Output contract

- **stdout carries only data** (note content, paths, or JSON); all warnings
  and errors go to stderr.
- `--json` emits the stable shapes below — they are the agent/scripting
  contract and are locked by tests (`apps/cli/tests/cli.rs`).

| Exit code | Meaning |
|---|---|
| 0 | success |
| 1 | runtime error (no graph, IO/SQL failure) |
| 2 | usage error |
| 3 | note not found, or note is private |
| 4 | search index missing or unusable (`search` only) |

## Commands

### `dayjot today [--path] [--json]`

Prints today's daily note (`daily/YYYY-MM-DD.md`, local timezone). File-only —
works with no index. A missing daily is exit `3`; with `--path` the would-be
path is printed even before the file exists (dailies are created lazily, so
this is how editors/scripts create them).

```jsonc
// dayjot today --json
{
  "date": "2026-06-11",
  "path": "daily/2026-06-11.md",
  "absolutePath": "/…/graph/daily/2026-06-11.md",
  "title": "2026-06-11",
  "content": "…"
}
// dayjot today --path --json adds "exists" and omits title/content:
{ "date": "…", "path": "…", "absolutePath": "…", "exists": false }
```

### `dayjot search <query> [--limit N] [--json]`

Search over note titles and bodies, ranked like the app: exact, prefix, and
per-term title matches lead, followed by title-boosted bm25 matches. Title
terms match at word starts (`car` finds `Car log`, never `Oscar party`);
terms in scripts written without spaces (Japanese, Chinese, Korean, Thai, …)
match anywhere in the title, since FTS alone cannot see inside their
uninterrupted title runs. Body matches include snippets. Terms are matched
literally (FTS5 operators in the query have no special meaning); a title-only
JSON result has an empty snippet and score `0`. Requires the index: if `.dayjot/index.sqlite` is missing
the exit code is `4` — open the graph in DayJot to build it; the CLI never runs
the indexer. If files on disk diverge from the index (checked by mtime, then
content hash), a staleness warning goes to stderr and `"stale": true` is set —
results still return.

```jsonc
// dayjot search "meeting notes" --json
{
  "query": "meeting notes",
  "stale": false,
  "results": [
    { "path": "notes/standup.md", "title": "Standup", "snippet": "…meeting notes…", "score": -1.94 }
  ]
}
```

### `dayjot show <note> [--json]`

Resolves `<note>` and prints the raw markdown. Resolution order:

1. A calendar-valid `YYYY-MM-DD` → that daily note.
2. An explicit path (graph-relative like `notes/foo.md`, or absolute inside
   the graph).
3. A title match (case-insensitive, trimmed).
4. An alias match (from `aliases:` frontmatter, or a v1 subject-alias
   segment of a `//` title like `Charlotte MacCaw // Mum`).

Works with or without the index — when the index is missing, titles/aliases
are derived by scanning the files. Ambiguous matches resolve to the first path
alphabetically and list the others on stderr.

```jsonc
// dayjot show "Project X" --json   ("date" is null for non-dailies)
{ "date": null, "path": "notes/project-x.md", "absolutePath": "…", "title": "Project X", "content": "…" }
```

### `dayjot path <note> [--json]`

Same resolution, but prints only the absolute path — for piping into editors
and tools (`$EDITOR "$(dayjot path 'Project X')"`). A `YYYY-MM-DD` argument
prints the would-be daily path even before the file exists.

```jsonc
// dayjot path 2099-01-01 --json   ("date" only appears for dailies)
{ "date": "2099-01-01", "path": "daily/2099-01-01.md", "absolutePath": "…", "exists": false }
```

### `dayjot open <note> [--print] [--json]`

Same resolution, then navigates the DayJot app there by handing the OS URL
opener the note's `dayjot://` deep link ([docs/deep-links.md](deep-links.md)).
The URL prefers the most durable address the note has: the date form for
dailies (which need not exist yet — navigation creates them lazily), the
frontmatter `id` form when the note carries one (it survives renames), else
the graph-relative path form. The CLI never writes, so it does not mint ids —
"Copy deep link" in the app does that.

The URL is always printed to stdout; `--print` skips launching the opener —
the scriptable half. Private notes are refused (exit `3`) like every other
CLI surface, before their address leaks.

```jsonc
// dayjot open "Project X" --json --print   ("date" only appears for dailies)
{ "path": "notes/project-x.md", "url": "dayjot://note/01hzy3…", "launched": false }
```

## For agents

The five commands plus `--json` are the supported automation surface (e.g.
`~/.agents` discovery workflows). The JSON field names and exit codes above
are stable; new fields may be added, existing ones won't change meaning.
Reading a private note is not possible through this surface by design — don't
work around it by reading graph files directly unless the user asked for that.

Settings → Agents installs a per-graph agent skill
(`~/.agents/skills/dayjot-<graph-slug>/SKILL.md`) that teaches coding agents
this contract: the graph's root, the bundled CLI's path, the commands, and
the privacy rules. The file carries a `dayjot-managed` sha256 marker so the
app can refresh its own installs without ever overwriting a hand-edited one
(`apps/desktop/src-tauri/src/skill.rs`).

## Development notes

- The CLI deliberately duplicates a thin read-side contract from
  `@dayjot/core` (path conventions, fold keys, frontmatter coercions, title
  derivation, SHA-256 hashing, FTS match syntax). Each Rust module names its
  TS counterpart, and the contract is pinned by the shared parity corpus in
  [`fixtures/parity/`](../fixtures/parity/README.md): TS generates
  `expected.json` from the real core pipeline, the Rust tests assert against
  it, so neither side can change without the other following in the same PR.
  Don't grow the surface.
- The sidecar is staged by `apps/desktop/scripts/build-sidecar.mjs` into
  `apps/desktop/src-tauri/binaries/` (gitignored), which Tauri's
  `bundle.externalBin` (desktop platform overlay configs) picks up. tauri-build
  requires that file to exist before the desktop crate compiles — `pnpm tauri
  dev`/`build` stage it automatically; before a bare `cargo build/test
  --workspace`, run `pnpm --filter @dayjot/desktop sidecar` once.
