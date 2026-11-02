import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { PanelItem } from '@/components/ui/panel-item'

interface Props {
  open: boolean
  showJointNames: boolean
  showBoneNames: boolean
  showPartNames: boolean
  showPartLink: boolean
  jointRadius: number
  boneWidth: number
  fileAutosave: boolean
  maxHistory: number
  onChangeJointNames: (v: boolean) => void
  onChangeBoneNames: (v: boolean) => void
  onChangePartNames: (v: boolean) => void
  onChangePartLink: (v: boolean) => void
  onChangeJointRadius: (v: number) => void
  onChangeBoneWidth: (v: number) => void
  onToggleAutosave: () => void
  onChangeMaxHistory: (v: number) => void
  onCleanup: () => void
  cleanupText: string | null
  onClearClipboard: () => void
  clipboardText: string | null
  onClose: () => void
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      className="flex w-full items-center justify-between text-left text-[13px] text-text"
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-surface-active')}>
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
    </button>
  )
}

const SECTIONS = [
  { id: 'size', title: '尺寸' },
  { id: 'display', title: '显示' },
  { id: 'data', title: '保存与历史' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

export function SettingsDialog({
  open, showJointNames, showBoneNames, showPartNames, showPartLink, jointRadius, boneWidth, fileAutosave, maxHistory,
  onChangeJointNames, onChangeBoneNames, onChangePartNames, onChangePartLink, onChangeJointRadius, onChangeBoneWidth,
  onToggleAutosave, onChangeMaxHistory, onCleanup, cleanupText, onClearClipboard, clipboardText, onClose,
}: Props) {
  const [section, setSection] = useState<SectionId>('size')
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex h-[420px] w-[640px] flex-col overflow-hidden rounded-card bg-panel elevation-2"
        onClick={e => e.stopPropagation()}
      >
        <div className="relative flex h-11 shrink-0 items-center justify-between bg-background px-4">
          <span className="absolute left-1/2 -translate-x-1/2 text-[14px] font-medium text-text">设置</span>
          <button
            aria-label="关闭"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-danger-text hover:bg-[var(--red-4)]"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex w-[150px] shrink-0 flex-col gap-1 bg-background p-2">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={cn(
                  'h-8 rounded-inner px-2.5 text-left text-[13px] transition-colors',
                  section === s.id ? 'bg-surface font-medium text-text' : 'bg-surface/50 text-muted hover:bg-surface/80 hover:text-text',
                )}
              >
                {s.title}
              </button>
            ))}
          </div>

          <div className="min-w-0 flex-1 space-y-2 overflow-y-auto bg-panel px-4 py-3">
            {section === 'size' ? (
              <>
                <PanelItem>
                  <Slider label="关节大小" hint="所有关节的显示半径。3 细小 / 5 默认 / 10 粗大" value={jointRadius} min={3} max={10} step={1} digits={0} defaultValue={5} onChange={onChangeJointRadius} ticks />
                </PanelItem>
                <PanelItem>
                  <Slider label="骨骼线宽" hint="所有骨骼的线条粗细。3 纤细 / 5 默认 / 10 粗壮" value={boneWidth} min={3} max={10} step={1} digits={0} defaultValue={5} onChange={onChangeBoneWidth} ticks />
                </PanelItem>
              </>
            ) : null}

            {section === 'display' ? (
              <>
                <PanelItem><Switch checked={showJointNames} onChange={onChangeJointNames} label="悬停显示关节名称" /></PanelItem>
                <PanelItem><Switch checked={showBoneNames} onChange={onChangeBoneNames} label="悬停显示骨骼名称" /></PanelItem>
                <PanelItem><Switch checked={showPartNames} onChange={onChangePartNames} label="悬停显示部件名称" /></PanelItem>
                <PanelItem><Switch checked={showPartLink} onChange={onChangePartLink} label="显示部件与骨骼的关系线" /></PanelItem>
              </>
            ) : null}

            {section === 'data' ? (
              <>
                <PanelItem><Switch checked={fileAutosave} onChange={() => onToggleAutosave()} label="自动保存" /></PanelItem>
                <PanelItem>
                  <Slider
                    label="最大撤销次数"
                    hint="撤回栈上限。10 步省空间 / 50 默认 / 300 能退很远"
                    value={maxHistory}
                    min={10}
                    max={300}
                    step={10}
                    digits={0}
                    defaultValue={50}
                    onChange={onChangeMaxHistory}
                  />
                </PanelItem>
                <PanelItem>
                  <div className="flex gap-2">
                    <button
                      onClick={onCleanup}
                      className="h-8 flex-1 rounded-inner bg-panel text-[13px] text-text hover:bg-surface-hover"
                    >
                      清理历史缓存
                    </button>
                    <button
                      onClick={onClearClipboard}
                      className="h-8 flex-1 rounded-inner bg-panel text-[13px] text-text hover:bg-surface-hover"
                    >
                      清理复制历史
                    </button>
                  </div>
                  {cleanupText ? <div className="mt-2 text-[12px] text-muted">{cleanupText}</div> : null}
                  {clipboardText ? <div className="text-[12px] text-muted">{clipboardText}</div> : null}
                </PanelItem>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
