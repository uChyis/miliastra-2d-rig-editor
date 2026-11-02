import type { RigDoc } from '@/rig/types'

/** 骨骼在某一帧的位姿 */
export interface BoneTransform {
  id: string
  x: number
  y: number
  angle: number
  length: number
  width: number
}

export interface RuntimeFrame {
  bones: BoneTransform[]
  /** 关节实时坐标（像素），预览时命中测试用它 */
  joints: Record<string, { x: number; y: number }>
}

const MAX_STEP = 40 // 单帧最大位移（px），防止速度失控
const FIXED_DT = 1 / 120 // 固定子步长，避免帧率波动引起抖动

interface Point {
  x: number
  y: number
  px: number
  py: number
  pinned: boolean
}

/**
 * Verlet 预览引擎：与导出的 Lua 求解器同构。
 *
 * 编辑器预览和真机必须是一套模型，否则在编辑器里调好的参数到真机上会变。
 * 这里逐条对应 exportLua.ts 里的 Rig.Update / SolveAngles。
 */
export class VerletEngine {
  private doc: RigDoc
  private points = new Map<string, Point>()
  private rest = new Map<string, number>()
  private restRel = new Map<string, number>()
  private drag: { id: string; x: number; y: number } | null = null
  private acc = 0
  /** 上一子步里被角度限制挡住、正在边界的关节 */
  private atLimit = new Set<string>()
  private gravity = 0
  private damping = 0.99
  private iterations = 8

  constructor(doc: RigDoc) {
    this.doc = doc
    this.gravity = doc.params.gravity * 2000
    this.damping = doc.params.damping
    this.iterations = Math.round(doc.params.solverIterations)

    for (const j of doc.joints) {
      this.points.set(j.id, { x: j.x, y: j.y, px: j.x, py: j.y, pinned: j.pinned })
    }
    for (const b of doc.bones) {
      const a = this.points.get(b.a)
      const c = this.points.get(b.b)
      if (a && c) this.rest.set(b.id, Math.hypot(c.x - a.x, c.y - a.y))
    }
    // 角度限制是相对「静止姿态」的偏移量，不是绝对相对角
    for (const b of doc.bones) {
      if (!b.parent) continue
      const parent = doc.bones.find(x => x.id === b.parent)
      const pa = parent ? this.points.get(parent.a) : undefined
      const pe = parent ? this.points.get(parent.b) : undefined
      const sa = this.points.get(b.a)
      const sb = this.points.get(b.b)
      if (!pa || !pe || !sa || !sb) continue
      const parentAngle = Math.atan2(pe.y - pa.y, pe.x - pa.x)
      const childAngle = Math.atan2(sb.y - sa.y, sb.x - sa.x)
      this.restRel.set(b.id, childAngle - parentAngle)
    }
  }

  /** 移动质点并同步上一帧位置：位置修正不应该变成速度 */
  /** 找到以被拖关节为末端的骨 */
  private dragBone(): { id: string; a: string; b: string } | undefined {
    const id = this.drag?.id
    if (!id) return undefined
    return this.doc.bones.find(b => b.b === id)
  }

  private shift(p: Point, dx: number, dy: number) {
    p.x += dx
    p.y += dy
    p.px += dx
    p.py += dy
  }

  step(dt: number): RuntimeFrame {
    this.acc = Math.min(this.acc + dt, 0.1)
    let guard = 0
    while (this.acc >= FIXED_DT && guard < 8) {
      this.substep(FIXED_DT)
      this.acc -= FIXED_DT
      guard += 1
    }
    return this.frame()
  }

  private substep(h: number) {
    this.atLimit.clear()

    const damp = 1 - Math.min(1, 1 - this.damping) * 0.5

    // 1. 积分
    for (const p of this.points.values()) {
      if (p.pinned) continue
      const vx = (p.x - p.px) * damp
      const vy = (p.y - p.py) * damp
      p.px = p.x
      p.py = p.y
      const nx = vx
      const ny = vy + this.gravity * h * h
      const mag = Math.hypot(nx, ny)
      const k = mag > MAX_STEP ? MAX_STEP / mag : 1
      p.x += nx * k
      p.y += ny * k
    }

    // 2. 拖拽：绕父关节旋转到鼠标方向，半径保持不变
    //    直接朝鼠标拉会让"拉进去—被投影回来"两帧反复，看起来就是高频抖动
    if (this.drag) {
      const p = this.points.get(this.drag.id)
      if (p && !p.pinned) {
        const bone = this.dragBone()
        const parent = bone ? this.points.get(bone.a) : undefined
        if (bone && parent) {
          const radius = this.rest.get(bone.id) ?? Math.hypot(p.x - parent.x, p.y - parent.y)
          const targetAngle = Math.atan2(this.drag.y - parent.y, this.drag.x - parent.x)
          const curAngle = Math.atan2(p.y - parent.y, p.x - parent.x)
          let delta = targetAngle - curAngle
          while (delta > Math.PI) delta -= Math.PI * 2
          while (delta < -Math.PI) delta += Math.PI * 2

          const step = Math.min(Math.abs(delta), 0.25) * Math.sign(delta)
          const a = curAngle + step
          p.px = p.x
          p.py = p.y
          p.x = parent.x + Math.cos(a) * radius
          p.y = parent.y + Math.sin(a) * radius
        } else {
          const dx = this.drag.x - p.x
          const dy = this.drag.y - p.y
          const mag = Math.hypot(dx, dy)
          const k = mag > MAX_STEP ? MAX_STEP / mag : 1
          p.px = p.x
          p.py = p.y
          p.x += dx * k
          p.y += dy * k
        }
      }
    }

    // 3. 每轮先收长度、再按 beta 渐进修角度（100% 修正在边界上会来回弹）
    for (let it = 0; it < this.iterations; it++) {
      this.solveDistance(1)
      this.solveAngles(0.3)
    }
    this.projectLengths()

    // 5. 地面
    const ground = this.doc.ground
    for (const p of this.points.values()) {
      if (p.pinned || p.y <= ground) continue
      const vy = p.y - p.py
      p.y = ground
      p.px = Math.abs(vy) < 20 ? p.x : p.px
      p.py = Math.abs(vy) < 20 ? p.y : p.y + vy * this.doc.params.restitution
    }
  }

  /** 只沿骨轴修正长度：不改变方向，因此不会重新破坏刚修好的角度 */
  private projectLengths() {
    for (const b of this.doc.bones) {
      const a = this.points.get(b.a)
      const c = this.points.get(b.b)
      const rest = this.rest.get(b.id)
      if (!a || !c || rest === undefined) continue
      if (a.pinned && c.pinned) continue
      const dx = c.x - a.x
      const dy = c.y - a.y
      const d = Math.hypot(dx, dy)
      if (d < 1e-6) continue
      const ux = dx / d
      const uy = dy / d
      const diff = d - rest
      if (a.pinned) {
        this.shift(c, -ux * diff, -uy * diff)
      } else if (c.pinned) {
        this.shift(a, ux * diff, uy * diff)
      } else {
        this.shift(a, ux * diff * 0.5, uy * diff * 0.5)
        this.shift(c, -ux * diff * 0.5, -uy * diff * 0.5)
      }
    }
  }

  private solveDistance(times: number) {
    for (let it = 0; it < times; it++) {
      for (const b of this.doc.bones) {
        const a = this.points.get(b.a)
        const c = this.points.get(b.b)
        const rest = this.rest.get(b.id)
        if (!a || !c || rest === undefined) continue
        const dx = c.x - a.x
        const dy = c.y - a.y
        const d = Math.hypot(dx, dy) || 1e-6
        const diff = (d - rest) / d

        if (a.pinned && c.pinned) continue
        if (a.pinned) {
          this.shift(c, -dx * diff, -dy * diff)
        } else if (c.pinned) {
          this.shift(a, dx * diff, dy * diff)
        } else {
          this.shift(a, dx * diff * 0.5, dy * diff * 0.5)
          this.shift(c, -dx * diff * 0.5, -dy * diff * 0.5)
        }
      }
    }
  }

  /** 把某根骨之后的整段子链绕关节旋转固定角度（刚性旋转，长度不变） */
  private rotateSubtree(bone: { id: string }, pivot: Point, delta: number) {
    const cos = Math.cos(delta)
    const sin = Math.sin(delta)
    const below = new Set<string>([bone.id])
    for (const b of this.doc.bones) {
      let cur: string | undefined = b.parent
      let guard = 0
      while (cur && guard < 64) {
        if (cur === bone.id) {
          below.add(b.id)
          break
        }
        const pb = this.doc.bones.find(x => x.id === cur)
        cur = pb?.parent
        guard += 1
      }
    }
    const moved = new Set<string>()
    for (const id of below) {
      const b = this.doc.bones.find(x => x.id === id)
      if (!b) continue
      const target = this.points.get(b.b)
      if (!target || target.pinned || moved.has(b.b)) continue
      const dx = target.x - pivot.x
      const dy = target.y - pivot.y
      this.shift(target, dx * cos - dy * sin - dx, dx * sin + dy * cos - dy)
      moved.add(b.b)
    }
  }

  private solveAngles(beta = 1) {
    const deg = Math.PI / 180
    for (const b of this.doc.bones) {
      if (!b.parent) continue
      const mode = b.limitMode ?? 'hard'
      if (mode === 'none' || b.limitLower === b.limitUpper) continue

      const parent = this.doc.bones.find(x => x.id === b.parent)
      if (!parent) continue

      const pa = this.points.get(parent.a)
      const pe = this.points.get(parent.b)
      const sa = this.points.get(b.a)
      const sb = this.points.get(b.b)
      if (!pa || !pe || !sa || !sb || sb.pinned) continue

      const parentAngle = Math.atan2(pe.y - pa.y, pe.x - pa.x)
      const childAngle = Math.atan2(sb.y - sa.y, sb.x - sa.x)
      const rel = childAngle - parentAngle
      const base = this.restRel.get(b.id) ?? 0
      const rawLo = b.limitLower
      const rawHi = b.limitUpper
      // 上下限填反了也要能正常工作
      const loDeg = Math.min(rawLo, rawHi)
      const hiDeg = Math.max(rawLo, rawHi)
      const lo = base + loDeg * deg
      const hi = base + hiDeg * deg

      const EPS = 0.5 * deg
      let target: number | null = null
      if (rel < lo - EPS) target = lo
      else if (rel > hi + EPS) target = hi
      if (target === null) continue

      const len = Math.hypot(sb.x - sa.x, sb.y - sa.y)
      if (len < 1e-3) continue
      const rawDelta = target - rel
      // 硬止挡一次到位；软回弹限幅，避免弹飞
      const maxStep = 30 * deg
      const delta = Math.max(-maxStep, Math.min(maxStep, rawDelta))
      const factor = mode === 'soft' ? Math.min(0.4, (b.stiffness ?? 3) * 0.05) : beta
      this.atLimit.add(b.b)
      if (mode === 'hard') {
        // 无恢复：撞到边界就不该保留朝向边界外的速度
        sb.px = sb.x
        sb.py = sb.y
        // 绕关节刚性旋转子链：所有骨长与下游角度都保持不变
        this.rotateSubtree(b, sa, delta * factor)
      } else {
        const a = childAngle + delta * factor
        const nx = sa.x + Math.cos(a) * len
        const ny = sa.y + Math.sin(a) * len
        this.shift(sb, nx - sb.x, ny - sb.y)
      }
    }
  }

  private frame(): RuntimeFrame {
    const joints: Record<string, { x: number; y: number }> = {}
    for (const [id, p] of this.points) joints[id] = { x: p.x, y: p.y }

    const bones: BoneTransform[] = []
    for (const b of this.doc.bones) {
      const a = joints[b.a]
      const c = joints[b.b]
      if (!a || !c) continue
      bones.push({
        id: b.id,
        x: (a.x + c.x) / 2,
        y: (a.y + c.y) / 2,
        angle: Math.atan2(c.y - a.y, c.x - a.x),
        length: Math.hypot(c.x - a.x, c.y - a.y),
        width: b.width,
      })
    }
    return { bones, joints }
  }

  beginDrag(jointId: string, x: number, y: number) {
    this.drag = { id: jointId, x, y }
  }

  moveDrag(x: number, y: number) {
    if (this.drag) {
      this.drag.x = x
      this.drag.y = y
    }
  }

  endDrag() {
    this.drag = null
  }

  setGravity(g: number) {
    this.gravity = g * 2000
  }

  setDragForce(_f: number) {
    /* Verlet 版本不使用拖拽力参数 */
  }

  setSolverIterations(n: number) {
    this.iterations = Math.round(n)
  }
}
