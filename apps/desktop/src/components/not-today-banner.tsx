import type { ReactElement } from "react";
import { CalendarX2 } from "lucide-react";
import { InlineAlert } from "@/components/inline-alert";
import { ShortcutKeys } from "@/components/shortcut-keys";
import { keybindingFor } from "@/lib/commands/app-commands";

interface NotTodayBannerProps {
  /** Take the canvas to today's note. */
  onGoToday: () => void;
}

/**
 * The warning above a daily note that isn't today's: in flow, above the text,
 * for as long as the canvas shows another day — so a day opened to look
 * something up (or left on screen overnight) can't be mistaken for today
 * before anything is written into it. One click, or ⌘D, goes home.
 */
export function NotTodayBanner({
  onGoToday,
}: NotTodayBannerProps): ReactElement {
  const todayBinding = keybindingFor("nav.today");
  return (
    <InlineAlert className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2">
        <CalendarX2
          aria-hidden
          strokeWidth={1.75}
          className="size-4 shrink-0"
        />
        This isn’t today’s note.
      </span>
      <button
        type="button"
        onClick={onGoToday}
        className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 font-medium transition-colors duration-100 hover:bg-amber-500/15"
      >
        Go to today
        {todayBinding !== null ? (
          <ShortcutKeys binding={todayBinding} ghost className="opacity-70" />
        ) : null}
      </button>
    </InlineAlert>
  );
}
