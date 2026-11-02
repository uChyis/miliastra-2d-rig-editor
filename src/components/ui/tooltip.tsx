import { useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  label: ReactNode
  children: ReactNode
  className?: string
}

const BASE =
  'pointer-events-none fixed z-[200] max-w-[260px] -translate-x-1/2 whitespace-normal rounded-inner bg-surface-active px-2.5 py-1.5 text-[12px] leading-[16px] text-text shadow-lg'

export function Tooltip({ label, children, className }: TooltipProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null)

  const show = () => {
    const r = ref.current?.getBoundingClientRect()
    if (r) {
      const below = r.top < 64
      setPos({ x: r.left + r.width / 2, y: below ? r.bottom + 6 : r.top - 6, below })
    }
  }

  return (
    <span
      ref={ref}
      className={'inline-flex ' + (className ?? '')}
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
      onFocus={show}
      onBlur={() => setPos(null)}
    >
      {children}
      {pos
        ? createPortal(
            <span className={BASE + (pos.below ? '' : ' -translate-y-full')} style={{ left: pos.x, top: pos.y }}>
              {label}
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}

