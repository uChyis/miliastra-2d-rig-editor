/** 关节：骨骼的连接点，也是一个可以拖动的圆点 */
export interface Joint {
  id: string
  name: string
  x: number
  y: number
  radius: number
  /** 固定关节（不会掉下去），比如挂在墙上的锚点 */
  pinned: boolean
}

/** 骨：连接两个关节的一段刚体 */
export interface Bone {
  id: string
  name: string
  /** 起点关节 id */
  a: string
  /** 终点关节 id */
  b: string
  /** 骨粗（像素） */
  width: number
  /** 质量（kg），越重越不容易被推动 */
  mass: number
  friction: number
  restitution: number
  damping: number
  /** 父骨 id：决定连接关系与角度限制的参照 */
  parent?: string
  /** 相对父骨的角度限制（度）；两个值相等表示不限制 */
  /** 角度限制方式：hard 硬止挡 / soft 软回弹 / none 不限 */
  limitMode?: 'hard' | 'soft' | 'none'
  /** 软限制的回弹频率 Hz */
  stiffness?: number
  limitLower: number
  limitUpper: number
  /** 作为双骨 IK 的末端骨：拖动末端关节时会反解中间关节 */
  ik?: boolean
}

/** 矢量工具导出的单个基础图元 */
export interface SceneElement {
  id: string
  type: 'rectangle' | 'ellipse' | 'triangle'
  /** 元素中心坐标（相对图元画布） */
  x: number
  y: number
  width: number
  height: number
  /** 角度（度） */
  rotation: number
  color: string
  opacity: number
  zIndex: number
  /** 渐变遮罩：由矢量稿的 luaMask 转换而来 */
  mask?: { imageId: number; offsetX: number; offsetY: number; width: number; height: number; reverse: boolean; softEdge: boolean }
}

/** 图元：绑定在某根骨上的一个图片控件 */
export interface Part {
  id: string
  name: string
  /** 千星图片资产 id：100001 矩形 / 100002 圆 / 100003 三角，或你自己的资产 id */
  imageId: number
  /** 绑定的骨 id；为空表示自由摆放在画布上 */
  bone?: string
  /** 控件尺寸（像素） */
  width: number
  height: number
  /** 自由状态下的画布坐标（中心）；绑定后作为参考位置 */
  x: number
  y: number
  /** 整体缩放 */
  scale: number
  /** 相对骨中点的偏移（像素，沿骨方向为 x） */
  offsetX: number
  offsetY: number
  /** 相对骨的附加旋转（度） */
  rotation: number
  /** 绘制层级：越大越靠上 */
  z: number
  /** 复合图元：来自矢量 JSON 的一组基础形状；有值时忽略 imageId */
  elements?: SceneElement[]
  /** 复合图元的原始画布尺寸 */
  sceneWidth?: number
  sceneHeight?: number
}

/** 姿势：某个瞬间所有关节的坐标快照 */
export interface Pose {
  id: string
  name: string
  joints: Record<string, { x: number; y: number }>
}

export interface RigParams {
  /** 重力强度 0–1，0 = 失重，1 约等于 2000 px/s² */
  gravity: number
  /** 速度衰减系数 0–1 */
  damping: number
  /** 地面摩擦 */
  friction: number
  /** 地面弹性 */
  restitution: number
  /** 保留字段：Verlet 拖拽不需要力，仅旧工程兼容 */
  dragForce: number
  /** 求解迭代次数，越高越稳、越慢 */
  solverIterations: number
}

export interface RigDoc {
  version: 1
  name: string
  canvas: { width: number; height: number }
  /** 地面高度（画布像素） */
  ground: number
  params: RigParams
  joints: Joint[]
  bones: Bone[]
  parts: Part[]
  poses: Pose[]
}

export type EditorMode = 'edit' | 'play'




