import React from 'react'

/**
 * IconButton — a square, chromeless icon target (sidebar nav arrows,
 * toolbar actions, audio record). Hover paints the translucent grey wash
 * DayJot uses across menus and list rows.
 */
export function IconButton({
  size = 28,
  active = false,
  disabled = false,
  label,
  onClick,
  className = '',
  style = {},
  children,
}) {
  const [hover, setHover] = React.useState(false)
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={className}
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--radius-md)',
        border: 'none',
        color: active ? 'var(--text)' : 'var(--text-secondary)',
        background: active || hover ? 'var(--surface-hover)' : 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background var(--duration-fast), color var(--duration-fast)',
        ...style,
      }}
    >
      {children}
    </button>
  )
}
