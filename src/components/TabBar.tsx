import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  tabs: Array<{ id: string; name: string }>
  activeId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onRename: (id: string, name: string) => void
  onReorder: (fromId: string, toId: string) => void
}

export function TabBar({ tabs, activeId, onSelect, onClose, onRename, onReorder }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const commitRename = () => {
    if (editingId) {
      const name = draft.trim()
      if (name) onRename(editingId, name)
    }
    setEditingId(null)
  }

  return (
    <div className="relative z-[30] flex h-11 shrink-0 items-center gap-1 bg-background px-2 shadow-[0_3px_6px_-4px_rgb(0_0_0_/_0.4)]">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
        {tabs.map(tab => {
          const active = tab.id === activeId
          return (
            <div
              key={tab.id}
              draggable={editingId !== tab.id}
              onDragStart={() => setDragId(tab.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={e => {
                if (!dragId || dragId === tab.id) return
                e.preventDefault()
              }}
              onDrop={e => {
                e.preventDefault()
                if (dragId && dragId !== tab.id) onReorder(dragId, tab.id)
                setDragId(null)
              }}
              onClick={() => onSelect(tab.id)}
              onDoubleClick={() => {
                setEditingId(tab.id)
                setDraft(tab.name)
              }}
              className={cn(
                'group flex h-8 basis-[168px] shrink min-w-[92px] items-center justify-between gap-1.5 rounded-control px-3 text-[12px] transition-colors ' + (dragId === tab.id ? 'opacity-40 ' : ''),
                active
                  ? 'bg-surface font-medium text-text'
                  : 'bg-surface/70 text-muted hover:bg-surface hover:text-text',
              )}
            >
              {editingId === tab.id ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={e => setDraft(e.target.value.replace(/[\\/:*?"<>|]/g, '').slice(0, 24))}
                  onBlur={commitRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  className="h-5 w-[130px] rounded-inner bg-panel px-1 text-[12px] text-text outline-none"
                />
              ) : (
                <span className="truncate">{tab.name}</span>
              )}

              <button
                aria-label="关闭标签"
                onClick={e => {
                  e.stopPropagation()
                  onClose(tab.id)
                }}
                className="flex h-4 w-4 items-center justify-center rounded-full text-muted opacity-0 hover:bg-outline group-hover:opacity-100"
              >
                <X size={11} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
