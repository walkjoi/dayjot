### Purpose

This document helps AI agents and automated systems interact with the DayJot repo safely and effectively. It summarizes setup, workflows, CI parity, testing, directories, and environment variables.

### What is DayJot

DayJot is a modern note‑taking tool with a TypeScript codebase: offline-first, markdown backed, and open source. DayJot is an independent fork of Reflect V2 (`team-reflect/reflect-open`); "Reflect V1" in docs and code refers to the original commercial Reflect app, which DayJot can still import exports from.

### Product Principles

Drawn from the product docs — read [docs/product.md](docs/product.md) and
[docs/privacy.md](docs/privacy.md) for deeper context.

- **Daily notes first.** The app opens to today's note. All capture flows into the daily note by default.
- **Association over hierarchy.** `[[Wiki Links]]` replace folders. The note graph is the organizing model; there are no folders.
- **Markdown is the source of truth.** Notes are `.md` files (`daily/YYYY-MM-DD.md`, `notes/`). SQLite under `.dayjot/` is a rebuildable projection of the notes. (Legacy `chat_*` and embedding tables remain in the schema, dormant — DayJot has no AI features.)
- **No AI, no DayJot-hosted APIs.** DayJot ships no AI features and calls no model providers. Sync goes to GitHub/iCloud/Git. Never proxy through DayJot infrastructure.
- **`private: true` is a hard block.** Notes with this frontmatter flag must never have their content sent to any external service — publishing, sync metadata, or otherwise. Enforce at every call site (`packages/core/src/privacy.ts`).
- **Keyboard-native UX.** Every core workflow must be reachable from the keyboard. This is product identity, not polish.
- **Minimal UI.** Do less, and do it well. Don't add surfaces that compete with the editor.
- **Secrets in the OS keychain.** API keys and credentials never go in markdown, Git, or `.dayjot/`.
- **Portable data.** Full export (JSON, markdown, HTML) must work from day one.
- **No Electron.** Desktop shell is Tauri.
- **MIT open-source core.** Write as if the code is public and will be critiqued.

### Agent workflow

- **Verify before answering.** When answering factual questions about what the code
  does, read the relevant source first and trace behavior to the final output. If
  you have not verified something, say so instead of guessing.
- **Plan proportionally.** For non-trivial, ambiguous, or high-risk changes, form a
  short plan before editing and ask for sign-off when the direction affects public
  APIs, migrations, release behavior, or broad UX. Simple localized fixes can
  proceed once the relevant context is understood.
- **Use a dedicated worktree or branch.** Check `git status` before editing and
  before staging. Preserve unrelated user changes; ask before publishing if the
  worktree is dirty, the PR scope is ambiguous, or staging would include changes
  you did not make.
- **Prefer the clean design.** Optimize for the correct open-source shape rather
  than the smallest diff. Avoid compatibility shims, dual paths, or legacy behavior
  unless the product/release context requires them.
- **Verify locally.** Run typecheck, lint, and targeted tests for the code you
  touched. If a required check cannot run, report the reason and the residual risk.
- **Publish completed work.** When a requested implementation is complete and
  verified, create or use an appropriate branch, commit the intended changes, push,
  open a normal ready-for-review PR, and wait for CI/checks, Bugbot, review
  comments, merge conflicts, and other blockers to settle.

### Development workflow

Development happens on `master` (the only long-lived branch); branch from it and
target it with PRs. release-please keeps a beta and a stable Release PR open side by
side; merging one publishes that channel. Between stable releases the version carries
a prerelease suffix (`0.7.0-beta.3`), which the release pipeline publishes as GitHub
pre-releases. See [docs/macos-distribution.md](docs/macos-distribution.md).

PR titles must be conventional commits (`feat:` / `fix:` / `chore:` …, enforced by
CI). The title becomes the squash-commit message, drives the release-please version
bump, and — for `feat`/`fix` — is the user-facing changelog entry, so write it
as behavior, not implementation. Do not use `feat!:` or `BREAKING CHANGE:` footers;
see [CONTRIBUTING.md](CONTRIBUTING.md).

The app version lives solely in `apps/desktop/package.json`, maintained by
release-please through Release PRs. Never hand-edit that version, the changelogs
(`apps/desktop/CHANGELOG.md`, `apps/desktop/CHANGELOG.beta.md`), or the manifests
under `.github/release-please/`.

1. Make your changes
2. Run typecheck (`pnpm typecheck`)
3. Run lint (`pnpm lint`) — fix any errors; `pnpm lint:fix` auto-fixes where possible
4. Run specific tests for your changes (`pnpm test --run path/to/test`)

`pnpm check` runs typecheck + lint together. Run it before declaring any work done.

### Running tests

There are too many tests for you to run them all, so you will just have to run the ones that are specific to whatever logic you've written.

Local unit tests:

```bash
# Run vitest tests
pnpm test --run path/to/test
```

Rust tests (the Cargo workspace: desktop shell, `dayjot` CLI, index-schema crate):

```bash
# Prefer per-crate runs; cargo test --workspace also works
cargo test -p dayjot-cli
cargo test -p dayjot-desktop
```

**Before any cargo build/check/test that compiles the desktop crate** (including
`--workspace` commands and clippy), the sidecars (the `dayjot` CLI and the
`dayjot-capture-host` native-messaging host) must be staged once per checkout:

```bash
pnpm --filter @dayjot/desktop sidecar
```

Otherwise tauri-build fails with `resource path binaries/<name>-<triple> doesn't exist`
(`pnpm tauri dev`/`build` stage them automatically; details in [docs/cli.md](docs/cli.md)).

### Repo layout

DayJot is a **Turborepo + pnpm monorepo** around a **Tauri 2** desktop/mobile app: a
React + TypeScript frontend bundled by Vite, embedded in a Rust native shell. The Rust
crates form a single **Cargo workspace** rooted at the repository root.

```
dayjot/
├── apps/
│   ├── desktop/            # @dayjot/desktop — the Tauri 2 app
│   │   ├── src/            # React frontend (main.tsx, app.tsx, components/, editor/,
│   │   │                   #   hooks/, providers/, routing/); calls Rust via @tauri-apps/api
│   │   ├── src-tauri/      # Tauri native shell (Rust crate `dayjot-desktop`)
│   │   │   ├── src/        # lib.rs (#[tauri::command] handlers, plugins), db/, fs/,
│   │   │   │               #   watcher.rs, embed.rs, recents.rs, secrets.rs, settings.rs
│   │   │   ├── tauri.conf.json          # build hooks, windows, bundle targets (incl. iOS)
│   │   │   ├── tauri.<platform>.conf.json  # desktop overlays: bundle the dayjot CLI sidecar
│   │   │   ├── capabilities/            # Tauri 2 permission grants (e.g. default.json)
│   │   │   ├── icons/                   # App icons for desktop/mobile bundles
│   │   │   ├── gen/                     # Generated schemas + platform projects (no hand-edits)
│   │   │   └── ios.project.yml          # iOS XcodeGen template
│   │   ├── scripts/        # build-sidecar.mjs (stages the dayjot CLI for bundling)
│   │   ├── dist/           # Vite build output (frontendDist in tauri.conf.json)
│   │   └── public/         # Static assets served by Vite
│   ├── cli/                # `dayjot` — self-contained Rust read/discovery CLI (see docs/cli.md)
│   ├── extension/          # @dayjot/extension — Chrome MV3 capture extension (WXT; see its README)
│   └── native-host/        # `dayjot-capture-host` — native-messaging spooler sidecar (Plan 11)
├── packages/
│   ├── core/               # @dayjot/core — ALL TS business logic (markdown/, indexing/,
│   │                       #   graph/, actions/, settings/, ipc/)
│   └── db/                 # @dayjot/db — generated Kysely schema + the IPC dialect
├── crates/
│   └── index-schema/       # Shared SQLite migrations for <graph>/.dayjot/index.sqlite
│                           #   (one schema for the desktop writer + CLI reader)
├── design-system/          # Design tokens, components, and UI guidelines (see design-system/readme.md)
├── docs/                   # Product, architecture, and contributor docs
├── Cargo.toml              # Root Cargo workspace (dayjot-desktop, dayjot-cli, dayjot-capture-host, dayjot-index-schema)
└── turbo.json, pnpm-workspace.yaml
```

### Related repos

- **Meowdown:** the local checkout lives at `~/repos/meowdown`. Meowdown is the
  first-party hybrid/live-preview Markdown editor that DayJot uses through
  `@meowdown/core` and `@meowdown/react`. When investigating editor behavior,
  markdown round-tripping, keybindings, slash menus, wiki links, task checkboxes,
  paste/drop handling, or mobile editor quirks, check that repo as well as this
  one. If the root cause is in Meowdown, fix it there and open the PR against the
  Meowdown project rather than papering over it in DayJot.

**Design system**

All UI work should follow the DayJot design system documented in [`design-system/readme.md`](design-system/readme.md). Key resources:

- `design-system/tokens/` — CSS custom properties for color, typography, spacing, and motion
- `design-system/components/` — reusable React primitives (Button, Input, Badge, etc.)
- `design-system/guidelines/` — color, type, spacing, and brand specimens
- `design-system/styles.css` — global entry point that imports all tokens

**Frontend ↔ Rust bridge**

- Define commands in `apps/desktop/src-tauri/src/` (registered in `lib.rs`'s `invoke_handler`) with `#[tauri::command]`.
- Call commands from the frontend with `invoke` from `@tauri-apps/api/core`.
- Add Tauri plugins in `apps/desktop/src-tauri/Cargo.toml` (Rust) and grant permissions in `apps/desktop/src-tauri/capabilities/`.

**Common commands** (run from the repo root)

```bash
pnpm dev              # turbo dev across packages (Vite on http://localhost:1420)
                      #   add ?platform=ios to the URL to preview the MOBILE tree in a
                      #   plain browser (dev-only in-memory bridge + seeded demo graph)
pnpm tauri dev        # Full Tauri app with hot reload (stages the CLI sidecar first)
pnpm tauri:dev        # `pnpm tauri dev` with the dev overlay → the "DayJot Dev" flavor (green icon, own identifier; coexists with DayJot / DayJot Beta)
pnpm build            # turbo build pipeline → apps/desktop/dist/
pnpm tauri build      # Native app bundle, incl. the dayjot CLI sidecar
pnpm release:macos    # Signed + notarized macOS build for distribution (docs/macos-distribution.md)
pnpm release:macos publish  # The above, then fill and undraft the release-please draft release
pnpm tauri:ios:dev "iPhone 17 Pro"  # Run the Tauri iOS target in the simulator (docs/contributing/mobile-simulator.md)
pnpm release:ios preflight --build-number=123  # Check iOS/TestFlight signing, App Store Connect app record, and upload auth
pnpm release:ios testflight --build-number=123 --wait  # Build and upload the iOS app to TestFlight
```

**iOS simulator**

The mobile app is the Tauri iOS target of `apps/desktop`, not a separate
package. Use `pnpm tauri:ios:dev "iPhone 17 Pro"` from the repo root (or
`pnpm tauri:ios:dev --host` for a physical device); debug builds are the dev
flavor (`app.dayjot.ios.dev`, shown as `DayJot Dev`) and need that script's
config overlay, so do not run plain `tauri ios dev`. List
available simulator names with `xcrun simctl list devices available`. The first
run can be quiet while Xcode compiles Rust, Swift plugin code, and native
dependencies. See `docs/contributing/mobile-simulator.md` before committing
changes under `apps/desktop/src-tauri/gen/apple/`, because Tauri/Xcode may
normalize generated project and plist files.

**iOS TestFlight**

Use `pnpm release:ios` for TestFlight work; do not hand-roll `tauri ios build`
and `altool` unless debugging the helper itself. Start with
`pnpm release:ios preflight --build-number=<number>`, then run
`pnpm release:ios testflight --build-number=<number> --wait` or upload an
existing IPA with `pnpm release:ios upload --ipa=<path> --wait`.

The iOS bundle identifier is `app.dayjot.ios`, intentionally separate from the
old Capacitor TestFlight app (`app.reflect.ReflectMobile`). The release helper
verifies the IPA bundle identifier and `ITSAppUsesNonExemptEncryption=false`
before upload. See `docs/ios-testflight.md` for App Store Connect setup, local
keychain fallback (`dayjot-notary`), API key CI secrets, and troubleshooting.

# Code Conventions

Write code as if this open-source repository will be reviewed closely by other
engineers. Favor small, composable modules, explicit contracts, tests that
document behavior, and the existing local patterns over new abstractions.

## Structured Code Style

- Keep files focused and single-responsibility. Split out helpers, hooks, and
  components when a module starts doing more than one thing.
- Use kebab-case for directories, TypeScript files, and React component files.
- Prefer `@/` imports where the project already uses them.
- Avoid comments unless they explain non-obvious decisions or complex logic.
  Do not add comments that merely restate the code.
- Always write documentation for public APIs.
- Never use single-character variable names.
- Always run build/typecheck/lint before declaring implementation work done.

## TypeScript

- Prefer interfaces for object definitions.
- Use type aliases for unions, intersections, and mapped types.
- Never use `any` or `as any`.
- Avoid type assertions unless they are genuinely necessary.
- Use strict, idiomatic TypeScript with proper null handling.
- Use discriminated unions and type guards for variant data. Export helper
  predicates when they clarify a public contract.
- Use readonly fields for immutable data.
- Use generics for reusable type patterns.
- Keep shared types in `types.ts` files or close to their consumers when local.
- Use explicit return types for public functions.
- Prefer function declarations for named functions and arrow functions for
  callbacks.
- Prefer async/await over Promise chains.
- Prefer functional patterns over classes.

## Data Boundaries

- Use Zod for all incoming or untrusted data, including JSON, IPC payloads,
  external API responses, file-derived metadata, and worker payloads.
- Normalize casing once at the boundary; TypeScript types should be camelCase.
- Do not use type assertions to parse JSON.
- When pulling database types from Kysely, use the appropriate helper type such
  as `Selectable<T>`, `Insertable<T>`, or `Updateable<T>` instead of raw table
  types in public function parameters or returns.
- Handle Promise rejections properly, but do not add broad defensive error
  handling unless the call site needs it.

## React

- Favor named exports for components.
- Keep one React component per file unless a tiny private helper component is
  inseparable from its parent.
- Name React props interfaces with the component name plus `Props`, for example
  `ButtonProps`.
- Do not add `use client` or `use server` directives.
- Do not `import * as React from 'react'`; import the specific React APIs.
- Never call hooks conditionally.
- Keep logic as low as possible in the tree. Prefer providers and small hooks for
  shared state.
- Move large mutation handlers, parsing, persistence, and business logic into
  helpers or hooks instead of embedding them inside components.
- `zod` and `react-hook-form` are available; use them for validated forms.

## UI and Styling

- Use Tailwind CSS, React, shadcn/ui components, Radix, Tailwind Aria, and
  Lucide React icons.
- Generate responsive designs and provide default props for reusable React
  components.
- Always check `apps/desktop/src/components/ui/` before building custom UI.
- For popups, popovers, dropdowns, dialogs, tooltips, menus, comboboxes, and
  other overlays, use the existing shadcn component from
  `apps/desktop/src/components/ui/`. If the shadcn primitive is missing locally,
  install or generate it there and use it. Never hand-roll an overlay primitive
  when shadcn already covers it.
