import { Component, type ErrorInfo, type ReactNode } from 'react'

interface StatsErrorBoundaryState {
  message: string | null
}

/**
 * Renders a Stats render-phase crash as readable text instead of unmounting
 * the whole workspace (the app has no root boundary, so an uncaught render
 * error is a full white screen). Stats is the one surface built on a third-
 * party charting library whose render path consumes arbitrary note-derived
 * data — the blast radius of a bad point must end at this screen.
 */
export class StatsErrorBoundary extends Component<
  { children: ReactNode },
  StatsErrorBoundaryState
> {
  override state: StatsErrorBoundaryState = { message: null }

  static getDerivedStateFromError(error: unknown): StatsErrorBoundaryState {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('stats render crash:', error, info.componentStack)
  }

  override render(): ReactNode {
    if (this.state.message !== null) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
          <p className="text-sm font-medium text-text">Stats couldn’t render</p>
          <p className="text-sm text-text-muted">{this.state.message}</p>
        </div>
      )
    }
    return this.props.children
  }
}
