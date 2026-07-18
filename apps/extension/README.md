# DayJot Capture (Chrome extension)

Save the page you're reading into DayJot: ⌘⇧K saves immediately with default
settings, including the stored page-text preference, while the toolbar button
opens the capture popup for an optional note. Captures include the page URL,
title, selection, screenshot, and optional page text when Chrome allows them,
then hand off to the **installed desktop app** through a local native-messaging
host. No DayJot-hosted services are involved, and capture works even while the
app is closed: the host spools into the graph's capture inbox
(`<graph>/.dayjot/inbox/`), and the app drains it on next launch.
[Plan 11](../../the pre-fork design notes (git history)) is the design doc.

The Chrome Web Store carries the
[upstream Reflect Capture listing](https://chromewebstore.google.com/detail/reflect-capture/ccabifmooehighoonjeiololjfofkhkd),
which targets the Reflect app's native-messaging host. For DayJot, build and
load the extension from source (below), or publish your own listing.

## Architecture in one breath

popup → `chrome.storage` queue → background `sendNativeMessage` →
`dayjot-capture-host` (Tauri sidecar, registered by the desktop app on every
launch) → capture inbox → desktop drain (`@dayjot/core` `actions/capture`):
raw note + daily `## [[Links]]` entry now (resolving or creating that category
note), meta-scrape + BYOK AI title + description async. The extension stores no
keys and makes no AI or network calls; its only honest status is **queued** — it
cannot observe the desktop drain.

## Develop

```bash
pnpm --filter @dayjot/extension dev     # wxt dev server (auto-reloads in Chrome)
pnpm --filter @dayjot/extension build   # production build → .output/chrome-mv3
pnpm --filter @dayjot/extension test    # vitest over lib/
```

Load a build via `chrome://extensions` → Developer mode → **Load unpacked**.
Prefer `pnpm … dev` (`.output/chrome-mv3-dev`) for development — it auto-reloads
and always keeps the pinned `key`. You can also load the `pnpm … build` output
(`.output/chrome-mv3`), but **do not load the `pnpm zip` output**: the store
artifact omits `key`, so it loads under a random ID the host won't allowlist.

For the native hop to work, run the desktop app once (it writes the host
manifests for detected browsers and the active-graph pointer file), then
restart Chrome so it re-reads the manifests.

### Troubleshooting: "Install DayJot to finish saving…" while DayJot is installed

That message is the `no-host` state — Chrome could not reach (or was not
allowlisted by) the native-messaging host. Check, in order:

1. **The extension's ID.** In `chrome://extensions`, the card must read either
   `ccabifmooehighoonjeiololjfofkhkd` for the Chrome Web Store listing or
   `dlbliojklpickgimjdmjjdnbjdiomjik` for an unpacked development build. Any
   other ID means you loaded a **keyless** local build (typically
   `.output/chrome-mv3` right after `pnpm zip`, which builds with
   `WXT_STORE_BUILD=true`). Rebuild with `pnpm … dev` or `pnpm … build`, then
   **Reload** the extension. The host allowlists only the store and pinned dev
   IDs, so a wrong ID is rejected as "forbidden" → this message.
2. **The desktop app has run at least once** on this machine, so it has written
   `~/Library/Application Support/<browser>/NativeMessagingHosts/app.dayjot.capture.json`.
   If Chrome was already open when that file appeared, restart Chrome.
3. **A graph is selected** in the app. The `no-graph` variant of this message
   ("Open DayJot and pick a graph first") means the host ran but has no active
   graph to spool into.

The capture is never lost while held — it stays queued and retries automatically
once the host is reachable.

## The unpacked ID is pinned — and the store ID is not the same

`wxt.config.ts` carries a public `key`, which fixes the extension ID to
`dlbliojklpickgimjdmjjdnbjdiomjik` for **unpacked** loads — `wxt dev`, CI, and a
`wxt build` you load by hand. The desktop app's host manifests
(`apps/desktop/src-tauri/src/capture.rs`, `EXTENSION_ORIGINS`) allowlist exactly
this origin, so during development the native hop works. Changing the key without
updating that constant silently breaks it. The private half of the key is
deliberately discarded; unpacked loads only need the public key.

**The Chrome Web Store does not use this key.** It rejects a `key` field in the
uploaded package (`key field is not allowed in manifest`) and minted the live
listing ID `ccabifmooehighoonjeiololjfofkhkd`. So:

- The store artifact must **omit** `key`. `pnpm zip` sets `WXT_STORE_BUILD=true`,
  which drops it; every other build keeps it. (`manifest-key.test.ts` still pins
  the dev key against `EXTENSION_ORIGINS`.)
- `apps/desktop/src-tauri/src/capture.rs` must keep both the store ID and the
  pinned dev ID in `EXTENSION_ORIGINS`, or the native hop will fail for one of
  the two install modes.

To derive an ID from a key (if it ever has to change):

```bash
openssl genrsa 2048 > key.pem
openssl rsa -in key.pem -pubout -outform DER | base64        # manifest "key"
openssl rsa -in key.pem -pubout -outform DER | shasum -a 256 \
  | head -c 32 | tr '0123456789abcdef' 'abcdefghijklmnop'    # extension ID
```

## Releasing updates to the Chrome Web Store

`pnpm --filter @dayjot/extension zip` produces a key-stripped,
signed-on-upload package whose manifest declares only the permissions the code
uses (see the justifications below). Upload to your own listing in the
[Developer Dashboard](https://chrome.google.com/webstore/devconsole) (the
[upstream Reflect Capture listing](https://chromewebstore.google.com/detail/reflect-capture/ccabifmooehighoonjeiololjfofkhkd)
belongs to team-reflect).

### Build & upload

1. `pnpm --filter @dayjot/extension check` (typecheck + lint) and
   `pnpm --filter @dayjot/extension test` — both must be green.
2. `pnpm --filter @dayjot/extension zip` → upload
   `.output/dayjot-capture-<version>-chrome.zip`. This artifact omits the manifest
   `key` (the store rejects it); a plain `wxt build` keeps it for unpacked loads.
3. Keep `chrome-extension://ccabifmooehighoonjeiololjfofkhkd/` in
   `EXTENSION_ORIGINS` in `apps/desktop/src-tauri/src/capture.rs`; the
   native-messaging host manifests rewrite themselves on each desktop launch.

### Listing copy

**Category:** Productivity · **Language:** English

**Single purpose** (one sentence, as the store requires):

> Save the page you are reading — its link, selection, and a screenshot — into the
> DayJot desktop app.

**Detailed description:**

> DayJot Capture saves the page you're reading into DayJot with one click or a
> keyboard shortcut (⌘⇧K / Ctrl+Shift+K).
>
> A capture includes the page's URL and title, your current text selection, and a
> screenshot of the visible tab. Optionally, tick "Capture page text" to include the
> page's readable text as well.
>
> Captures are handed to the **installed DayJot desktop app** over a local connection
> on your own machine — there is no DayJot account and no DayJot server in the path.
> Capturing works even when the app is closed: the link is held and saved automatically
> the next time DayJot runs. The extension stores no API keys and makes no AI or
> network calls of its own.
>
> Requires the DayJot desktop app: https://github.com/walkjoi/dayjot

**Privacy policy URL:** `https://github.com/walkjoi/dayjot/blob/master/docs/privacy.md`
(the "Browser capture" section). Must be live on the public `master` branch before
submission.

### Store assets to attach

- **Store icon** — 128×128, already shipped at `public/icon/128.png`.
- **Screenshots** — at least one 1280×800 (or 640×400) PNG of the capture popup over a
  real page. A ready-to-upload shot lives at
  `store-assets/screenshot-1280x800.png` (the popup over an article, showing the page
  thumbnail, title, note field, and "Save to DayJot"). Refresh it when the popup UI
  changes — resize a clean window grab with
  `magick <grab>.png -resize '1280x800!' store-assets/screenshot-1280x800.png`.

### Permission justifications

Each is reviewed individually; every permission below is exercised by the code:

| Permission | Why it's needed |
| --- | --- |
| `activeTab` | Read the URL/title and grab a screenshot + selection of the tab you capture — only at the moment you click the button or press the shortcut. Avoids any broad host permission. |
| `scripting` | Run a one-line script in the active tab to read the current selection and, when opted in, extract the page's readable text. |
| `nativeMessaging` | The only output: hand each capture to the local `dayjot-capture-host` the desktop app registers. No network is used. |
| `storage` | Queue captures locally so a capture survives the app being closed and retries until it spools. |
| `unlimitedStorage` | Queued captures embed a screenshot data URL, which can exceed the default storage quota while waiting for the app. |
| `alarms` | A coarse retry timer so held captures flush once DayJot is installed/launched later. |

### Data-handling disclosures (Privacy practices tab)

- **Data collected:** *Website content* (the captured page's URL, title, selection,
  screenshot, and — only when opted in — page text). Collected **only on an explicit
  user action**, never in the background.
- **Where it goes:** to the user's own machine (the local DayJot desktop app). It is
  **not** sent to DayJot or any third party.
- The three required certifications are all true and can be affirmed:
  1. Data is **not** sold to third parties.
  2. Data is **not** used or transferred for purposes unrelated to the single purpose.
  3. Data is **not** used or transferred to determine creditworthiness or for lending.
