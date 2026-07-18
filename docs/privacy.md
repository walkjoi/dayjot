# What leaves the device, and when

DayJot is local-first: your notes are markdown files in a folder you chose, the search
index is SQLite in `.dayjot/` beside them, and **no DayJot-hosted server exists in any
path** — there is no product analytics, no account, and no AI: the app ships no model
providers and never sends note content to one. Official release builds send scrubbed
JavaScript exception diagnostics to Sentry. Every network call the app can make is
listed here, with what it carries.

The one hard rule sits above all of it: **a note with `private: true` frontmatter never
has its content sent to any external service.** The shared guard lives in
`packages/core/src/privacy.ts`; every outbound feature (gist publishing today) calls it
with the flag re-read from disk at call time, and it is covered by tests.

## Backup & sync (off until you connect)

- **Where:** the git repository you connect — GitHub guided in-app (created **private**
  by default; a public repo requires explicit confirmation), or any git host over SSH.
- **What:** the whole graph as git commits — including notes marked `private: true`.
  The privacy flag blocks *services that read your content*; backup is your own
  repository, and excluding private notes from it would silently lose them.
- **When:** after you connect, on the background backup cadence and on "Back up now".
- GitHub sign-in uses the OAuth device flow against `github.com`; the token is stored
  in the OS keychain.

## Publish to gist (per note, on demand)

- **Where:** GitHub Gists, using the same GitHub token as backup.
- **What:** the body of the one note you publish, as a **secret** gist. Republishing
  updates the same gist. A note marked `private: true` is refused — the guard runs on
  the content actually being sent.
- **When:** only when you run the Publish-to-gist command on a note.

## Browser capture (the Chrome extension)

- **Where:** nowhere on the network. The **DayJot Capture** extension hands each
  capture to a local native-messaging host (`dayjot-capture-host`) that the desktop
  app registers on your machine; the host spools it to the capture inbox on disk
  (`<graph>/.dayjot/inbox/`) and the app drains it on next launch. **No DayJot-hosted
  server, no third party, and no other destination is ever contacted** — the extension
  stores no keys and makes no network calls of its own.
- **What:** only the page you explicitly capture (toolbar button or ⌘⇧K) — its URL,
  title, your current text selection, a screenshot of the visible tab, and, only when
  you tick "Capture page text", the page's extracted text. Nothing is read in the
  background; the extension requests no broad host permissions and acts on the active
  tab only at the moment you trigger it.
- **When:** when you capture. If the desktop app isn't reachable yet, the capture is
  held in the browser's local extension storage and retried automatically until it
  spools — it is never sent anywhere else in the meantime.
- **Enrichment:** after a capture lands, the app may fetch **the captured page's URL**
  once to scrape its title and meta description. That request goes to the site you
  captured — no other party — and sends no note content. A capture in a
  `private: true` daily note is skipped entirely.

## Apple Contacts (off by default)

- **Where:** nowhere on the network. Enabling the Contacts integration reads the
  **macOS/iOS contacts store on-device** (the same store System Settings governs),
  behind the standard OS permission prompt. There is no DayJot copy of your address
  book: lookups are live queries, nothing is mirrored into `.dayjot/`, and DayJot
  never writes back to Contacts.
- **What:** a note title or a meeting attendee's email is matched against your
  contacts; a match's name, email, and phone are shown on a suggestion card. Contact
  details enter a note **only when you click Add**, at which point they are ordinary
  markdown you own — covered by the same rules as anything else you type (including
  `private: true` and backup).
- **When:** only while the integration is on, and only for the note being viewed (or
  the meeting being added). Turning it off — in Settings or in the OS privacy pane —
  stops all reads immediately.

## Exception diagnostics (on in official release builds)

- **Where:** Sentry, for errors raised in the React/WebView layer. Native process crashes
  remain covered by the operating system's crash reporting.
- **What:** an allow-listed diagnostic containing the exception class, redacted exception
  text, sanitized JavaScript stack locations, the app version, and whether React handled
  the error. Stack filenames are reduced to bundle basenames. Request data, note content,
  note titles, graph paths, local filesystem paths, breadcrumbs, console output, session
  replay, tracing, and user identifiers are not collected. Sentry is also configured not
  to store the transport IP address with events.
- **When:** only when an official desktop or iOS release raises an uncaught JavaScript
  error, an unhandled promise rejection, or a caught/recoverable React error. Development
  and self-built apps without the release DSN do not initialize Sentry.
- **Operational safeguards:** Sentry's server-side and default scrubbers are enabled, IP
  address storage and server-side JavaScript source scraping are disabled, and explicit
  sensitive-field rules cover notes, graph paths, requests, and user identifiers. Private
  source maps are uploaded during official builds for readable stacks, then deleted from
  the app bundle.

## Housekeeping calls

- **Update check:** the packaged app fetches a release manifest (`latest.json`) from
  this repository's GitHub Releases on launch and every six hours. Stable builds check
  the latest stable release; beta builds check the beta feed. The app downloads the
  update archive only when you ask it to install. No user data is sent; payloads are
  verified against a public key compiled into the app before installing. Offline, the
  check fails silently and the app carries on.

## Secrets

The GitHub token lives in the **OS keychain only** — never in markdown, never in
`.dayjot/`, never in git. Disconnecting GitHub in Settings deletes it.

## Summary table

| Call | Destination | Carries note content? | Off by default? |
| --- | --- | --- | --- |
| Backup | Your git repository | Yes — including private notes | Yes (needs connecting) |
| Publish to gist | GitHub Gists | Yes — one note, you chose it; private notes refused | — (per-note command) |
| Capture page scrape | The site you captured | No | — (only after you capture) |
| Update check | GitHub Releases | No | On in packaged builds |
| Browser capture | Nowhere (local host on disk) | — (stays on your machine) | — (only when you capture) |
| Contacts lookup | Nowhere (on-device OS store) | — (stays on your machine) | Yes (opt-in) |
| Exception diagnostics | Sentry | No — messages and context are redacted | No (official releases) |
