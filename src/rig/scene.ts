import type { SceneElement } from './types'

interface RawElement {
  id?: string
  type?: string
  x?: number
  y?: number
  width?: number
  height?: number
  rotation?: number
  color?: string
  opacity?: number
  zIndex?: number
}

export interface ParsedScene {
  width: number
  height: number
  elements: SceneElement[]
  /** 不致命但需要告知用户的问题（已按规则修正） */
  warnings: string[]
}

const KINDS: Record<string, SceneElement['type']> = {
  rectangle: 'rectangle',
  rect: 'rectangle',
  ellipse: 'ellipse',
  circle: 'ellipse',
  triangle: 'triangle',
  tri: 'triangle',
}

const COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
const DEFAULT_COLOR = '#888888'

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * 解析矢量工具导出的 scene JSON（canvas + elements）。
 *
 * 不静默改图：不认识的图元类型、非法坐标都会报错并指出是哪个元素；
 * 只有颜色、尺寸这类能安全兜底的字段才用默认值，并把修正记进 warnings。
 */
export function parseScene(raw: unknown): ParsedScene {
  const data = raw as { canvas?: { width?: number; height?: number }; elements?: RawElement[] }
  const list = Array.isArray(data?.elements) ? data.elements : []
  if (!list.length) throw new Error('没有 elements')

  const warnings: string[] = []
  const unknownTypes: string[] = []
  const badGeometry: string[] = []
  const badColors: string[] = []
  const clamped: string[] = []
  const elements: SceneElement[] = []

  list.forEach((el, i) => {
    const label = el?.id ? String(el.id) : `第 ${i + 1} 个元素`
    const kind = String(el?.type ?? 'rectangle')
    const mapped = KINDS[kind]
    if (!mapped) {
      unknownTypes.push(`${label}（${kind}）`)
      return
    }

    const x = Number(el.x ?? 0)
    const y = Number(el.y ?? 0)
    const rawW = Number(el.width ?? 1)
    const rawH = Number(el.height ?? 1)
    if (!finite(x) || !finite(y) || !finite(rawW) || !finite(rawH)) {
      badGeometry.push(label)
      return
    }

    let width = rawW
    let height = rawH
    if (width < 0.5 || height < 0.5) {
      width = Math.max(0.5, width)
      height = Math.max(0.5, height)
      clamped.push(label)
    }

    const color = typeof el.color === 'string' ? el.color : ''
    if (!COLOR_RE.test(color)) badColors.push(label)

    elements.push({
      id: el.id ? String(el.id) : 'el' + i,
      type: mapped,
      x,
      y,
      width,
      height,
      rotation: finite(Number(el.rotation ?? 0)) ? Number(el.rotation ?? 0) : 0,
      color: COLOR_RE.test(color) ? color : DEFAULT_COLOR,
      opacity: finite(Number(el.opacity ?? 1)) ? Math.max(0, Math.min(1, Number(el.opacity ?? 1))) : 1,
      zIndex: finite(Number(el.zIndex ?? i)) ? Number(el.zIndex ?? i) : i,
      mask: (el as { luaMask?: { enabled?: boolean; imageId?: number; offsetX?: number; offsetY?: number; width?: number; height?: number; reverseMaskArea?: boolean; enableSoftEdge?: boolean } }).luaMask
        ? {
            imageId: Number((el as any).luaMask.imageId ?? 106081),
            offsetX: Number((el as any).luaMask.offsetX ?? 0),
            offsetY: Number((el as any).luaMask.offsetY ?? 0),
            width: Number((el as any).luaMask.width ?? 0),
            height: Number((el as any).luaMask.height ?? 0),
            reverse: Boolean((el as any).luaMask.reverseMaskArea),
            softEdge: Boolean((el as any).luaMask.enableSoftEdge),
          }
        : undefined,
    })
  })

  if (unknownTypes.length) {
    throw new Error(
      `不支持的图元类型：${unknownTypes.slice(0, 6).join('、')}` +
        (unknownTypes.length > 6 ? `…共 ${unknownTypes.length} 个` : '') +
        '。请只使用矩形 / 椭圆 / 三角形（多边形请先拆成三角形）。',
    )
  }
  if (badGeometry.length) {
    throw new Error(`图元坐标或尺寸不是有效数值：${badGeometry.slice(0, 6).join('、')}`)
  }

  if (badColors.length) {
    warnings.push(
      `${badColors.length} 个图元颜色无法识别，已按 ${DEFAULT_COLOR} 处理：${badColors.slice(0, 5).join('、')}`,
    )
  }
  if (clamped.length) {
    warnings.push(
      `${clamped.length} 个图元宽高小于 0.5px，已抬到 0.5px：${clamped.slice(0, 5).join('、')}`,
    )
  }

  const xs = elements.map(e => e.x)
  const ys = elements.map(e => e.y)
  const width = Number(data.canvas?.width ?? Math.max(...xs) + 20)
  const height = Number(data.canvas?.height ?? Math.max(...ys) + 20)

  return {
    width,
    height,
    elements: elements.sort((a, b) => a.zIndex - b.zIndex),
    warnings,
  }
}
