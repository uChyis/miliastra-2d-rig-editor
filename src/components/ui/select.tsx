import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export interface Option {
  value: string
  label: string
}

interface SelectProps {
  value: string
  options: Option[]
  onChange: (value: string) => void
  className?: string
  up?: boolean
}

/** 圆角下拉：受控、点击外部关闭，避免原生 select 的直角弹层 */
export function Select({ value, options, onChange, className, up }: SelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const current = options.find(o => o.value === value) ?? options[0]

  return (
    <div ref={ref} className={'relative ' + (className ?? '')}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex h-9 w-full items-center gap-2 rounded-control bg-surface px-3 text-[13px] text-text hover:bg-surface-hover"
      >
        <span className="flex-1 text-left">{current?.label}</span>
        <ChevronDown
          size={15}
          className={
            'text-muted transition-transform' +
            (up ? (open ? ' rotate-0' : ' rotate-180') : open ? ' rotate-180' : '')
          }
        />
      </button>

      {open ? (
        <div
          className={
            up
              ? 'absolute bottom-11 left-0 z-50 w-full overflow-hidden rounded-card bg-panel p-1 elevation-2'
              : 'absolute left-0 top-11 z-50 w-full overflow-hidden rounded-card bg-panel p-1 elevation-2'
          }
        >
          {options.map(o => (
            <button
              key={o.value}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
              className="flex h-8 w-full items-center gap-2 rounded-inner px-2.5 text-left text-[13px] text-text hover:bg-surface-hover"
            >
              <span className="flex-1">{o.label}</span>
              {o.value === value ? <Check size={14} className="text-primary" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

