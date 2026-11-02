import type { RigDoc } from './types'

export interface DocIssues {
  /** 致命问题：不能继续读取，否则会把工程改坏 */
  fatal: string[]
  /** 可继续读取，但需要提示用户 */
  warnings: string[]
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const LIMIT = 8
const list = (items: string[]) =>
  items.length <= LIMIT ? items : [...items.slice(0, LIMIT), `…共 ${items.length} 项`]

/**
 * 校验导入的工程 JSON。只做「能不能安全读进来」的判断，不改数据。
 * 原工程必须保持可读：老版本、缺字段都尽量只给 warning，不轻易判致命。
 */
export function validateDoc(raw: unknown): DocIssues {
  const fatal: string[] = []
  const warnings: string[] = []

  if (!raw || typeof raw !== 'object') {
    return { fatal: ['文件内容不是一个 JSON 对象'], warnings }
  }
  const doc = raw as Partial<RigDoc>

  if (!Array.isArray(doc.joints)) fatal.push('缺少 joints 数组')
  if (!Array.isArray(doc.bones)) fatal.push('缺少 bones 数组')
  if (!doc.canvas || typeof doc.canvas !== 'object') warnings.push('缺少 canvas，将使用默认画布尺寸')
  if (!doc.params || typeof doc.params !== 'object') warnings.push('缺少 params，将使用默认物理参数')
  if (fatal.length) return { fatal: list(fatal), warnings: list(warnings) }

  if (doc.version !== 1) {
    warnings.push(`工程版本为 ${String(doc.version)}，当前版本为 1，将按当前格式尝试读取`)
  }
  if (!isFiniteNumber(doc.ground)) warnings.push('地面高度缺失或非法，将使用默认值')

  // ---- 关节 ----
  const jointIds = new Set<string>()
  const dupJoints: string[] = []
  const badJoints: string[] = []
  for (const j of doc.joints as RigDoc['joints']) {
    if (!j || typeof j.id !== 'string' || !j.id) {
      fatal.push('存在没有 id 的关节')
      continue
    }
    if (jointIds.has(j.id)) dupJoints.push(j.id)
    jointIds.add(j.id)
    if (!isFiniteNumber(j.x) || !isFiniteNumber(j.y)) badJoints.push(j.id)
  }
  if (dupJoints.length) fatal.push(`关节 id 重复：${list(dupJoints).join('、')}`)
  if (badJoints.length) fatal.push(`关节坐标不是有效数值：${list(badJoints).join('、')}`)
  if (!jointIds.size) warnings.push('工程里没有任何关节')

  // ---- 骨骼 ----
  const boneIds = new Set<string>()
  const dupBones: string[] = []
  const badRefs: string[] = []
  const selfLoops: string[] = []
  for (const b of doc.bones as RigDoc['bones']) {
    if (!b || typeof b.id !== 'string' || !b.id) {
      fatal.push('存在没有 id 的骨骼')
      continue
    }
    if (boneIds.has(b.id)) dupBones.push(b.id)
    boneIds.add(b.id)
    if (b.a === b.b) selfLoops.push(b.id)
    if (!jointIds.has(b.a) || !jointIds.has(b.b)) badRefs.push(b.id)
  }
  if (dupBones.length) fatal.push(`骨骼 id 重复：${list(dupBones).join('、')}`)
  if (selfLoops.length) fatal.push(`骨骼两端是同一个关节：${list(selfLoops).join('、')}`)
  if (badRefs.length) fatal.push(`骨骼引用了不存在的关节：${list(badRefs).join('、')}`)

  // ---- 父骨：存在性 + 环 ----
  const missingParents: string[] = []
  const cycles: string[] = []
  if (!dupBones.length) {
    for (const b of doc.bones as RigDoc['bones']) {
      if (!b || !b.parent) continue
      if (!boneIds.has(b.parent)) {
        missingParents.push(`${b.id} → ${b.parent}`)
        continue
      }
      let cur: string | undefined = b.parent
      const seen = new Set<string>([b.id])
      let guard = 0
      while (cur && guard < boneIds.size + 1) {
        if (seen.has(cur)) {
          cycles.push(b.id)
          break
        }
        seen.add(cur)
        cur = (doc.bones as RigDoc['bones']).find(x => x?.id === cur)?.parent
        guard += 1
      }
    }
  }
  if (missingParents.length) {
    warnings.push(`父骨不存在，将按无父骨处理：${list(missingParents).join('、')}`)
  }
  if (cycles.length) fatal.push(`骨骼父子关系成环：${list(cycles).join('、')}`)

  // ---- 部件 ----
  if (doc.parts !== undefined) {
    if (!Array.isArray(doc.parts)) {
      warnings.push('parts 不是数组，将被忽略')
    } else {
      const badBones: string[] = []
      const badParts: string[] = []
      for (const p of doc.parts as RigDoc['parts']) {
        if (!p || typeof p.id !== 'string' || !p.id) {
          badParts.push('（无 id）')
          continue
        }
        if (p.bone && !boneIds.has(p.bone)) badBones.push(`${p.id} → ${p.bone}`)
        if (!isFiniteNumber(p.scale) || !isFiniteNumber(p.z)) badParts.push(p.id)
      }
      if (badBones.length) warnings.push(`部件绑定了不存在的骨骼：${list(badBones).join('、')}`)
      if (badParts.length) warnings.push(`部件数值非法（缩放/层级）：${list(badParts).join('、')}`)
    }
  }

  // ---- 姿势 ----
  if (doc.poses !== undefined) {
    if (!Array.isArray(doc.poses)) {
      warnings.push('poses 不是数组，将被忽略')
    } else {
      const names = new Set<string>()
      const dup: string[] = []
      for (const pose of doc.poses as RigDoc['poses']) {
        if (!pose || typeof pose.name !== 'string') continue
        if (names.has(pose.name)) dup.push(pose.name)
        names.add(pose.name)
      }
      if (dup.length) warnings.push(`姿势名称重复（后一个会覆盖前一个）：${list(dup).join('、')}`)
    }
  }

  return { fatal: list(fatal), warnings: list(warnings) }
}
