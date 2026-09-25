import { useCallback, useEffect, useMemo, useRef, type ReactElement } from 'react'
import type { Keepsake, KeepsakesGrouping } from '@dayjot/core'
import { useBacklinkNavigation } from '@/hooks/use-backlink-navigation'
import { useKeepsakes } from '@/hooks/use-keepsakes'
import { useNoteLinkNavigation } from '@/hooks/use-note-link-navigation'
import type { NewWindowClickEvent } from '@/lib/windows/open-in-new-window'
import { useSettings } from '@/providers/settings-provider'
import { routeForPath } from '@/routing/route'
import { ScrollRestored } from '@/routing/scroll-restore'
import { KeepsakeRow } from './keepsake-row'
import { groupKeepsakesByMonth } from './keepsake-months'
import { groupKeepsakesBySubject, keepsakeMarkdownUnder, NO_SUBJECT_KEY } from './keepsake-subjects'
import { KeepsakesGroupingSwitch } from './keepsakes-grouping-switch'

/** One section of the box, whichever division is showing. */
interface KeepsakeSection {
  key: string
  label: string
  /** The subject a subject section gathers (its rows drop the link that repeats it). */
  subjectKey: string | null
  /** The note a subject heading opens. */
  notePath: string | null
  keepsakes: Keepsake[]
}

function sectionsFor(keepsakes: readonly Keepsake[], grouping: KeepsakesGrouping): KeepsakeSection[] {
  if (grouping === 'month') {
    return groupKeepsakesByMonth(keepsakes).map((month) => ({
      key: month.key,
      label: month.label,
      subjectKey: null,
      notePath: null,
      keepsakes: month.keepsakes,
    }))
  }
  return groupKeepsakesBySubject(keepsakes).map((group) => ({
    key: group.key,
    label: group.label ?? 'No subject',
    subjectKey: group.key === NO_SUBJECT_KEY ? null : group.key,
    notePath: group.notePath,
    keepsakes: group.keepsakes,
  }))
}

/**
 * The Keepsakes view — the box.
 *
 * Every keepsake — a line kept with `⌘⇧B`, or a section of lines kept together
 * — newest first, set at reading size in the note font. It is a page to read
 * down, not a list to work through, so it carries no counts in the sidebar, no
 * filters, and nothing to clear: a keepsake is never *done*, and a number
 * beside it would read as a debt.
 *
 * One switch divides it: by month (the default — every keepsake carries a
 * date), or by the subject its first line links (`#keep [[SD]] …`), which is
 * how a writer who labels their keeps reads them back. Clicking a keepsake
 * opens its note with the caret on it.
 *
 * There is no table behind this. The read finds the few notes carrying `#keep`
 * through the existing tags index and parses those on demand.
 */
export function KeepsakesScreen(): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null)
  const keepsakes = useKeepsakes()
  const { settings, updateSettings } = useSettings()
  const grouping = settings.keepsakesGrouping
  const navigateNoteLink = useNoteLinkNavigation()
  const { onWikilinkClick, resolveImageUrl } = useBacklinkNavigation()

  const sections = useMemo(() => sectionsFor(keepsakes ?? [], grouping), [keepsakes, grouping])

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true })
  }, [])

  const openKeepsake = useCallback(
    (keepsake: Keepsake, event: NewWindowClickEvent) => {
      navigateNoteLink(routeForPath(keepsake.notePath), event, {
        revealKeepsake: keepsake.markerIndex,
      })
    },
    [navigateNoteLink],
  )

  const openSubject = useCallback(
    (notePath: string, event: NewWindowClickEvent) => {
      navigateNoteLink(routeForPath(notePath), event)
    },
    [navigateNoteLink],
  )

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      aria-label="Keepsakes"
      className="flex h-full min-h-0 flex-col outline-none"
    >
      <header className="flex flex-none items-center gap-3 border-b border-border py-2.5 pl-4 pr-3 lg:pl-10">
        <div className="window-drag-control min-w-0 flex-1">
          <h1 className="py-1.5 text-sm font-medium text-text">Keepsakes</h1>
        </div>
        {keepsakes !== undefined && keepsakes.length > 0 && (
          <KeepsakesGroupingSwitch
            grouping={grouping}
            onChange={(next) => updateSettings({ keepsakesGrouping: next })}
          />
        )}
      </header>

      <ScrollRestored className="min-h-0 flex-1 overflow-auto px-6 py-8">
        <div className="mx-auto w-full max-w-2xl">
          {keepsakes === undefined ? null : keepsakes.length === 0 ? (
            <KeepsakesEmpty />
          ) : (
            sections.map((section) => (
              <section key={section.key} className="mb-8 last:mb-0">
                <KeepsakeSectionHeading
                  section={section}
                  grouping={grouping}
                  onOpenSubject={openSubject}
                />
                <ul className="list-none p-0">
                  {section.keepsakes.map((keepsake) => (
                    <KeepsakeRow
                      key={`${keepsake.notePath}:${keepsake.markerOffset}`}
                      keepsake={keepsake}
                      markdown={keepsakeMarkdownUnder(keepsake, section.subjectKey)}
                      onOpen={openKeepsake}
                      onWikilinkClick={onWikilinkClick}
                      resolveImageUrl={resolveImageUrl}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </ScrollRestored>
    </div>
  )
}

/**
 * A section's heading: a month reads as a quiet rule; a subject reads as
 * written (never case-shifted — `DSA` stays `DSA`, `wine` stays `wine`) and
 * opens its note when there is one.
 */
interface KeepsakeSectionHeadingProps {
  section: KeepsakeSection
  grouping: KeepsakesGrouping
  onOpenSubject: (notePath: string, event: NewWindowClickEvent) => void
}

function KeepsakeSectionHeading({
  section,
  grouping,
  onOpenSubject,
}: KeepsakeSectionHeadingProps): ReactElement {
  if (grouping === 'month') {
    return (
      <h2 className="mb-1 text-xs font-medium tracking-wide text-text-muted uppercase">
        {section.label}
      </h2>
    )
  }
  const { notePath } = section
  return (
    <h2 className="mb-1 text-[13px] font-medium text-text-secondary">
      {notePath === null ? (
        <span className={section.subjectKey === null ? 'text-text-muted' : undefined}>
          {section.label}
        </span>
      ) : (
        <button
          type="button"
          onClick={(event) => onOpenSubject(notePath, event)}
          className="cursor-pointer transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none"
        >
          {section.label}
        </button>
      )}
    </h2>
  )
}

/**
 * The empty box says what it is for, once, and then says nothing ever again —
 * no prompts, no progress, no suggestion that something is missing.
 */
function KeepsakesEmpty(): ReactElement {
  return (
    <p className="max-w-[46ch] text-sm leading-relaxed text-text-muted">
      Nothing kept yet. When a line in a note is worth more than the day it was
      written on, press <span className="font-medium text-text-secondary">⌘⇧B</span> on it —
      or select a few lines to keep them together. It will be here whenever you
      want to look.
    </p>
  )
}
