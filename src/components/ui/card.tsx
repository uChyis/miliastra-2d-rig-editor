import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface CardProps {
  title: string
  children: ReactNode
  className?: string
}

/** 面板分组：无边框、靠间距与背景分层，圆角与内部控件同心 */
export function Card({ title, children, className }: CardProps) {
  return (
    <section className={cn('px-4 py-3', className)}>
      <h2 className="mb-2.5 text-[12px] font-medium uppercase tracking-[0.06em] text-muted">{title}</h2>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}
