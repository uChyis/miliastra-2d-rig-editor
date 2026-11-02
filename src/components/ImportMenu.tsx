import { useRef, useState } from 'react'
import { ChevronDown, FileJson, Image, Upload } from 'lucide-react'

interface Props {
  onImportRig: (file: File) => void
  onImportScenes: (files: File[]) => void
}

/** 导入下拉：带图标与文本 */
export function ImportMenu({ onImportRig, onImportScenes }: Props) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const sceneRef = useRef<HTMLInputElement>(null)

  const item =
    'flex h-8 w-full items-center gap-2 rounded-inner px-2 text-left text-[13px] text-text hover:bg-surface-hover'

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex h-8 items-center gap-1.5 rounded-control bg-surface px-2.5 text-[13px] text-text hover:bg-surface-hover"
      >
        <Upload size={16} className="text-muted" />
        <span>导入</span>
        <ChevronDown size={14} className={open ? 'rotate-180 text-muted transition-transform' : 'text-muted transition-transform'} />
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={e => {
          const f = e.target.files && e.target.files[0]
          if (f) onImportRig(f)
          e.target.value = ''
        }}
      />

      <input
        ref={sceneRef}
        type="file"
        multiple
        accept="application/json,.json"
        className="hidden"
        onChange={e => {
          const files = Array.from(e.target.files ?? [])
          const picked = files.filter(f => /rig|skeleton/i.test(f.name) === false)
          e.target.value = ''
          if (picked.length) onImportScenes(files)
        }}
      />

      {open ? (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-11 z-[70] w-[150px] overflow-hidden rounded-card bg-panel p-1 elevation-2">
            <button
              className={item}
              onClick={() => {
                setOpen(false)
                inputRef.current?.click()
              }}
            >
              <FileJson size={15} className="text-muted" />
              工程 JSON
            </button>
            <button
              className={item}
              onClick={() => {
                setOpen(false)
                sceneRef.current?.click()
              }}
            >
              <Image size={15} className="text-muted" />
              矢量稿 JSON
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
