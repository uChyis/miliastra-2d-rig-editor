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
}

const KINDS: Record<string, SceneElement['type']> = {
  rectangle: 'rectangle',
  rect: 'rectangle',
  ellipse: 'ellipse',
  circle: 'ellipse',
  triangle: 'triangle',
  tri: 'triangle',
}

/** 解析矢量工具导出的 scene JSON（canvas + elements） */
export function parseScene(raw: unknown): ParsedScene {
  const data = raw as { canvas?: { width?: number; height?: number }; elements?: RawElement[] }
  const list = Array.isArray(data.elements) ? data.elements : []
  if (!list.length) throw new Error('没有 elements')

  const elements: SceneElement[] = []
  list.forEach((el, i) => {
    const type = KINDS[String(el.type ?? 'rectangle')] ?? 'rectangle'
    const x = Number(el.x ?? 0)
    const y = Number(el.y ?? 0)
    const width = Math.max(0.5, Number(el.width ?? 1))
    const height = Math.max(0.5, Number(el.height ?? 1))
    elements.push({
      id: el.id ? String(el.id) : 'el' + i,
      type,
      x,
      y,
      width,
      height,
      rotation: Number(el.rotation ?? 0),
      color: typeof el.color === 'string' ? el.color : '#888888',
      opacity: typeof el.opacity === 'number' ? el.opacity : 1,
      zIndex: typeof el.zIndex === 'number' ? el.zIndex : i,
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

  const xs = elements.map(e => e.x)
  const ys = elements.map(e => e.y)
  const width = Number(data.canvas?.width ?? Math.max(...xs) + 20)
  const height = Number(data.canvas?.height ?? Math.max(...ys) + 20)

  return { width, height, elements: elements.sort((a, b) => a.zIndex - b.zIndex) }
}
