import React from 'react'

/**
 * ButtonProps — DayJot's button primitive.
 *
 * @startingPoint section="Buttons" subtitle="Primary / secondary / white / text / space variants" viewport="700x140"
 */
export interface ButtonProps {
  /** Visual style. `primary` = solid indigo; `space` = glassmorphic marketing button. */
  variant?: 'primary' | 'secondary' | 'white' | 'text' | 'ghost' | 'space'
  /** `sm` (12px, 6/12 pad) or `md` (14px, 8/14 pad). Default `md`. */
  size?: 'sm' | 'md'
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  /** Element rendered before the label (e.g. a Lucide icon). */
  leadingIcon?: React.ReactNode
  /** Element rendered after the label. */
  trailingIcon?: React.ReactNode
  onClick?: () => void
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}
