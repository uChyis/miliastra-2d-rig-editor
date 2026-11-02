import type { Bone, Joint, RigDoc } from './types'

type JointSeed = [id: string, name: string, x: number, y: number]
/** a / b 两端、父骨（"父骨两端>用>连接"简写）、骨粗 */
type BoneSeed = [a: string, b: string, parent?: string, width?: number]

interface Template {
  name: string
  joints: JointSeed[]
  /**
   * 默认开 IK 的骨（"a>b" 简写）：拖这根骨的末端关节时，反解上一节。
   * 主流骨架的惯例是前臂、小腿这类两节链开 IK，摆姿势快十倍。
   */
  ik?: string[]
  bones: BoneSeed[]
  ground: number
}

const R = 5

/**
 * 人形：19 关节 / 18 骨，对齐 Spine、DragonBones 这类主流剪影骨架
 *
 * ```
 *                     head
 *                      │
 *                     neck
 *            shoulderL ─ chest ─ shoulderR          （chest→shoulder 是锁骨）
 *                 │         │        │
 *              elbowL  waist  elbowR                elbow→hand 开 IK
 *                 │         │        │
 *               handL     pelvis   handR
 *                       ╱   │   ╲
 *                   hipL     │     hipR
 *                    │       │       │
 *                  kneeL     │     kneeR
 *                    │       │       │
 *                  footL     │     footR
 *                    │               │
 *                  toeL             toeR
 * ```
 */
const HUMAN: Template = {
  name: '人形',
  ground: 560,
  joints: [
    ['pelvis', 'pelvis', 410, 397],
    ['waist', 'waist', 410, 351],
    ['chest', 'chest', 410, 301],
    ['neck', 'neck', 410, 272],
    ['head', 'head', 410, 231],
    ['shoulderL', 'shoulderL', 372, 303],
    ['elbowL', 'elbowL', 348, 363],
    ['handL', 'handL', 338, 426],
    ['shoulderR', 'shoulderR', 448, 303],
    ['elbowR', 'elbowR', 472, 363],
    ['handR', 'handR', 482, 426],
    ['hipL', 'hipL', 391, 406],
    ['kneeL', 'kneeL', 384, 469],
    ['footL', 'footL', 379, 534],
    ['toeL', 'toeL', 364, 550],
    ['hipR', 'hipR', 429, 406],
    ['kneeR', 'kneeR', 436, 469],
    ['footR', 'footR', 441, 534],
    ['toeR', 'toeR', 456, 550],
  ],
  ik: ['elbowL>handL', 'elbowR>handR', 'kneeL>footL', 'kneeR>footR'],
  bones: [
    // 躯干：pelvis→waist→chest→neck→head
    ['pelvis', 'waist', undefined, 18],
    ['waist', 'chest', 'pelvis>waist', 16],
    ['chest', 'neck', 'waist>chest', 13],
    ['neck', 'head', 'chest>neck', 12],
    // 手臂：锁骨 → 上臂 → 前臂
    ['chest', 'shoulderL', 'waist>chest', 10],
    ['shoulderL', 'elbowL', 'chest>shoulderL', 9],
    ['elbowL', 'handL', 'shoulderL>elbowL', 8],
    ['chest', 'shoulderR', 'waist>chest', 10],
    ['shoulderR', 'elbowR', 'chest>shoulderR', 9],
    ['elbowR', 'handR', 'shoulderR>elbowR', 8],
    // 腿：髋窝 → 大腿 → 小腿 → 脚掌
    ['pelvis', 'hipL', 'pelvis>waist', 12],
    ['hipL', 'kneeL', 'pelvis>hipL', 11],
    ['kneeL', 'footL', 'hipL>kneeL', 9],
    ['footL', 'toeL', 'kneeL>footL', 7],
    ['pelvis', 'hipR', 'pelvis>waist', 12],
    ['hipR', 'kneeR', 'pelvis>hipR', 11],
    ['kneeR', 'footR', 'hipR>kneeR', 9],
    ['footR', 'toeR', 'kneeR>footR', 7],
  ],
}

/**
 * 四足：23 关节 / 22 骨，侧面朝右
 *
 * ```
 *                         neck─head
 *                        ╱
 *   tail2─tail1─spine0─spine1─spine2
 *                 │      │      ╰─ flShoulder ─ flElbow ─ flFoot ─ flToe
 *           brHip──┘  blHip┘  ╰─ frShoulder ─ frElbow ─ frFoot ─ frToe
 *             │        │
 *          brKnee    blKnee        前肘、后膝开 IK
 *             │        │
 *          brFoot    blFoot
 * ```
 */
const QUAD: Template = {
  name: '四足',
  ground: 560,
  joints: [
    ['spine0', 'tailRoot', 300, 424],
    ['spine1', 'waist', 390, 418],
    ['spine2', 'withers', 478, 414],
    ['neck', 'neck', 534, 398],
    ['head', 'head', 594, 382],
    ['tail1', 'tail1', 250, 428],
    ['tail2', 'tail2', 204, 438],
    ['flShoulder', 'flShoulder', 494, 428],
    ['flElbow', 'flElbow', 498, 490],
    ['flFoot', 'flFoot', 496, 544],
    ['flToe', 'flToe', 518, 550],
    ['frShoulder', 'frShoulder', 462, 422],
    ['frElbow', 'frElbow', 466, 484],
    ['frFoot', 'frFoot', 464, 538],
    ['frToe', 'frToe', 486, 544],
    ['blHip', 'blHip', 316, 430],
    ['blKnee', 'blKnee', 312, 492],
    ['blFoot', 'blFoot', 308, 544],
    ['blToe', 'blToe', 330, 550],
    ['brHip', 'brHip', 284, 424],
    ['brKnee', 'brKnee', 280, 486],
    ['brFoot', 'brFoot', 276, 538],
    ['brToe', 'brToe', 298, 544],
  ],
  ik: ['flElbow>flFoot', 'frElbow>frFoot', 'blKnee>blFoot', 'brKnee>brFoot'],
  bones: [
    // 脊柱：尾根 → 腰 → 肩胛；再接颈与头
    ['spine0', 'spine1', undefined, 17],
    ['spine1', 'spine2', 'spine0>spine1', 16],
    ['spine2', 'neck', 'spine1>spine2', 13],
    ['neck', 'head', 'spine2>neck', 12],
    // 尾巴
    ['spine0', 'tail1', undefined, 9],
    ['tail1', 'tail2', 'spine0>tail1', 7],
    // 前腿：肩胛 → 上臂 → 前臂 → 脚掌
    ['spine2', 'flShoulder', 'spine1>spine2', 11],
    ['flShoulder', 'flElbow', 'spine2>flShoulder', 10],
    ['flElbow', 'flFoot', 'flShoulder>flElbow', 9],
    ['flFoot', 'flToe', 'flElbow>flFoot', 7],
    ['spine2', 'frShoulder', 'spine1>spine2', 11],
    ['frShoulder', 'frElbow', 'spine2>frShoulder', 10],
    ['frElbow', 'frFoot', 'frShoulder>frElbow', 9],
    ['frFoot', 'frToe', 'frElbow>frFoot', 7],
    // 后腿：髋 → 大腿 → 小腿 → 脚掌
    ['spine0', 'blHip', undefined, 12],
    ['blHip', 'blKnee', 'spine0>blHip', 11],
    ['blKnee', 'blFoot', 'blHip>blKnee', 9],
    ['blFoot', 'blToe', 'blKnee>blFoot', 7],
    ['spine0', 'brHip', undefined, 12],
    ['brHip', 'brKnee', 'spine0>brHip', 11],
    ['brKnee', 'brFoot', 'brHip>brKnee', 9],
    ['brFoot', 'brToe', 'brKnee>brFoot', 7],
  ],
}

const CHAIN: Template = {
  name: '单链',
  ground: 560,
  joints: [
    ['a', 'anchor', 410, 160],
    ['b', 'link1', 410, 240],
    ['c', 'link2', 410, 320],
    ['d', 'link3', 410, 400],
    ['e', 'tip', 410, 480],
  ],
  bones: [
    ['a', 'b', undefined, 12],
    ['b', 'c', 'a>b', 12],
    ['c', 'd', 'b>c', 12],
    ['d', 'e', 'c>d', 12],
  ],
}

const CUSTOM: Template = {
  name: '自定义',
  ground: 560,
  joints: [],
  bones: [],
}

export const TEMPLATES = { human: HUMAN, quad: QUAD, chain: CHAIN, custom: CUSTOM }
export type TemplateKey = keyof typeof TEMPLATES

function resolveParent(index: Map<string, string>, shorthand?: string) {
  if (!shorthand) return undefined
  const [a, b] = shorthand.split('>')
  return index.get(a + '>' + b)
}

export function buildTemplate(key: TemplateKey): RigDoc {
  const t = TEMPLATES[key]
  const joints: Joint[] = t.joints.map(item => ({
    id: item[0],
    name: item[1],
    x: item[2],
    y: item[3],
    radius: R,
    pinned: item[0] === 'a',
  }))

  const boneIds = new Map<string, string>()
  t.bones.forEach(b => boneIds.set(b[0] + '>' + b[1], b[0] + '_' + b[1]))
  const ikSet = new Set(t.ik ?? [])

  const bones: Bone[] = t.bones.map(item => {
    const a = item[0]
    const b = item[1]
    const ja = joints.find(j => j.id === a)
    const jb = joints.find(j => j.id === b)
    return {
      id: a + '_' + b,
      name: (ja ? ja.name : a) + ' to ' + (jb ? jb.name : b),
      a,
      b,
      width: item[3] === undefined ? 12 : item[3],
      mass: 1,
      friction: 0.4,
      restitution: 0.1,
      damping: 0.1,
      parent: resolveParent(boneIds, item[2]),
      // 预设默认不限制角度：预设的关节位置是模板，用户一定会拖动；
      // 而限制是相对「静止姿态」的，预设里写死任何数值都会在拖动后失去意义。
      // 需要限制时按 12.3 的顺序自己设：摆好造型 → 记录姿势 → 再设上下限。
      limitMode: 'none' as 'hard' | 'soft' | 'none',
      stiffness: 3,
      limitLower: 0,
      limitUpper: 0,
      ik: ikSet.has(a + '>' + b) || undefined,
    }
  })

  return {
    version: 1,
    name: '未命名骨架',
    canvas: { width: 820, height: 620 },
    ground: t.ground,
    params: { gravity: 0, damping: 0.99, friction: 0.6, restitution: 0.2, dragForce: 320, solverIterations: 8 },
    joints,
    bones,
    parts: [],
    poses: [],
  }
}
