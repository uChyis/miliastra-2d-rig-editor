interface Props {
  lower: number
  upper: number
  current?: number
  parentName?: string
  size?: number
}

/**
 * 角度限制预览：
 * - 蓝色骨条 = 角度下限的极限姿态
 * - 琥珀骨条 = 角度上限的极限姿态
 * - 灰色实心 = 当前姿态
 * - 灰色虚线 = 0°（与父骨同向）
 */
export function AnglePreview({ lower, upper, current, size = 96 }: Props) {
  const r = size / 2 - 10
  const c = size / 2
  const lo = Math.min(lower, upper)
  const hi = Math.max(lower, upper)
  const enabled = lower !== upper

  const rad = (deg: number) => (deg * Math.PI) / 180
  const px = (deg: number) => c + r * Math.cos(rad(deg))
  const py = (deg: number) => c + r * Math.sin(rad(deg))

  const arc = 'M ' + px(lo) + ' ' + py(lo) +
    ' A ' + r + ' ' + r + ' 0 ' + (hi - lo > 180 ? 1 : 0) + ' 1 ' + px(hi) + ' ' + py(hi)

  const bar = (deg: number, color: string, width: number, opacity = 1) => (
    <g key={color + deg + width} opacity={opacity}>
      <line x1={c} y1={c} x2={px(deg)} y2={py(deg)} stroke={color} strokeWidth={width} strokeLinecap="round" />
      <circle cx={px(deg)} cy={py(deg)} r={width / 2 - 0.5} fill={color} />
    </g>
  )

  return (
    <div className="flex justify-center py-1">
      <svg width={size} height={size} viewBox={'0 0 ' + size + ' ' + size}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--slate-6)" strokeWidth={1} />
        {enabled ? <path d={arc} fill="none" stroke="var(--slate-7)" strokeWidth={1} strokeDasharray="3 3" /> : null}
        <line x1={c} y1={c} x2={px(0)} y2={py(0)} stroke="var(--slate-8)" strokeWidth={1} strokeDasharray="2 3" />
        {enabled ? bar(lo, 'var(--blue-9)', 6) : null}
        {enabled ? bar(hi, 'var(--amber-9)', 6) : null}
        {typeof current === 'number' ? bar(current, 'var(--slate-11)', 3, 0.9) : null}
        <circle cx={c} cy={c} r={3} fill="var(--slate-10)" />
      </svg>
    </div>
  )
}
