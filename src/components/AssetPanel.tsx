import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RigDoc } from '@/rig/types'

type Kind = 'joint' | 'bone' | 'part'

interface Props {
  doc: RigDoc
  open: boolean
  onToggle: () => void
  onPick: (kind: Kind, id: string) => void
}

const FILTERS: Array<{ key: 'all' | Kind; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'joint', label: '关节' },
  { key: 'bone', label: '骨骼' },
  { key: 'part', label: '部件' },
]

export function AssetPanel({ doc, open, onToggle, onPick }: Props) {
  const [filter, setFilter] = useState<'all' | Kind>('all')
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (name: string) => !q || name.toLowerCase().includes(q)
    const list: Array<{ kind: Kind; id: string; name: string }> = []

    if (filter === 'all' || filter === 'joint') {
      doc.joints.forEach(j => {
        if (match(j.name)) list.push({ kind: 'joint', id: j.id, name: j.name })
      })
    }
    if (filter === 'all' || filter === 'bone') {
      doc.bones.forEach(b => {
        if (match(b.name)) list.push({ kind: 'bone', id: b.id, name: b.name })
      })
    }
    if (filter === 'all' || filter === 'part') {
      doc.parts.forEach(p => {
        if (match(p.name)) list.push({ kind: 'part', id: p.id, name: p.name })
      })
    }
    return list
  }, [doc, filter, query])

  if (!open) {
    return (
      <div className="absolute left-2 top-2 z-[20] flex items-start">
        <button
          onClick={onToggle}
          className="ml-2 mt-2 flex h-9 w-9 items-center justify-center rounded-control bg-panel text-muted elevation-2 hover:text-text"
          title="展开资产栏"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    )
  }

  return (
    <div className="absolute bottom-2 left-2 top-2 z-[20] flex w-[248px] flex-col overflow-hidden rounded-card bg-panel elevation-2">
      <div className="flex items-center gap-1 px-2 pb-1 pt-2">
        <div className="text-[12px] text-muted">资产</div>
        <button
          onClick={onToggle}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-control text-muted hover:bg-surface hover:text-text"
          title="折叠资产栏"
        >
          <ChevronLeft size={15} />
        </button>
      </div>

      <div className="px-2 pb-1">
        <div className="flex h-7 items-center gap-1 rounded-control bg-surface px-2">
          <Search size={13} className="text-muted" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索名称"
            className="h-full w-full bg-transparent text-[12px] text-text outline-none placeholder:text-muted"
          />
        </div>
      </div>

      <div className="mx-2 mb-1 flex rounded-control bg-surface p-1">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'h-6 flex-1 rounded-control text-[12px] transition-colors',
              filter === f.key ? 'bg-panel text-text' : 'text-muted hover:text-text',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {rows.length === 0 ? (
          <p className="px-2 py-3 text-[12px] text-muted">没有匹配的资产</p>
        ) : (
          rows.map(r => (
            <button
              key={r.kind + r.id}
              onClick={() => onPick(r.kind, r.id)}
              className="flex h-7 w-full items-center gap-2 rounded-inner px-2 text-left text-[12px] text-muted hover:bg-surface hover:text-text"
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  r.kind === 'joint' ? 'bg-[var(--slate-12)]' : r.kind === 'bone' ? 'bg-[var(--blue-9)]' : 'bg-[var(--violet-9)]',
                )}
              />
              <span className="truncate">{r.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
