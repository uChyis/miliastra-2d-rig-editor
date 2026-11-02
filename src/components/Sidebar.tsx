import { useEffect, useState } from 'react'
import type { Bone, Part, RigDoc, SceneElement } from '@/rig/types'
import { Slider } from '@/components/ui/slider'
import { AnglePreview } from '@/components/AnglePreview'
import { Select } from '@/components/ui/select'
import { Trash2 } from 'lucide-react'
import type { TemplateKey } from '@/rig/templates'
import { cn } from '@/lib/utils'

interface Props {
  doc: RigDoc
  selectedJoints: string[]
  selectedBones: string[]
  selectedParts: string[]
  onSelectParts: (ids: string[]) => void
  lastPicked: 'joint' | 'bone'
  onParam: (key: keyof RigDoc['params'], value: number) => void
  onUpdateBone: (id: string, patch: Partial<Bone>) => void
  onUpdateAllBones: (patch: Partial<Bone>) => void
  disabled: boolean
  onRenameJoint: (id: string, name: string) => void
  onApplyPreset: (key: TemplateKey) => void
  onBindPart: (id: string, boneId: string | null) => void
  pickingBoneFor: string | null
  onStartPickBone: (partId: string) => void
  onCancelPickBone: () => void
  onAddPartFromScene: (boneId: string, name: string, scene: { width: number; height: number; elements: SceneElement[] }) => void
  onUpdatePart: (id: string, patch: Partial<Part>) => void
  onRemovePart: (id: string) => void
  onCapturePose: (name?: string) => void
  onApplyPose: (id: string) => void
  onRemovePose: (id: string) => void
}

const HINTS = {
  gravity: '整个模拟世界的重力。0 失重 / 0.25 月球 / 0.5 轻飘 / 1 标准（约 2000 px/s²）',
  solver: '每帧约束求解次数。3 会明显拉长 / 8 默认 / 16 很稳但更耗性能',
  restitution: '地面回弹。0 落地即停 / 0.2 轻微弹 / 0.6 有明显弹跳 / 1 几乎不损失能量',
  width: '骨的视觉粗细。6 细线 / 12 常规 / 20 粗壮',
  limit: '相对父骨的夹角，单位度。0 表示与父骨方向一致；正值向一侧弯，负值向另一侧。上下限相等表示不限制。例：膝盖设 0~150，向后弯就会被挡住',
}

export function Sidebar({
  doc, selectedJoints, selectedBones, selectedParts, onSelectParts, lastPicked, onParam, onUpdateBone, onUpdateAllBones, onRenameJoint, onApplyPreset, onBindPart, pickingBoneFor, onStartPickBone, onCancelPickBone, onAddPartFromScene, onUpdatePart, onRemovePart, onCapturePose, onApplyPose, onRemovePose, disabled,
}: Props) {
  const [tab, setTab] = useState<'world' | 'joint' | 'bone' | 'part' | 'pose'>('world')

  // 选中什么就自动切到对应标签；多选时跟随最后一次选择的类型
  useEffect(() => {
    const hasJoints = selectedJoints.length > 0
    const hasBones = selectedBones.length > 0
    if (!hasJoints && !hasBones) {
      setTab('world')
      return
    }
    setTab(lastPicked === 'bone' ? 'bone' : 'joint')
  }, [selectedJoints, selectedBones, lastPicked])
  const bone = doc.bones.find(b => selectedBones.includes(b.id))

  const boneAngle = (target: Bone) => {
    const a = doc.joints.find(j => j.id === target.a)
    const b = doc.joints.find(j => j.id === target.b)
    if (!a || !b) return 0
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
  }

  const parentBone = bone ? doc.bones.find(b => b.id === bone.parent) : undefined
  const relAngle = bone ? (parentBone ? boneAngle(bone) - boneAngle(parentBone) : boneAngle(bone)) : 0

  const parentCandidates = bone
    ? doc.bones.filter(
        b => b.id !== bone.id && (b.a === bone.a || b.b === bone.a || b.a === bone.b || b.b === bone.b),
      )
    : []
  const parentOptions = [
    { value: '', label: '无' },
    ...parentCandidates.map(b => ({ value: b.id, label: b.name })),
  ]
  const joint = doc.joints.find(j => selectedJoints.includes(j.id))
  useEffect(() => {
    if (selectedParts.length) {
      setTab('part')
      return
    }
    if (!selectedJoints.length && !selectedBones.length) setTab('world')
  }, [selectedParts, selectedJoints, selectedBones])

  const part = doc.parts.find(p => selectedParts.includes(p.id)) ?? doc.parts[0]
  const boneOptions = [
    { value: '', label: '未绑定' },
    ...doc.bones.map(b => ({ value: b.id, label: b.name })),
  ]

  return (
    <aside className="flex w-[272px] shrink-0 flex-col overflow-y-auto bg-panel pb-2 pt-4 shadow-[-2px_0_8px_rgb(0_0_0_/_0.10)]">

      <div className="mx-4 mb-3 flex rounded-control bg-surface p-1">
        {(['world', 'joint', 'bone', 'part', 'pose'] as const).map(key => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'h-8 flex-1 rounded-control text-[12px] transition-colors',
              tab === key ? 'bg-panel text-text shadow-sm' : 'text-muted hover:text-text',
            )}
          >
            {key === 'world' ? '世界' : key === 'joint' ? '关节' : key === 'bone' ? '骨骼' : key === 'part' ? '部件' : '姿势'}
          </button>
        ))}
      </div>

      <div className="space-y-3 px-4 pb-6">
        {tab === 'world' && (
          <>
            <Slider label="重力" hint={HINTS.gravity} value={doc.params.gravity} min={0} max={1} step={0.01} defaultValue={0} onChange={v => onParam('gravity', v)} disabled={disabled} />
            <Slider label="求解迭代" hint={HINTS.solver} value={doc.params.solverIterations} min={1} max={20} step={1} digits={0} defaultValue={8} onChange={v => onParam('solverIterations', v)} disabled={disabled} />
            <Slider label="地面弹性" hint={HINTS.restitution} value={doc.params.restitution} min={0} max={1} step={0.01} defaultValue={0.2} onChange={v => onParam('restitution', v)} disabled={disabled} />
            <p className="text-[12px] leading-5 text-muted">
              「地面摩擦」「拖拽力」当前求解器没有使用，已从面板移除（数据字段保留，老工程照常打开）。
            </p>
          </>
        )}

        {tab === 'joint' && (
          joint ? (
            <>
              <div className="space-y-1">
                <div className="text-[12px] text-muted">名称</div>
                <input
                  className="h-8 w-full rounded-inner bg-surface px-2.5 text-[13px] text-text outline-none focus:ring-1 focus:ring-primary/60"
                  value={joint.name}
                  onChange={e => onRenameJoint(joint.id, e.target.value)}
                />
              </div>
              <div className="rounded-inner bg-surface px-3 py-2 text-[12px] text-muted">
                <div className="tabular-nums">x {joint.x.toFixed(0)} · y {joint.y.toFixed(0)}</div>
                <div>{joint.pinned ? '固定关节' : '自由关节'}</div>
              </div>
            </>
          ) : (
            <p className="text-[12px] text-muted">未选择关节</p>
          )
        )}

        {tab === 'pose' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[12px] text-muted">姿势 <span className="tabular-nums">{doc.poses.length}</span> 个</div>
              <button
                disabled={disabled || doc.joints.length === 0}
                onClick={() => onCapturePose()}
                className="h-7 rounded-control bg-surface px-2 text-[12px] text-text hover:bg-surface-hover disabled:opacity-40"
              >
                记录当前
              </button>
            </div>

            {doc.poses.length === 0 ? (
              <p className="text-[12px] text-muted">摆好姿势后点「记录当前」，之后可随时切回</p>
            ) : (
              <div className="space-y-1">
                {doc.poses.map(pose => (
                  <div key={pose.id} className="flex items-center gap-1 rounded-inner bg-surface px-2 py-1">
                    <button
                      onClick={() => onApplyPose(pose.id)}
                      className="h-6 flex-1 truncate text-left text-[12px] text-text hover:text-primary-text"
                    >
                      {pose.name}
                    </button>
                    <button
                      onClick={() => onRemovePose(pose.id)}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-surface-hover hover:text-danger-text"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'part' && (
          <div className="space-y-2">
            {doc.parts.length === 0 ? (
              <p className="text-[12px] text-muted">从顶栏「导入 → 矢量稿 JSON」添加，再绑定到骨骼</p>
            ) : !part ? (
              <p className="text-[12px] text-muted">在画布中选择一个部件</p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="truncate text-[12px] text-muted">{part.name}</div>
                  {selectedParts.length > 1 ? (
                    <div className="shrink-0 text-[12px] text-muted">已选 {selectedParts.length} 个</div>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-muted">绑定骨骼</span>
                    {pickingBoneFor === part.id ? (
                      <button
                        onClick={onCancelPickBone}
                        className="h-6 rounded-control bg-surface px-2 text-[12px] text-text hover:bg-surface-hover"
                      >
                        取消拾取
                      </button>
                    ) : (
                      <button
                        disabled={disabled || doc.bones.length === 0}
                        onClick={() => onStartPickBone(part.id)}
                        className="h-6 rounded-control bg-surface px-2 text-[12px] text-text hover:bg-surface-hover disabled:opacity-40"
                      >
                        画布拾取
                      </button>
                    )}
                  </div>
                  <Select
                    value={part.bone ?? ''}
                    options={boneOptions}
                    onChange={v => onBindPart(part.id, v || null)}
                  />
                  {pickingBoneFor === part.id ? (
                    <div className="text-[12px] text-muted">点画布上的骨骼完成绑定</div>
                  ) : null}
                </div>

                <div className="text-[12px] text-muted">{part.bone ? '相对骨骼' : '自由摆放'}</div>
                <div className="space-y-2 rounded-inner bg-surface p-2.5">
                  {part.bone ? (
                    <>
                      <Slider label="偏移 X" hint="沿骨方向的偏移，0 表示骨中点" value={part.offsetX} min={-300} max={300} step={1} digits={0} defaultValue={0} onChange={v => onUpdatePart(part.id, { offsetX: v })} disabled={disabled} />
                      <Slider label="偏移 Y" hint="垂直骨方向的偏移" value={part.offsetY} min={-300} max={300} step={1} digits={0} defaultValue={0} onChange={v => onUpdatePart(part.id, { offsetY: v })} disabled={disabled} />
                    </>
                  ) : (
                    <>
                      <Slider label="坐标 X" hint="画布坐标；也可以直接在画布上拖动部件" value={part.x} min={0} max={1600} step={1} digits={0} onChange={v => onUpdatePart(part.id, { x: v })} disabled={disabled} />
                      <Slider label="坐标 Y" hint="画布坐标" value={part.y} min={0} max={1200} step={1} digits={0} onChange={v => onUpdatePart(part.id, { y: v })} disabled={disabled} />
                    </>
                  )}
                  <Slider label="缩放" hint="整体缩放倍数。0.5 一半 / 1 原尺寸 / 2 两倍" value={part.scale} min={0.1} max={4} step={0.05} digits={2} defaultValue={1} onChange={v => onUpdatePart(part.id, { scale: v })} disabled={disabled} />
                  <Slider label="旋转" hint="度。绑定后叠加在骨的角度上" value={part.rotation} min={-180} max={180} step={1} digits={0} defaultValue={0} onChange={v => onUpdatePart(part.id, { rotation: v })} disabled={disabled} />
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'bone' && doc.bones.length === 0 ? (
          <div className="space-y-2">
            <p className="text-[12px] text-muted">当前还没有骨架，可以从预设开始：</p>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                ['human', '人形'],
                ['quad', '四足'],
                ['chain', '单链'],
              ] as Array<[TemplateKey, string]>).map(([key, label]) => (
                <button
                  key={key}
                  disabled={disabled}
                  onClick={() => onApplyPreset(key)}
                  className="h-8 rounded-control bg-surface text-[13px] text-text hover:bg-surface-hover disabled:opacity-40"
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[12px] text-muted">也可以右键画布，逐个添加关节或骨骼。</p>
          </div>
        ) : tab === 'bone' && (
          bone ? (
            <>
              <div className="rounded-inner bg-surface px-3 py-2 text-[12px] leading-5 text-muted">
                质量 / 摩擦 / 弹性 / 阻尼 目前没有参与求解，已从面板移除；数据字段保留，已有工程不受影响。
              </div>

          <div className="space-y-2 rounded-inner bg-surface p-2.5">
              <div className="text-[12px] text-muted">私有属性</div>
              <button
                onClick={() => onUpdateBone(bone.id, { ik: !bone.ik })}
                disabled={disabled || !bone.parent}
                className="flex w-full items-center justify-between rounded-inner bg-surface px-2.5 py-2 text-left text-[13px] text-text disabled:opacity-40"
              >
                <span>IK 末端</span>
                <span className={bone.ik ? 'h-4 w-4 rounded-full bg-primary' : 'h-4 w-4 rounded-full bg-surface-active'} />
              </button>
<div className="my-1 h-px bg-outline" />
              <div className="space-y-1.5">
                <div className="text-[12px] text-muted">父骨骼（角度参照）</div>
                <Select
                  value={bone.parent ?? ''}
                  options={parentOptions}
                  onChange={v => onUpdateBone(bone.id, { parent: v || undefined })}
                />
              </div>

              <AnglePreview lower={bone.limitLower} upper={bone.limitUpper} current={relAngle} />
              <Slider label="角度下限" hint={HINTS.limit} value={bone.limitLower} min={-180} max={180} step={1} digits={0} defaultValue={0} onChange={v => onUpdateBone(bone.id, { limitLower: v, limitUpper: Math.max(v, bone.limitUpper) })} disabled={disabled} />
              <Slider label="角度上限" hint={HINTS.limit} value={bone.limitUpper} min={-180} max={180} step={1} digits={0} defaultValue={0} onChange={v => onUpdateBone(bone.id, { limitUpper: v, limitLower: Math.min(v, bone.limitLower) })} disabled={disabled} />

              <div className="my-1 h-px bg-outline" />

              <div className="space-y-1.5">
                <div className="text-[12px] text-muted">限制方式</div>
                <div className="flex rounded-inner bg-surface p-0.5">
                  {([
                    ['hard', '硬止挡'],
                    ['soft', '软回弹'],
                    ['none', '不限'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      disabled={disabled}
                      onClick={() => onUpdateBone(bone.id, { limitMode: value })}
                      className={
                        (bone.limitMode ?? 'hard') === value
                          ? 'h-7 flex-1 rounded-inner bg-panel text-[12px] text-text'
                          : 'h-7 flex-1 rounded-inner text-[12px] text-muted hover:text-text'
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {(bone.limitMode ?? 'hard') === 'soft' ? (
                <Slider
                  label="回弹频率"
                  hint="Hz。越低越软，越高越接近硬止挡"
                  value={bone.stiffness ?? 3}
                  min={0.5}
                  max={10}
                  step={0.5}
                  digits={1}
                  defaultValue={3}
                  onChange={v => onUpdateBone(bone.id, { stiffness: v })}
                  disabled={disabled}
                />
              ) : null}
            </div>
</>
          ) : (
            <p className="text-[12px] text-muted">未选择骨骼</p>
          )
        )}
      </div>
    </aside>
  )
}










