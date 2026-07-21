import { z } from 'zod'

/**
 * The user-settings schema — the policy half of the settings store. Rust
 * persists an opaque JSON object in the OS config dir; this schema owns the
 * known keys, their defaults, and their validation.
 *
 * Resilience contract (mirrors the frontmatter schema): a missing or invalid
 * value degrades to its default (`.catch`) instead of failing the whole load,
 * and unknown keys are preserved (`.passthrough`) so a document written by a
 * newer app version round-trips through an older one without losing fields.
 */

/**
 * How the editor renders markdown syntax characters. `hide` (the default)
 * hides them, `show` always displays them, and `hybrid` reveals them only
 * around the caret.
 *
 * The persisted name is implementation-neutral on purpose: it maps to
 * meowdown's "mark mode" at the editor boundary (`hybrid` becomes meowdown's
 * `focus`), but the settings document must outlive any one editor library.
 */
export const editorMarkdownSyntaxSchema = z.enum(['hide', 'show', 'hybrid']).catch('hide')

export type EditorMarkdownSyntax = z.infer<typeof editorMarkdownSyntaxSchema>

/**
 * Whether the editor underlines misspelled words (the platform's native
 * spell check on the contenteditable). On by default — turning it off is the
 * preference of users who find the underlines noisy in note-taking.
 */
export const editorSpellCheckSchema = z.boolean().catch(true)

/**
 * Whether a note that opens with an empty body starts the editor on a single
 * empty bullet — old DayJot's every-note default. On by default.
 *
 * The bullet is an **editor affordance only**, never persisted on its own: an
 * empty list item serializes to nothing (`docToMarkdown` drops it), so an
 * unedited note still writes an empty file — and a not-yet-created daily-note
 * placeholder stays uncreated until the first real keystroke (the lazy
 * no-litter contract). The seam lives at the editor (`note-pane.tsx`), not the
 * save pipeline, because seeding the document model with the literal `- `
 * markdown would classify lossy and open the note read-only.
 */
export const editorDefaultBulletSchema = z.boolean().catch(true)

/**
 * Whether pressing Return at the end of a heading starts a new bullet on the
 * next line — old DayJot's "type a title, then bullet" capture flow. On by
 * default.
 *
 * Independent of {@link editorDefaultBulletSchema}: that seeds an empty note's
 * first line, this shapes what Enter *after a heading* produces. They are
 * separate keys so each can be turned off on its own.
 */
export const editorBulletAfterHeadingSchema = z.boolean().catch(true)

/**
 * Whether the caret animates smoothly between positions while editing. On by
 * default. Display-only; it never changes the document or stored Markdown.
 */
export const editorSmoothCaretAnimationSchema = z.boolean().catch(true)

/**
 * The editor's reading text size. `small` (the default) is one design-system
 * size down from the prose size (14px); `medium` is the DS prose size (16px)
 * and `large` steps one DS size up (18px). Display-only — it scales the editor
 * body via a CSS variable on the document root (`--editor-font-size`, applied
 * by `EditorTextSizeEffect`) and never touches the stored markdown.
 */
export const editorTextSizeSchema = z.enum(['small', 'medium', 'large']).catch('small')

export type EditorTextSize = z.infer<typeof editorTextSizeSchema>

/**
 * The note canvas's reading typeface. Every choice is bundled with the app
 * and pairs its Latin face with a CJK chain, so notes mixing English and
 * Chinese render deliberately (`--font-reading-*` in the design system):
 *
 * - `wenkai` (the default) — LXGW WenKai Screen 霞鹜文楷, a screen-tuned
 *   kaiti whose one voice covers both scripts.
 * - `source-han-serif` — Source Han Serif 思源宋体 (Google's Noto Serif SC
 *   build), a bookish songti with a matching Latin.
 * - `literata` — the Literata reading serif for Latin; CJK falls back to
 *   the system sans.
 * - `quattro` — iA Writer Quattro's humanist duospace for Latin; CJK falls
 *   back to the system sans.
 * - `inter` — the interface font, for prose that matches the chrome.
 *
 * Display-only — it maps to `--font-reading` via `[data-editor-font]` on the
 * document root (applied by `EditorFontEffect`) and never touches the stored
 * markdown.
 */
export const editorFontSchema = z
  .enum(['wenkai', 'source-han-serif', 'literata', 'quattro', 'inter'])
  .catch('wenkai')

export type EditorFont = z.infer<typeof editorFontSchema>

/**
 * Whether note content stretches across the available desktop pane instead
 * of staying in the default centered reading column. Off by default to
 * preserve DayJot Open's existing layout.
 */
export const editorFullWidthSchema = z.boolean().catch(false)

/**
 * The clamp range for a user-adjustable sidebar width, in CSS pixels. Shared
 * between the schema (so a hand-edited document can't wreck the layout) and
 * the drag interaction (so the handle stops where the schema would clamp).
 */
export interface SidebarWidthRange {
  readonly min: number
  readonly max: number
  /** The width a fresh install starts from — also the double-click reset target. */
  readonly fallback: number
}

/**
 * The workspace (left) sidebar's range. The minimum keeps the sidebar clear
 * of the macOS traffic lights, which float over its top-left corner at an
 * OS-controlled position; the maximum protects the note pane.
 */
export const SIDEBAR_WIDTH_RANGE: SidebarWidthRange = { min: 200, max: 480, fallback: 260 }

/**
 * The contextual (right) panel's range. Its minimum is higher than the
 * workspace sidebar's because the panel's month calendar needs the room.
 */
export const CONTEXT_SIDEBAR_WIDTH_RANGE: SidebarWidthRange = {
  min: 240,
  max: 480,
  fallback: 320,
}

/** Rounds a width to whole pixels and clamps it into the given range. */
export function clampSidebarWidth(range: SidebarWidthRange, width: number): number {
  return Math.min(range.max, Math.max(range.min, Math.round(width)))
}

function sidebarWidthValueSchema(range: SidebarWidthRange) {
  return z
    .number()
    .catch(range.fallback)
    .transform((width) => clampSidebarWidth(range, width))
}

/**
 * The workspace (left) sidebar's width in CSS pixels, set by dragging its
 * right edge. Desktop-only — the mobile tree has its own shell and never
 * reads it. A non-number degrades to the default; an out-of-range number
 * clamps instead of resetting so a near-miss hand-edit keeps its intent.
 */
export const sidebarWidthSchema = sidebarWidthValueSchema(SIDEBAR_WIDTH_RANGE)

/**
 * The contextual (right) panel's width in CSS pixels, set by dragging its
 * left edge. Same resilience contract as {@link sidebarWidthSchema};
 * independent of it because the two panels carry different content densities.
 */
export const contextSidebarWidthSchema = sidebarWidthValueSchema(CONTEXT_SIDEBAR_WIDTH_RANGE)

/**
 * The app color theme. `system` (the default) follows the OS preference;
 * `light`/`dark` pin it. Persisted here so the choice survives relaunch.
 */
export const themePreferenceSchema = z.enum(['system', 'light', 'dark']).catch('system')

export type ThemePreference = z.infer<typeof themePreferenceSchema>

/**
 * How times of day are displayed throughout the app. `12h` (the default)
 * renders `8:22pm`; `24h` renders `20:22`. Display-only — stored timestamps
 * and daily-note keys are unaffected.
 */
export const timeFormatSchema = z.enum(['12h', '24h']).catch('12h')

export type TimeFormat = z.infer<typeof timeFormatSchema>

/**
 * How calendar dates are displayed throughout the app: `mdy` (the default)
 * renders `June 10th, 2026`, `dmy` renders `10th June 2026`, and `iso`
 * renders `2026-06-10`. Display-only — daily-note filenames and stored dates
 * stay ISO `YYYY-MM-DD` regardless.
 */
export const dateFormatSchema = z.enum(['mdy', 'dmy', 'iso']).catch('mdy')

export type DateFormat = z.infer<typeof dateFormatSchema>

/**
 * Which day opens the calendar week. `monday` (the default) follows ISO 8601;
 * `sunday` matches the North-American convention.
 */
export const weekStartDaySchema = z.enum(['monday', 'sunday']).catch('monday')

export type WeekStartDay = z.infer<typeof weekStartDaySchema>

/**
 * Tags pinned as one-click filters on the All Notes screen, in display order.
 * The defaults mirror the original app's built-in filter tabs (book/link/
 * person); the screen offers every other tag through its Custom menu, so an
 * empty list still filters fine. Matching is case-insensitive at the query —
 * entries here keep whatever casing the user typed.
 */
export const allNotesFilterTagsSchema = z.array(z.string()).catch(['book', 'link', 'person'])

export type AllNotesFilterTags = z.infer<typeof allNotesFilterTagsSchema>

/**
 * The Markdown the Insert-timestamp command (`note.insertTimestamp`) drops at
 * the cursor. Tokens: `HH`/`H` (24-hour, padded/plain), `hh`/`h` (12-hour),
 * `mm`, `ss`, `A`/`a` (AM/PM). Everything else is inserted literally. An
 * invalid value degrades to the default list-line shape.
 */
export const timestampFormatSchema = z.string().min(1).max(120).catch('- HH:mm ')

/**
 * The Insert-timestamp keybinding, in the app keymap grammar
 * (`[Alt-]Mod-[Shift-]<key>`; `Mod` is ⌘ on macOS, Ctrl elsewhere). An
 * invalid value degrades to the default.
 */
export const timestampKeybindingSchema = z
  .string()
  .regex(/^(Alt-)?(Mod-|Meta-|Ctrl-)(Shift-)?[a-z0-9[\]\\/,.;'`=-]$/)
  .catch('Mod-Shift-t')

/**
 * Whether the user has finished the mobile onboarding choice (Plan 19, step
 * 6): iCloud Drive or this device. Off by default — a fresh install shows
 * the onboarding screen before anything seeds a graph. Once set, later
 * launches open the chosen storage root directly. Mobile-only; desktop has
 * its own chooser, so this key is simply never read there.
 */
export const mobileOnboardedSchema = z.boolean().catch(false)

/**
 * Which storage root the mobile graph lives in (Plan 21): the app's iCloud
 * Drive container (`'icloud'` — the recommended default offered first during
 * onboarding, syncs across devices) or the app-sandbox Documents directory
 * (`'local'` — this device only, and the home of GitHub-cloned graphs).
 * Defaults to `'local'` so installs onboarded before this key existed keep
 * opening the root they already use. Only the *kind* is persisted — absolute
 * container paths change across restore/update and are re-derived every
 * launch. Mobile-only; desktop never reads it.
 */
export const mobileStorageKindSchema = z.enum(['icloud', 'local']).catch('local')

/**
 * The *name* of the iCloud graph the mobile app has open (the container
 * `Documents/` subdirectory name) — the persisted selector now that the
 * container can hold several graphs. A name, never a path: container paths
 * change across restore/update and are re-derived every launch. Empty means
 * "not chosen yet" — launch falls back to the first graph in the container.
 * Only read when `mobileStorage` is `'icloud'`. Mobile-only.
 */
export const mobileGraphNameSchema = z.string().catch('')

/**
 * Whether the Apple Contacts integration is on. Off by default — turning it
 * on triggers the OS contacts permission prompt. Lookups are live, on-demand
 * `CNContactStore` queries (attendee resolution, suggested-contact cards);
 * nothing is mirrored into the index and nothing ever leaves the device.
 */
export const contactsEnabledSchema = z.boolean().catch(false)

/**
 * Whether the Apple Calendar integration is on. Off by default — turning it
 * on triggers the macOS calendar-permission prompt, and that is the user's
 * call. Access is read-only and entirely local (EventKit); see
 * the pre-fork design notes (git history)
 */
export const calendarEnabledSchema = z.boolean().catch(false)

/**
 * EventKit identifiers of the calendars whose events appear beside the daily
 * note. Empty (the default) shows nothing — the Settings section lists every
 * calendar on the Mac for opt-in. Identifiers for since-removed accounts are
 * harmless: the Rust side skips ones it can't resolve.
 */
export const calendarIdsSchema = z.array(z.string()).catch([])

export type CalendarIds = z.infer<typeof calendarIdsSchema>

/**
 * The preset palette for a graph's identity color (the swatch shown next to
 * the graph name). A closed set of named ids — not raw hex — so the UI can
 * map each id to values that read well in both light and dark themes.
 */
export const graphColorSchema = z.enum([
  'indigo',
  'blue',
  'teal',
  'green',
  'amber',
  'orange',
  'red',
  'pink',
  'purple',
])

export type GraphColor = z.infer<typeof graphColorSchema>

/** Every graph color id, in the order pickers should display them. */
export const GRAPH_COLOR_IDS = graphColorSchema.options

export type GraphColors = Record<string, GraphColor>

/**
 * Identity colors the user has chosen per graph, keyed by the graph's absolute
 * root path. An absent key means the default (the app accent). Entries for
 * forgotten graphs are kept on purpose — re-opening that graph later restores
 * its color. Resilience is per entry: a corrupt value is dropped while the
 * rest load, and a non-object value degrades to the empty record.
 */
export const graphColorsSchema = z
  .record(z.string(), z.unknown())
  .catch({})
  .transform((entries) => {
    const colors: GraphColors = {}
    for (const [root, value] of Object.entries(entries)) {
      const parsed = graphColorSchema.safeParse(value)
      if (parsed.success) {
        colors[root] = parsed.data
      }
    }
    return colors
  })

export const settingsSchema = z
  .looseObject({
    editorMarkdownSyntax: editorMarkdownSyntaxSchema,
    editorSpellCheck: editorSpellCheckSchema,
    editorDefaultBullet: editorDefaultBulletSchema,
    editorBulletAfterHeading: editorBulletAfterHeadingSchema,
    editorSmoothCaretAnimation: editorSmoothCaretAnimationSchema,
    editorTextSize: editorTextSizeSchema,
    editorFont: editorFontSchema,
    editorFullWidth: editorFullWidthSchema,
    sidebarWidth: sidebarWidthSchema,
    contextSidebarWidth: contextSidebarWidthSchema,
    timestampFormat: timestampFormatSchema,
    timestampKeybinding: timestampKeybindingSchema,
    contactsEnabled: contactsEnabledSchema,
    mobileOnboarded: mobileOnboardedSchema,
    mobileStorage: mobileStorageKindSchema,
    mobileGraphName: mobileGraphNameSchema,
    theme: themePreferenceSchema,
    timeFormat: timeFormatSchema,
    dateFormat: dateFormatSchema,
    weekStartDay: weekStartDaySchema,
    allNotesFilterTags: allNotesFilterTagsSchema,
    calendarEnabled: calendarEnabledSchema,
    calendarIds: calendarIdsSchema,
    graphColors: graphColorsSchema,
  })

export type Settings = z.infer<typeof settingsSchema>

/** The settings a fresh install starts from (every key at its default). */
export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({})
