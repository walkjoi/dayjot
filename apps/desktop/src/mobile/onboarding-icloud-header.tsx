import { type ReactElement } from 'react'
import { Cloud } from 'lucide-react'

interface OnboardingIcloudHeaderProps {
  description: string
}

export function OnboardingIcloudHeader({
  description,
}: OnboardingIcloudHeaderProps): ReactElement {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-text-secondary">
        <Cloud aria-hidden className="size-4" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="text-sm font-semibold">iCloud sync</h2>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
    </div>
  )
}
