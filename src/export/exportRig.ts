import type { RigDoc } from '@/rig/types'

/** 导出给运行时（千星 Lua）读的数据：几何预先算好，运行时不需要再翻关节表 */
export interface ExportedBone {
  id: string
  name: string
  parent: string | null
  /** 骨头两端的关节 id */
  from: string
  to: string
  /** 世界坐标（像素） */
  ax: number
  ay: number
  bx: number
  by: number
  length: number
  width: number
  mass: number
  friction: number
  restitution: number
  damping: number
  /** 相对父骨的角度限制，单位度 */
  limitLower: number
  limitUpper: number
}

export interface ExportedRig {
  version: 2
  name: string
  canvas: { width: number; height: number }
  ground: number
  params: RigDoc['params']
  joints: Array<{ id: string; name: string; x: number; y: number; radius: number; pinned: boolean }>
  bones: ExportedBone[]
  parts: Array<{ id: string; name: string; imageId: number; bone?: string; x: number; y: number; scale: number; width: number; height: number; offsetX: number; offsetY: number; rotation: number; z: number; sceneWidth?: number; sceneHeight?: number; elements?: RigDoc['parts'][number]['elements'] }>
  poses: Array<{ id: string; name: string; joints: Record<string, { x: number; y: number }> }>
}

export function toExport(doc: RigDoc): ExportedRig {
  const byId = new Map(doc.joints.map(j => [j.id, j]))
  const bones: ExportedBone[] = doc.bones.map(b => {
    const a = byId.get(b.a)
    const c = byId.get(b.b)
    return {
      id: b.id,
      name: b.name,
      parent: b.parent ?? null,
      from: b.a,
      to: b.b,
      ax: a?.x ?? 0,
      ay: a?.y ?? 0,
      bx: c?.x ?? 0,
      by: c?.y ?? 0,
      length: a && c ? Math.hypot(c.x - a.x, c.y - a.y) : 0,
      width: b.width,
      mass: b.mass,
      friction: b.friction,
      restitution: b.restitution,
      damping: b.damping,
      limitMode: b.limitMode ?? 'hard',
      stiffness: b.stiffness ?? 3,
      ik: b.ik ?? false,
      limitLower: b.limitLower,
      limitUpper: b.limitUpper,
    }
  })

  return {
    version: 2,
    name: doc.name,
    canvas: doc.canvas,
    ground: doc.ground,
    params: doc.params,
    parts: doc.parts.map(p => ({
      id: p.id, name: p.name, imageId: p.imageId, bone: p.bone, x: p.x, y: p.y, scale: p.scale,
      width: p.width, height: p.height, offsetX: p.offsetX, offsetY: p.offsetY,
      rotation: p.rotation, z: p.z,
      sceneWidth: p.sceneWidth, sceneHeight: p.sceneHeight, elements: p.elements,
    })),
    poses: (doc.poses ?? []).map(pose => ({ id: pose.id, name: pose.name, joints: pose.joints })),
    joints: doc.joints.map(j => ({
      id: j.id, name: j.name, x: j.x, y: j.y, radius: j.radius, pinned: j.pinned,
    })),
    bones,
  }
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}



