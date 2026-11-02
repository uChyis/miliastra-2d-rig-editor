/**
 * 撤销历史的「闸门」：决定这一刻要不要压快照。
 *
 * 每个标签页必须独立——否则在 A 标签拖动时压下的快照/手势标志会带进 B 标签，
 * 表现为"A 撤销影响了 B"或者"刚切过去就撤不动"。
 * 单独成模块是为了能在 Node 里直接测（rigStore 依赖 zustand/React，不好在测试里引入）。
 */
export interface GestureGate {
  /** 正在拖拽/连续编辑：期间不压快照，整段算一步 */
  inGesture: boolean
  /** 上次压快照的时间戳，用于节流 */
  lastSnapAt: number
}

const gates = new Map<string, GestureGate>()

const KEY_NONE = '__none__'

export function gateOf(tabId: string | null): GestureGate {
  const key = tabId ?? KEY_NONE
  let gate = gates.get(key)
  if (!gate) {
    gate = { inGesture: false, lastSnapAt: 0 }
    gates.set(key, gate)
  }
  return gate
}

/**
 * 这一刻是否应该压快照。返回 true 时会顺手记下时间戳。
 * 注意：判定与记录必须在一起，否则两次调用会重复压栈。
 */
export function shouldSnapshot(tabId: string | null, now: number, throttleMs = 400): boolean {
  const gate = gateOf(tabId)
  if (gate.inGesture) return false
  if (now - gate.lastSnapAt < throttleMs) return false
  gate.lastSnapAt = now
  return true
}

export function beginGesture(tabId: string | null): void {
  gateOf(tabId).inGesture = true
}

/** 手势结束：解除标志，并放开节流，让下一步编辑立刻能压快照 */
export function endGesture(tabId: string | null): void {
  const gate = gateOf(tabId)
  gate.inGesture = false
  gate.lastSnapAt = 0
}

/** 关闭标签页时清掉它的状态，避免开回同名 tab 时继承旧节流 */
export function forgetTab(tabId: string): void {
  gates.delete(tabId)
}

/** 仅测试用 */
export function resetGates(): void {
  gates.clear()
}
