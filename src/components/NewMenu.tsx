import { Plus } from 'lucide-react'

interface Props {
  onNew: () => void
  disabled?: boolean
}

/** 新建骨架：带图标文本的下拉按钮 */
export function NewMenu({ onNew, disabled }: Props) {
  return (
    <button
      disabled={disabled}
      title={disabled ? '最多同时打开 6 个标签' : '新建一个空白工程'}
      onClick={() => onNew()}
      className="flex h-8 items-center gap-1.5 rounded-control bg-primary px-2.5 text-[13px] text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Plus size={16} />
      <span>新建工程</span>
    </button>
  )
}
