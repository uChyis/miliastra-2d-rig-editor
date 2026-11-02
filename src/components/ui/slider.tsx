import { useState, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { Tooltip } from './tooltip'

interface SliderProps {
  label: string
  hint?: ReactNode
  value: number
  min: number
  max: number
  step?: number
  digits?: number
  defaultValue?: number
  onChange: (v: number) => void
  disabled?: boolean
  ticks?: boolean
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export function Slider({
  label, hint, value, min, max, step = 0.01, digits, defaultValue, onChange, disabled, ticks,
}: SliderProps) {
  const d = digits ?? (step >= 1 ? 0 : 2)
  const [draft, setDraft] = useState<string | null>(null)
  const display = draft ?? value.toFixed(d)
  const dirty = defaultValue !== undefined && Math.abs(value - defaultValue) > 1e-9
  const tickCount = ticks && step === 1 ? max - min + 1 : 0

  const commit = (raw: string) => {
    const n = Number(raw)
    setDraft(null)
    if (!Number.isFinite(n)) return
    onChange(clamp(n, min, max))
  }

  const labelNode = <span className="cursor-default text-[13px] text-muted">{label}</span>

  return (
    <div className={disabled ? 'opacity-40' : undefined}>
      <div className="mb-1 flex h-7 items-center gap-1">
        <div className="min-w-0 flex-1">
          {hint ? <Tooltip label={hint}>{labelNode}</Tooltip> : labelNode}
        </div>
        {defaultValue !== undefined ? (
          <button
            aria-label="恢复默认值"
            disabled={!dirty}
            onClick={() => onChange(defaultValue)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted transition-opacity hover:bg-surface-hover hover:text-text disabled:pointer-events-none disabled:opacity-0"
          >
            <RotateCcw size={13} />
          </button>
        ) : null}
        <input
          className="h-7 w-[56px] shrink-0 rounded-inner bg-surface text-center text-[12px] tabular-nums text-text outline-none focus:ring-1 focus:ring-primary/60"
          value={display}
          disabled={disabled}
          inputMode="decimal"
          onChange={e => setDraft(e.target.value)}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              commit((e.target as HTMLInputElement).value)
              ;(e.target as HTMLInputElement).blur()
            }
            if (e.key === 'Escape') setDraft(null)
          }}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={e => onChange(clamp(Number(e.target.value), min, max))}
      />
      {tickCount ? (
        <div className="pointer-events-none -mt-1 flex items-center justify-between px-[7px]">
          {Array.from({ length: tickCount }, (_, i) => (
            <span key={i} className="h-1 w-1 rounded-full bg-surface-active" />
          ))}
        </div>
      ) : null}
    </div>
  )
}
