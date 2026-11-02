import { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Line, Circle, Rect, Ellipse, RegularPolygon, Group } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { EditorMode, RigDoc } from '@/rig/types'
import type { RuntimeFrame } from '@/physics/verlet'

export interface View {
  x: number
  y: number
  scale: number
}

interface Props {
  width: number
  height: number
  doc: RigDoc
  mode: EditorMode
  frame: RuntimeFrame | null
  view: View
  theme: 'light' | 'dark'
  onViewChange: (v: View) => void
  selectedJoints: string[]
  selectedBones: string[]
  linkFrom: string | null
  onSetSelection: (joints: string[], bones: string[]) => void
  onPickJoint: (id: string) => void
  showJointNames: boolean
  showBoneNames: boolean
  showPartNames: boolean
  showPartLink: boolean
  pickingBoneFor: string | null
  onPickBone: (boneId: string) => void
  onMoveJoint: (id: string, x: number, y: number) => void
  onMoveJoints: (items: Array<{ id: string; x: number; y: number }>) => void
  onMovePart: (id: string, x: number, y: number) => void
  onSelectParts: (ids: string[]) => void
  onSetMultiSelection: (joints: string[], bones: string[], parts: string[]) => void
  onUpdatePartBox: (id: string, patch: { x?: number; y?: number; scale?: number; rotation?: number }) => void
  selectedParts: string[]
  onPlayDragStart: (jointId: string, x: number, y: number) => void
  onPlayDragMove: (x: number, y: number) => void
  onPlayDragEnd: () => void
  onBeginGesture: () => void
  onEndGesture: () => void
  onContextMenuAt: (x: number, y: number, wx: number, wy: number) => void
  onHoverName: (text: string | null, x: number, y: number) => void
  onPointerWorld: (x: number, y: number) => void
}

type DragKind = 'joint' | 'pan' | 'play' | 'band' | 'move' | 'part' | 'pbox'
interface DragState {
  kind: DragKind
  jointId?: string
  partId?: string
  startPart?: { x: number; y: number }
  startWorld?: { x: number; y: number }
  boxMode?: 'move' | 'scale' | 'rotate'
  items?: Array<{ id: string; x: number; y: number; scale: number; rotation: number }>
  center?: { x: number; y: number }
  startScreen: { x: number; y: number }
  startView: View
}

function readColors(theme: 'light' | 'dark') {
  const root = document.documentElement
  const had = root.classList.contains('dark')
  root.classList.toggle('dark', theme === 'dark')
  const cs = getComputedStyle(root)
  const v = (n: string) => cs.getPropertyValue(n).trim()
  const colors = {
    canvas: v('--canvas-bg'),
    grid: v('--canvas-grid'),
    ground: v('--slate-2'),
    groundLine: v('--slate-6'),
    bone: v('--blue-8'),
    boneSelected: v('--amber-9'),
    joint: v('--slate-12'),
    jointPinned: v('--amber-9'),
    jointSelected: v('--violet-9'),
    partFill: v('--violet-4'),
    partStroke: v('--violet-8'),
    jointStroke: v('--slate-1'),
    band: v('--blue-9'),
    label: v('--slate-11'),
  }
  root.classList.toggle('dark', had)
  return colors
}

export function StageCanvas({
  width, height, doc, mode, frame, view, theme, onViewChange,
  selectedJoints, selectedBones, linkFrom, onSetSelection, onPickJoint, onMoveJoint, onMoveJoints, onMovePart, onSelectParts, onSetMultiSelection, onUpdatePartBox, selectedParts,
  showJointNames, showBoneNames, showPartNames, showPartLink, pickingBoneFor, onPickBone,
  onPlayDragStart, onPlayDragMove, onPlayDragEnd, onBeginGesture, onEndGesture, onContextMenuAt, onHoverName, onPointerWorld,
}: Props) {
  const stageRef = useRef<Konva.Stage | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [colors, setColors] = useState(() => readColors(theme))
  const [band, setBand] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [panning, setPanning] = useState(false)
  const [groupAngle, setGroupAngle] = useState(0)
  const groupStartRef = useRef(0)
  const moveRef = useRef<{ start: { x: number; y: number }; items: Array<{ id: string; x: number; y: number }> } | null>(null)

  useEffect(() => {
    const id = requestAnimationFrame(() => setColors(readColors(theme)))
    return () => cancelAnimationFrame(id)
  }, [theme])

  const jointPos = (id: string): { x: number; y: number } | null => {
    if (mode === 'play' && frame) return frame.joints[id] ?? null
    const j = doc.joints.find(x => x.id === id)
    return j ? { x: j.x, y: j.y } : null
  }

  const worldPointer = () => {
    const stage = stageRef.current
    if (!stage) return { x: 0, y: 0 }
    return stage.getRelativePointerPosition() ?? { x: 0, y: 0 }
  }

  const screenPointer = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = stageRef.current
    if (!stage) return { x: 0, y: 0 }
    return stage.getPointerPosition() ?? { x: 0, y: 0 }
  }

  const nearestJoint = (p: { x: number; y: number }) => {
    let best: { id: string; d: number } | null = null
    for (const j of doc.joints) {
      const pos = jointPos(j.id)
      if (!pos) continue
      const d = Math.hypot(pos.x - p.x, pos.y - p.y)
      const hitR = Math.max(6 / view.scale, j.radius + 4 / view.scale)
      if (d < hitR && (!best || d < best.d)) best = { id: j.id, d }
    }
    return best?.id ?? null
  }

  const distToBone = (p: { x: number; y: number }, boneId: string) => {
    const bone = doc.bones.find(b => b.id === boneId)
    if (!bone) return Infinity
    const a = jointPos(bone.a)
    const c = jointPos(bone.b)
    if (!a || !c) return Infinity
    const vx = c.x - a.x
    const vy = c.y - a.y
    const len2 = vx * vx + vy * vy || 1
    let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2
    t = Math.max(0, Math.min(1, t))
    return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t))
  }

  /** 点在骨上比点在关节上更近时，优先选骨 */
  const isBoneCloser = (p: { x: number; y: number }, jointId: string, boneId: string) => {
    const j = doc.joints.find(x => x.id === jointId)
    const jp = j ? jointPos(j.id) : null
    if (!jp) return false
    return distToBone(p, boneId) < Math.hypot(p.x - jp.x, p.y - jp.y) - 2
  }

  const nearestBone = (p: { x: number; y: number }) => {
    let best: { id: string; d: number } | null = null
    for (const b of doc.bones) {
      const a = jointPos(b.a)
      const c = jointPos(b.b)
      if (!a || !c) continue
      const vx = c.x - a.x
      const vy = c.y - a.y
      const len2 = vx * vx + vy * vy || 1
      let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2
      t = Math.max(0, Math.min(1, t))
      const dx = p.x - (a.x + vx * t)
      const dy = p.y - (a.y + vy * t)
      const d = Math.hypot(dx, dy)
      const hitR = Math.max(b.width / 2 + 6 / view.scale, 10 / view.scale)
      if (d < hitR && (!best || d < best.d)) best = { id: b.id, d }
    }
    return best?.id ?? null
  }

  const handleDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const mouseEvt = e.evt as MouseEvent
    // 右键只出菜单，不参与选择
    if (mouseEvt && mouseEvt.button === 2) return
    if (mouseEvt && mouseEvt.button === 1) {
      // 中键：平移画布
      mouseEvt.preventDefault()
      dragRef.current = { kind: 'pan', startScreen: screenPointer(e), startView: view }
      setPanning(true)
      return
    }
    if (mode === 'play') {
      const world = worldPointer()
      const id = nearestJoint(world)
      if (id) {
        dragRef.current = { kind: 'play', jointId: id, startScreen: screenPointer(e), startView: view }
        onPlayDragStart(id, world.x, world.y)
      }
      return
    }

    const world = worldPointer()

    // 变换框：角点缩放、顶部圆点旋转、框内移动
    const boneHitId = nearestBone(world)
    const jid = nearestJoint(world)
    if (jid && (!boneHitId || !isBoneCloser(world, jid, boneHitId))) {
      const inSelection = selectedJoints.includes(jid)
      const ids = new Set<string>(selectedJoints)
      selectedBones.forEach(bid => {
        const bone = doc.bones.find(b => b.id === bid)
        if (bone) {
          ids.add(bone.a)
          ids.add(bone.b)
        }
      })
      if (inSelection && ids.size > 1) {
        const items = [...ids]
          .map(id => doc.joints.find(j => j.id === id))
          .filter((j): j is NonNullable<typeof j> => Boolean(j))
          .map(j => ({ id: j.id, x: j.x, y: j.y }))
        moveRef.current = { start: world, items }
        dragRef.current = { kind: 'move', startScreen: screenPointer(e), startView: view }
        onBeginGesture()
        return
      }
      dragRef.current = { kind: 'joint', jointId: jid, startScreen: screenPointer(e), startView: view }
      onBeginGesture()
      onPickJoint(jid)
      return
    }
    const bid = nearestBone(world)
    if (bid && pickingBoneFor) {
      onPickBone(bid)
      return
    }
    if (bid) {
      const bones = selectedBones.includes(bid) ? selectedBones : [bid]
      if (!selectedBones.includes(bid)) onSetSelection([], [bid])
      const ids = new Set<string>(selectedJoints)
      bones.forEach(id => {
        const bone = doc.bones.find(b => b.id === id)
        if (bone) {
          ids.add(bone.a)
          ids.add(bone.b)
        }
      })
      const items = [...ids]
        .map(id => doc.joints.find(j => j.id === id))
        .filter((j): j is NonNullable<typeof j> => Boolean(j))
        .map(j => ({ id: j.id, x: j.x, y: j.y }))
      if (items.length) {
        moveRef.current = { start: world, items }
        dragRef.current = { kind: 'move', startScreen: screenPointer(e), startView: view }
        onBeginGesture()
      }
      return
    }
    if (mode === 'edit' && partBox) {
      const tol = 10 / view.scale
      const r = (partBox.rot * Math.PI) / 180
      const dx = world.x - partBox.cx
      const dy = world.y - partBox.cy
      const lx = dx * Math.cos(-r) - dy * Math.sin(-r)
      const ly = dx * Math.sin(-r) + dy * Math.cos(-r)
      const hw = partBox.w / 2
      const hh = partBox.h / 2
      const center = { x: partBox.cx, y: partBox.cy }

      const items = selectedLooseParts.map(p2 => ({
        id: p2.id,
        x: p2.x,
        y: p2.y,
        scale: p2.scale ?? 1,
        rotation: p2.rotation,
      }))

      const startDrag = (boxMode: 'move' | 'scale' | 'rotate') => {
        groupStartRef.current = groupAngle
        dragRef.current = {
          kind: 'pbox',
          boxMode,
          startWorld: { x: world.x, y: world.y },
          startScreen: screenPointer(e),
          startView: view,
          items,
          center,
        }
        onBeginGesture()
      }

      const nearCorner = Math.abs(Math.abs(lx) - hw) <= tol && Math.abs(Math.abs(ly) - hh) <= tol
      if (nearCorner) {
        startDrag('scale')
        return
      }
      if (Math.hypot(lx, ly + hh + 24 / view.scale) <= tol) {
        startDrag('rotate')
        return
      }
      if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) {
        startDrag('move')
        return
      }
    }

    // 未绑定的图元可以被直接拖动摆放
    const loosePart = [...doc.parts]
      .sort((a, b) => b.z - a.z)
      .find(p2 => {
        if (p2.bone) return false
        const sc = p2.scale ?? 1
        const hw = (p2.width * sc) / 2 + 4 / view.scale
        const hh = (p2.height * sc) / 2 + 4 / view.scale
        return Math.abs(world.x - p2.x) <= hw && Math.abs(world.y - p2.y) <= hh
      })

    if (loosePart) {
      onSelectParts([loosePart.id])
      dragRef.current = {
        kind: 'part',
        partId: loosePart.id,
        startScreen: screenPointer(e),
        startView: view,
        startPart: { x: loosePart.x, y: loosePart.y },
        startWorld: { x: world.x, y: world.y },
      }
      onBeginGesture()
      return
    }

    // 已绑定的部件：点击即选中（不可拖动，位置由骨骼决定）
    const boundPart = [...doc.parts]
      .sort((a, b) => b.z - a.z)
      .find(p2 => {
        if (!p2.bone) return false
        const bb = doc.bones.find(b => b.id === p2.bone)
        const ja = bb ? jointPos(bb.a) : null
        const jb = bb ? jointPos(bb.b) : null
        if (!ja || !jb) return false
        const ang = Math.atan2(jb.y - ja.y, jb.x - ja.x)
        const cx = (ja.x + jb.x) / 2 + Math.cos(ang) * p2.offsetX - Math.sin(ang) * p2.offsetY
        const cy = (ja.y + jb.y) / 2 + Math.sin(ang) * p2.offsetX + Math.cos(ang) * p2.offsetY
        const sc = p2.scale ?? 1
        const hw = ((p2.sceneWidth ?? p2.width) * sc) / 2
        const hh = ((p2.sceneHeight ?? p2.height) * sc) / 2
        return Math.abs(world.x - cx) <= hw && Math.abs(world.y - cy) <= hh
      })

    if (boundPart) {
      onSelectParts([boundPart.id])
      return
    }

    // 左键拖拽空白处 = 框选
    dragRef.current = { kind: 'band', startScreen: screenPointer(e), startView: view }
    setBand({ x0: world.x, y0: world.y, x1: world.x, y1: world.y })
  }

  const handleMove = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const drag = dragRef.current
    if (!drag) return

    if (drag.kind === 'pan') {
      const s = screenPointer(e)
      onViewChange({
        ...drag.startView,
        x: drag.startView.x + (s.x - drag.startScreen.x),
        y: drag.startView.y + (s.y - drag.startScreen.y),
      })
      return
    }
    if (drag.kind === 'play') {
      const world = worldPointer()
      onPlayDragMove(world.x, world.y)
      return
    }
    if (drag.kind === 'joint' && drag.jointId) {
      const world = worldPointer()
      onMoveJoint(drag.jointId, world.x, world.y)
      return
    }
    if (drag.kind === 'pbox' && drag.items && drag.center && drag.startWorld) {
      const world = worldPointer()
      const c = drag.center
      if (drag.boxMode === 'move') {
        const dx = world.x - drag.startWorld.x
        const dy = world.y - drag.startWorld.y
        drag.items.forEach(it => onMovePart(it.id, it.x + dx, it.y + dy))
      } else if (drag.boxMode === 'scale') {
        const d0 = Math.hypot(drag.startWorld.x - c.x, drag.startWorld.y - c.y) || 1
        const d1 = Math.hypot(world.x - c.x, world.y - c.y)
        const k = Math.max(0.05, d1 / d0)
        drag.items.forEach(it =>
          onUpdatePartBox(it.id, {
            x: c.x + (it.x - c.x) * k,
            y: c.y + (it.y - c.y) * k,
            scale: Math.max(0.05, it.scale * k),
          }),
        )
      } else {
        const a0 = Math.atan2(drag.startWorld.y - c.y, drag.startWorld.x - c.x)
        const a1 = Math.atan2(world.y - c.y, world.x - c.x)
        const d = a1 - a0
        if (drag.items.length > 1) setGroupAngle(groupStartRef.current + (d * 180) / Math.PI)
        drag.items.forEach(it => {
          const cos = Math.cos(d)
          const sin = Math.sin(d)
          const dx = it.x - c.x
          const dy = it.y - c.y
          onUpdatePartBox(it.id, {
            x: c.x + dx * cos - dy * sin,
            y: c.y + dx * sin + dy * cos,
            rotation: it.rotation + (d * 180) / Math.PI,
          })
        })
      }
      return
    }
    if (drag.kind === 'part' && drag.partId && drag.startPart && drag.startWorld) {
      const world = worldPointer()
      const dx = world.x - drag.startWorld.x
      const dy = world.y - drag.startWorld.y
      onMovePart(drag.partId, drag.startPart.x + dx, drag.startPart.y + dy)
      return
    }
    if (drag.kind === 'move' && moveRef.current) {
      const world = worldPointer()
      const dx = world.x - moveRef.current.start.x
      const dy = world.y - moveRef.current.start.y
      onMoveJoints(moveRef.current.items.map(it => ({ id: it.id, x: it.x + dx, y: it.y + dy })))
      return
    }
    if (drag.kind === 'band') {
      const world = worldPointer()
      setBand(b => (b ? { ...b, x1: world.x, y1: world.y } : b))
    }
  }

  const handleUp = () => {
    const drag = dragRef.current
    dragRef.current = null
    setPanning(false)

    if (drag?.kind === 'play') onPlayDragEnd()
    if (drag?.kind === 'joint' || drag?.kind === 'move' || drag?.kind === 'part' || drag?.kind === 'pbox') onEndGesture()
    if (drag?.kind === 'move') moveRef.current = null

    if (drag?.kind === 'band' && band) {
      const x0 = Math.min(band.x0, band.x1)
      const x1 = Math.max(band.x0, band.x1)
      const y0 = Math.min(band.y0, band.y1)
      const y1 = Math.max(band.y0, band.y1)
      const moving = Math.abs(x1 - x0) > 4 / view.scale || Math.abs(y1 - y0) > 4 / view.scale

      if (moving) {
        const joints = doc.joints
          .filter(j => {
            const p = jointPos(j.id)
            return p && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1
          })
          .map(j => j.id)

        const bones = doc.bones
          .filter(b => {
            const a = jointPos(b.a)
            const c = jointPos(b.b)
            if (!a || !c) return false
            const mx = (a.x + c.x) / 2
            const my = (a.y + c.y) / 2
            return mx >= x0 && mx <= x1 && my >= y0 && my <= y1
          })
          .map(b => b.id)

        // 框选也包含部件：中心落在框内即选中
        const partIds = doc.parts
          .filter(p2 => {
            let cx = p2.x
            let cy = p2.y
            if (p2.bone) {
              const bb = doc.bones.find(b => b.id === p2.bone)
              const ja = bb ? jointPos(bb.a) : null
              const jb = bb ? jointPos(bb.b) : null
              if (!ja || !jb) return false
              const ang = Math.atan2(jb.y - ja.y, jb.x - ja.x)
              cx = (ja.x + jb.x) / 2 + Math.cos(ang) * p2.offsetX - Math.sin(ang) * p2.offsetY
              cy = (ja.y + jb.y) / 2 + Math.sin(ang) * p2.offsetX + Math.cos(ang) * p2.offsetY
            }
            return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1
          })
          .map(p2 => p2.id)

        onSetMultiSelection(joints, bones, partIds)
      } else {
        // 空白处单击：取消选择
        onSetSelection([], [])
        onSelectParts([])
      }
      setBand(null)
    }
  }

  const handleWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const factor = e.evt.deltaY > 0 ? 0.9 : 1.1
    const scale = Math.min(5, Math.max(0.5, view.scale * factor))
    const wx = (pointer.x - view.x) / view.scale
    const wy = (pointer.y - view.y) / view.scale
    onViewChange({ scale, x: pointer.x - wx * scale, y: pointer.y - wy * scale })
  }

  const vx0 = -view.x / view.scale
  const vy0 = -view.y / view.scale
  const vx1 = vx0 + width / view.scale
  const vy1 = vy0 + height / view.scale

  const GRID = 40
  const gx0 = Math.floor(vx0 / GRID) * GRID
  const gy0 = Math.floor(vy0 / GRID) * GRID

  const selectedLooseParts = doc.parts.filter(p2 => selectedParts.includes(p2.id) && !p2.bone)

  const partBox = (() => {
    if (!selectedLooseParts.length) return null

    if (selectedLooseParts.length === 1) {
      const p2 = selectedLooseParts[0]
      const sc = p2.scale ?? 1
      return {
        cx: p2.x,
        cy: p2.y,
        w: (p2.sceneWidth ?? p2.width) * sc,
        h: (p2.sceneHeight ?? p2.height) * sc,
        rot: p2.rotation,
      }
    }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p2 of selectedLooseParts) {
      const sc = p2.scale ?? 1
      const hw = ((p2.sceneWidth ?? p2.width) * sc) / 2
      const hh = ((p2.sceneHeight ?? p2.height) * sc) / 2
      minX = Math.min(minX, p2.x - hw)
      maxX = Math.max(maxX, p2.x + hw)
      minY = Math.min(minY, p2.y - hh)
      maxY = Math.max(maxY, p2.y + hh)
    }
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY), rot: groupAngle }
  })()

  // 框的局部坐标 → 世界坐标
  const boxPoint = (lx: number, ly: number) => {
    if (!partBox) return { x: 0, y: 0 }
    const r = (partBox.rot * Math.PI) / 180
    return {
      x: partBox.cx + lx * Math.cos(r) - ly * Math.sin(r),
      y: partBox.cy + lx * Math.sin(r) + ly * Math.cos(r),
    }
  }

  // 骨骼不参与导出层级，绘制顺序沿用数组顺序，选中的放到最上
  const bones = [...doc.bones].sort((a, b) => {
    const sa = selectedBones.includes(a.id) ? 1 : 0
    const sb = selectedBones.includes(b.id) ? 1 : 0
    return sa - sb
  })
  const boneById = new Map((frame?.bones ?? []).map(t => [t.id, t]))
  const bandRect = band
    ? {
        x: Math.min(band.x0, band.x1),
        y: Math.min(band.y0, band.y1),
        w: Math.abs(band.x1 - band.x0),
        h: Math.abs(band.y1 - band.y0),
      }
    : null

  const hoverRafRef = useRef(0)
  const handleHover = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (dragRef.current) return
    if (hoverRafRef.current) return
    hoverRafRef.current = requestAnimationFrame(() => {
      hoverRafRef.current = 0
    })
    const pos = stageRef.current?.getPointerPosition()
    if (!pos) return
    const world = { x: (pos.x - view.x) / view.scale, y: (pos.y - view.y) / view.scale }
    onPointerWorld(world.x, world.y)
    const ev = e.evt as MouseEvent

    for (const j of doc.joints) {
      const jp = jointPos(j.id)
      if (!jp) continue
      const d = Math.hypot(world.x - jp.x, world.y - jp.y)
      if (d <= Math.max(10 / view.scale, j.radius + 6 / view.scale)) {
        if (showJointNames) onHoverName('关节 ' + j.name, ev.clientX, ev.clientY)
        else onHoverName(null, 0, 0)
        return
      }
    }

    const bid = nearestBone(world)
    if (bid && showBoneNames) {
      const bone = doc.bones.find(b => b.id === bid)
      onHoverName(bone ? '骨骼 ' + bone.name : null, ev.clientX, ev.clientY)
      return
    }
    if (showPartNames) {
      const hit = [...doc.parts]
        .sort((a, b2) => b2.z - a.z)
        .find(p2 => {
          let cx = p2.x
          let cy = p2.y
          if (p2.bone) {
            const bb = doc.bones.find(b2 => b2.id === p2.bone)
            const ja = bb ? jointPos(bb.a) : null
            const jb = bb ? jointPos(bb.b) : null
            if (!ja || !jb) return false
            const ang = Math.atan2(jb.y - ja.y, jb.x - ja.x)
            cx = (ja.x + jb.x) / 2 + Math.cos(ang) * p2.offsetX - Math.sin(ang) * p2.offsetY
            cy = (ja.y + jb.y) / 2 + Math.sin(ang) * p2.offsetX + Math.cos(ang) * p2.offsetY
          }
          const sc = p2.scale ?? 1
          const hw = ((p2.sceneWidth ?? p2.width) * sc) / 2
          const hh = ((p2.sceneHeight ?? p2.height) * sc) / 2
          return Math.abs(world.x - cx) <= hw && Math.abs(world.y - cy) <= hh
        })
      if (hit) {
        onHoverName('部件 ' + hit.name, ev.clientX, ev.clientY)
        return
      }
    }
    onHoverName(null, 0, 0)
  }

  const handlePointerMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    handleMove(e)
    handleHover(e)
  }

  const handlePointerLeave = () => {
    handleUp()
    onHoverName(null, 0, 0)
  }

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      x={view.x}
      y={view.y}
      scaleX={view.scale}
      scaleY={view.scale}
      style={{ cursor: panning ? 'grabbing' : 'default' }}
      onMouseDown={handleDown}
      onMouseMove={handlePointerMove}
      onMouseUp={handleUp}
      onWheel={handleWheel}
      onTouchStart={handleDown}
      onTouchMove={handleMove}
      onTouchEnd={handleUp}
      onMouseLeave={handlePointerLeave}
      onContextMenu={e => {
        e.evt.preventDefault()
        const ev = e.evt as MouseEvent
        const wp = stageRef.current?.getRelativePointerPosition() ?? { x: 0, y: 0 }
        onContextMenuAt(ev.clientX, ev.clientY, wp.x, wp.y)
      }}
    >
      <Layer listening={false}>
        {Array.from({ length: Math.ceil((vx1 - gx0) / GRID) + 1 }, (_, i) => (
          <Line key={`gx${i}`} points={[gx0 + i * GRID, vy0, gx0 + i * GRID, vy1]} stroke={colors.grid} strokeWidth={1 / view.scale} />
        ))}
        {Array.from({ length: Math.ceil((vy1 - gy0) / GRID) + 1 }, (_, i) => (
          <Line key={`gy${i}`} points={[vx0, gy0 + i * GRID, vx1, gy0 + i * GRID]} stroke={colors.grid} strokeWidth={1 / view.scale} />
        ))}
        {mode === 'play' ? (
          <>
            <Rect x={vx0} y={doc.ground} width={vx1 - vx0} height={vy1 - doc.ground} fill={colors.ground} />
            <Line points={[vx0, doc.ground, vx1, doc.ground]} stroke={colors.groundLine} strokeWidth={2 / view.scale} />
          </>
        ) : null}
      </Layer>

      <Layer>
        {showPartLink && mode === 'edit'
          ? doc.parts
              .filter(p2 => p2.bone && (selectedParts.includes(p2.id) || selectedBones.includes(p2.bone)))
              .map(p2 => {
                const bone = doc.bones.find(b => b.id === p2.bone)
                if (!bone) return null
                const ja = jointPos(bone.a)
                const jb = jointPos(bone.b)
                if (!ja || !jb) return null
                const ang = Math.atan2(jb.y - ja.y, jb.x - ja.x)
                const cx = (ja.x + jb.x) / 2 + Math.cos(ang) * p2.offsetX - Math.sin(ang) * p2.offsetY
                const cy = (ja.y + jb.y) / 2 + Math.sin(ang) * p2.offsetX + Math.cos(ang) * p2.offsetY
                return (
                  <Line
                    key={'link' + p2.id}
                    points={[cx, cy, (ja.x + jb.x) / 2, (ja.y + jb.y) / 2]}
                    stroke={colors.jointSelected}
                    strokeWidth={1 / view.scale}
                    dash={[4 / view.scale, 3 / view.scale]}
                    listening={false}
                  />
                )
              })
          : null}
      </Layer>

      <Layer>
        {[...doc.parts]
          .sort((a, b) => {
            const sa = selectedParts.includes(a.id) ? 1 : 0
            const sb = selectedParts.includes(b.id) ? 1 : 0
            return sa - sb || a.z - b.z
          })
          .map(part => {
            const bone = part.bone ? doc.bones.find(b => b.id === part.bone) : undefined
            let mx = part.x
            let my = part.y
            let g = (part.rotation * Math.PI) / 180

            if (bone) {
              const a = jointPos(bone.a)
              const c = jointPos(bone.b)
              if (!a || !c) return null
              const ang = Math.atan2(c.y - a.y, c.x - a.x)
              mx = (a.x + c.x) / 2 + Math.cos(ang) * part.offsetX - Math.sin(ang) * part.offsetY
              my = (a.y + c.y) / 2 + Math.sin(ang) * part.offsetX + Math.cos(ang) * part.offsetY
              g = ang + (part.rotation * Math.PI) / 180
            }

            const sc = part.scale ?? 1

            return (
              <Group
                key={part.id}
                x={mx}
                y={my}
                rotation={(g * 180) / Math.PI}
                scaleX={sc}
                scaleY={sc}
                opacity={0.95}
                listening={false}
              >
                {part.elements && part.elements.length ? (
                  [...part.elements]
                    .sort((x, y) => x.zIndex - y.zIndex)
                    .map(el => {
                      const lx = el.x - (part.sceneWidth ?? part.width) / 2
                      const ly = el.y - (part.sceneHeight ?? part.height) / 2
                      if (el.type === 'ellipse') {
                        return (
                          <Ellipse
                            key={el.id}
                            x={lx}
                            y={ly}
                            radiusX={el.width / 2}
                            radiusY={el.height / 2}
                            rotation={el.rotation}
                            fill={el.color}
                            opacity={el.opacity}
                          />
                        )
                      }
                      if (el.type === 'triangle') {
                        return (
                          <RegularPolygon
                            key={el.id}
                            x={lx}
                            y={ly}
                            sides={3}
                            radius={Math.max(el.width, el.height) / 2}
                            rotation={el.rotation}
                            fill={el.color}
                            opacity={el.opacity}
                          />
                        )
                      }
                      return (
                        <Rect
                          key={el.id}
                          x={lx}
                          y={ly}
                          width={el.width}
                          height={el.height}
                          offsetX={el.width / 2}
                          offsetY={el.height / 2}
                          rotation={el.rotation}
                          fill={el.color}
                          opacity={el.opacity}
                        />
                      )
                    })
                ) : (
                  <Rect
                    x={0}
                    y={0}
                    width={part.width}
                    height={part.height}
                    offsetX={part.width / 2}
                    offsetY={part.height / 2}
                    fill={colors.partFill}
                    stroke={colors.partStroke}
                    strokeWidth={1 / view.scale}
                    cornerRadius={4}
                  />
                )}
              </Group>
            )
          })}

      </Layer>

      {partBox && mode === 'edit' ? (
        <Layer>
          <Rect
            x={partBox.cx}
            y={partBox.cy}
            width={partBox.w}
            height={partBox.h}
            offsetX={partBox.w / 2}
            offsetY={partBox.h / 2}
            rotation={partBox.rot}
            stroke={colors.jointSelected}
            strokeWidth={1 / view.scale}
            dash={[5 / view.scale, 4 / view.scale]}
            listening={false}
          />
          {[
            [-partBox.w / 2, -partBox.h / 2],
            [partBox.w / 2, -partBox.h / 2],
            [-partBox.w / 2, partBox.h / 2],
            [partBox.w / 2, partBox.h / 2],
          ].map(([lx, ly], i) => {
            const q = boxPoint(lx, ly)
            return (
              <Rect
                key={i}
                x={q.x}
                y={q.y}
                width={9 / view.scale}
                height={9 / view.scale}
                offsetX={4.5 / view.scale}
                offsetY={4.5 / view.scale}
                fill={colors.jointSelected}
                listening={false}
              />
            )
          })}
          {(() => {
            const q = boxPoint(0, -partBox.h / 2 - 24 / view.scale)
            return <Circle x={q.x} y={q.y} radius={4.5 / view.scale} fill={colors.jointSelected} listening={false} />
          })()}
        </Layer>
      ) : null}

      <Layer>
        {mode === 'play'
          ? bones.map(b => {
              const t = boneById.get(b.id)
              if (!t) return null
              return (
                <Rect
                  key={b.id}
                  x={t.x}
                  y={t.y}
                  width={t.length}
                  height={t.width}
                  offsetX={t.length / 2}
                  offsetY={t.width / 2}
                  rotation={(t.angle * 180) / Math.PI}
                  fill={selectedBones.includes(b.id) ? colors.boneSelected : colors.bone}
                  cornerRadius={t.width / 2}
                  listening={false}
                />
              )
            })
          : bones.map(b => {
              const a = jointPos(b.a)
              const c = jointPos(b.b)
              if (!a || !c) return null
              return (
                <Line
                  key={b.id}
                  points={[a.x, a.y, c.x, c.y]}
                  stroke={selectedBones.includes(b.id) ? colors.boneSelected : colors.bone}
                  strokeWidth={b.width}
                  lineCap="round"
                  listening={false}
                />
              )
            })}
      </Layer>

      <Layer>
        {doc.joints.map(j => {
          const pos = jointPos(j.id)
          if (!pos) return null
          const isLink = linkFrom === j.id
          const active = selectedJoints.includes(j.id)
          return (
            <Circle
              key={j.id}
              x={pos.x}
              y={pos.y}
              radius={Math.max(j.radius, 3)}
              fill={isLink || j.pinned ? colors.jointPinned : active ? colors.jointSelected : colors.joint}
              stroke={colors.jointStroke}
              strokeWidth={2}
              listening={false}
            />
          )
        })}
        {bandRect ? (
          <Rect
            x={bandRect.x}
            y={bandRect.y}
            width={bandRect.w}
            height={bandRect.h}
            fill={colors.band}
            opacity={0.12}
            stroke={colors.band}
            strokeWidth={1 / view.scale}
            listening={false}
          />
        ) : null}
      </Layer>
    </Stage>
  )
}








