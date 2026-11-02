import { useState } from 'react'
import { ChevronDown, Download, FileCode2, FileJson } from 'lucide-react'

interface Props {
  onExportJson: () => void
  onExportLua: () => void
  disabled?: boolean
}

/** 导出下拉：带图标与文本 */
export function ExportMenu({ onExportJson, onExportLua, disabled }: Props) {
  const [open, setOpen] = useState(false)

  const item =
    'flex h-8 w-full items-center gap-2 rounded-inner px-2 text-left text-[13px] text-text hover:bg-surface-hover'

  return (
    <div className="relative">
      <button
        disabled={disabled}
        title={disabled ? '先新建或导入一个骨架' : undefined}
        onClick={() => setOpen(v => !v)}
        className="flex h-8 items-center gap-1.5 rounded-control bg-surface px-2.5 text-[13px] text-text hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Download size={16} className="text-muted" />
        <span>导出</span>
        <ChevronDown size={14} className={open ? 'rotate-180 text-muted transition-transform' : 'text-muted transition-transform'} />
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-11 z-[70] w-[150px] overflow-hidden rounded-card bg-panel p-1 elevation-2">
            <button
              className={item}
              onClick={() => {
                setOpen(false)
                onExportJson()
              }}
            >
              <FileJson size={15} className="text-muted" />
              工程 JSON
            </button>
            <button
              className={item}
              onClick={() => {
                setOpen(false)
                onExportLua()
              }}
            >
              <FileCode2 size={15} className="text-muted" />
              千星 Lua
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
