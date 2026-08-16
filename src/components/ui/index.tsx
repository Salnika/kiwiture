import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import './ui.css'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost'
  block?: boolean
}

export function Button({ variant = 'default', block, className, ...rest }: ButtonProps) {
  const classes = [
    'button',
    variant === 'primary' ? 'button--primary' : '',
    variant === 'ghost' ? 'button--ghost' : '',
    block ? 'button--block' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')
  return <button type="button" className={classes} {...rest} />
}

type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean
  children: ReactNode
}

/**
 * Toggle chip. The active state is announced via `aria-pressed` and doubled with
 * a visible checkmark, never carried by colour alone (spec 36).
 */
export function Chip({ active = false, children, className, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={['chip', className ?? ''].filter(Boolean).join(' ')}
      {...rest}
    >
      {active ? (
        <span className="chip__check" aria-hidden="true">
          ✓
        </span>
      ) : null}
      {children}
    </button>
  )
}

export function Banner({
  tone = 'info',
  title,
  children,
  icon,
}: {
  tone?: 'info' | 'warning' | 'error'
  title?: string
  children?: ReactNode
  icon?: string
}) {
  const defaultIcon = tone === 'error' ? '!' : tone === 'warning' ? '!' : 'i'
  return (
    <div className={`banner banner--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="banner__icon" aria-hidden="true">
        {icon ?? defaultIcon}
      </span>
      <div className="banner__body">
        {title ? <p className="banner__title">{title}</p> : null}
        {children}
      </div>
    </div>
  )
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={['input', props.className ?? ''].join(' ')} {...props} />
}

export function Tag({
  children,
  tone = 'muted',
}: {
  children: ReactNode
  tone?: 'muted' | 'free'
}) {
  return <span className={`tag tag--${tone}`}>{children}</span>
}

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<SegmentedOption<T>>
  value: T
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="segmented__option"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: string | number }) {
  return <div className="skeleton" style={{ height, width }} aria-hidden="true" />
}
