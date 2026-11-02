import type { RigDoc } from './types'

const NAME_MAP: Record<string, string> = {
  骨盆: 'pelvis',
  胸: 'chest',
  头: 'head',
  左肩: 'shoulderL',
  左手: 'handL',
  右肩: 'shoulderR',
  右手: 'handR',
  左髋: 'hipL',
  左膝: 'kneeL',
  左脚: 'footL',
  右髋: 'hipR',
  右膝: 'kneeR',
  右脚: 'footR',
  尾根: 'tail',
  腰: 'waist',
  肩胛: 'withers',
  左前肩: 'flShoulder',
  左前脚: 'flFoot',
  右前肩: 'frShoulder',
  右前脚: 'frFoot',
  左后髋: 'blHip',
  左后脚: 'blFoot',
  右后髋: 'brHip',
  右后脚: 'brFoot',
  锚点: 'anchor',
  节1: 'link1',
  节2: 'link2',
  节3: 'link3',
  末端: 'tip',
}

function isStale(name: string) {
  if (name.indexOf('→') >= 0) return true
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i)
    if (code >= 0x4e00 && code <= 0x9fff) return true
  }
  return false
}

/** 把旧存档里的中文关节名迁移成英文，并按关节名重建骨骼显示名 */
/** 补齐旧文件缺失的字段，避免 undefined 参与计算 */
export function normalizeDoc(doc: RigDoc): RigDoc {
  const joints = (doc.joints ?? []).map(j => ({
    ...j,
    pinned: j.pinned ?? false,
    radius: j.radius ?? 5,
  }))
  const bones = (doc.bones ?? []).map(b => {
    // 导出的工程 JSON 用 from/to，内部用 a/b；导回来要能接上
    const raw = b as unknown as { a?: string; b?: string; from?: string; to?: string }
    return {
    ...b,
    a: raw.a ?? raw.from ?? '',
    b: raw.b ?? raw.to ?? '',
    width: b.width ?? 6,
    mass: b.mass ?? 1,
    friction: b.friction ?? 0.4,
    restitution: b.restitution ?? 0.1,
    damping: b.damping ?? 0.1,
    limitMode: b.limitMode ?? ('hard' as const),
    stiffness: b.stiffness ?? 3,
    limitLower: b.limitLower ?? 0,
    limitUpper: b.limitUpper ?? 0,
    }
  })
  const parts = (doc.parts ?? []).map(p2 => ({
    ...p2,
    scale: p2.scale ?? 1,
    rotation: p2.rotation ?? 0,
    offsetX: p2.offsetX ?? 0,
    offsetY: p2.offsetY ?? 0,
    z: p2.z ?? 0,
    x: p2.x ?? 0,
    y: p2.y ?? 0,
  }))
  return {
    ...doc,
    params: {
      ...(doc.params ?? {}),
      gravity: doc.params?.gravity ?? 0,
      damping: doc.params?.damping ?? 0.99,
      friction: doc.params?.friction ?? 0.6,
      restitution: doc.params?.restitution ?? 0.2,
      dragForce: doc.params?.dragForce ?? 320,
      solverIterations: doc.params?.solverIterations ?? 8,
    },
    joints,
    bones,
    parts,
    poses: doc.poses ?? [],
  }
}

export function migrateNames(doc: RigDoc): RigDoc {
  const joints = doc.joints.map(j => {
    const mapped = NAME_MAP[j.name]
    return mapped ? { ...j, name: mapped } : j
  })

  const nameOf = (id: string) => {
    const found = joints.find(j => j.id === id)
    return found ? found.name : id
  }

  const bones = doc.bones.map(b => {
    if (!isStale(b.name)) return b
    return { ...b, name: nameOf(b.a) + ' to ' + nameOf(b.b) }
  })

  // 旧存档没有 parts 字段，补空数组避免读取 undefined
  return { ...doc, joints, bones, parts: doc.parts ?? [], poses: doc.poses ?? [] }
}

