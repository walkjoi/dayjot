/**
 * AvatarProps — circular identity chip.
 */
export interface AvatarProps {
  /** Photo URL. Falls back to initials from `name`. */
  src?: string
  name?: string
  /** Diameter in px. Default 32. */
  size?: number
  /** Render DayJot's small round graph-color dot in this hex instead. */
  graphColor?: string
  style?: React.CSSProperties
}
