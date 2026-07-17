import type { ReactElement } from 'react'
import { MarkdownView } from '@meowdown/react'
import type { WikilinkClickHandler } from '@meowdown/core'
import type { SnippetTask } from '@dayjot/core'
import { useOpenExternalLink } from '@/editor/open-external-link'
import { useSnippetTaskToggle } from '@/hooks/use-snippet-task-toggle'

interface BacklinkSnippetProps {
  /** The referencing block context's Markdown source (may span several lines). */
  text: string
  /** Graph-relative path of the source note the snippet was read from. */
  notePath: string
  /** The snippet's checkbox tasks anchored to the source note (query-provided). */
  tasks: SnippetTask[]
  /** Navigate a clicked `[[wiki link]]` to its target. Pass a stable function. */
  onWikilinkClick: WikilinkClickHandler
  /** Resolve `![…](…)` sources to displayable URLs. Pass a stable function. */
  resolveImageUrl: (src: string) => string | undefined
}

/**
 * One reference in the incoming-backlinks panel, rendered as rich text through
 * meowdown's editor-free `MarkdownView`: wiki links become the editor's
 * clickable chips and inline marks render instead of raw `[[…]]` / `**…**`
 * source. The context is a whole block (old DayJot's rules — a paragraph, the
 * containing list item with its children, or a heading's section), so it
 * renders unclamped: truncating would cut the nested structure the context
 * exists to show. Round `+ [ ]` task checkboxes are live — a click writes the
 * toggle through to the source note ({@link useSnippetTaskToggle}), old
 * DayJot's backlink-context behavior — while square GFM boxes stay read-only
 * (the `dayjot-backlink-snippet` CSS keeps them inert-looking). The
 * `dayjot-editor` class shares the editor's chip styling; the
 * `dayjot-backlink-snippet` wrapper keeps it in the panel's compact line box.
 */
export function BacklinkSnippet({
  text,
  notePath,
  tasks,
  onWikilinkClick,
  resolveImageUrl,
}: BacklinkSnippetProps): ReactElement {
  const onTaskClick = useSnippetTaskToggle(notePath, tasks)
  const openExternalLink = useOpenExternalLink()
  return (
    <div className="dayjot-backlink-snippet select-text text-xs text-text">
      <MarkdownView
        className="dayjot-editor"
        markdown={text}
        onWikilinkClick={onWikilinkClick}
        onLinkClick={openExternalLink}
        {...(onTaskClick ? { onTaskClick } : {})}
        resolveImageUrl={resolveImageUrl}
      />
    </div>
  )
}
