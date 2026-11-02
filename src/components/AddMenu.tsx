import { useState } from 'react'
import { Plus } from 'lucide-react'
import { IconButton } from '@/components/ui/button'

interface Props {
  onAddJoint: () => void
  onAddBone: () => void
}

/** 加号按钮：点开后向左下展开一个两项的饼状菜单 */
export function AddMenu({ onAddJoint, onAddBone }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <IconButton label="添加" active={open} onClick={() => setOpen(v => !v)}>
        <Plus size={18} />
      </IconButton>

      {open ? (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <button
            className="absolute z-[70] flex h-9 items-center gap-1.5 rounded-full bg-panel px-3 text-[12px] text-text elevation-2 hover:bg-surface-hover"
            style={{ left: -66, top: 26 }}
            onClick={() => {
              onAddJoint()
              setOpen(false)
            }}
          >
            关节
          </button>
          <button
            className="absolute z-[70] flex h-9 items-center gap-1.5 rounded-full bg-panel px-3 text-[12px] text-text elevation-2 hover:bg-surface-hover"
            style={{ left: -18, top: 52 }}
            onClick={() => {
              onAddBone()
              setOpen(false)
            }}
          >
            骨骼
          </button>
        </>
      ) : null}
    </div>
  )
}

