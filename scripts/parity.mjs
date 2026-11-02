#!/usr/bin/env node
/**
 * TS ↔ Lua 物理一致性对照。
 *
 * 同一组初值和同一串 dt，分别喂给 src/physics/verlet.ts 和导出 Lua，
 * 逐次 Update 比较每个关节坐标，输出最大偏差。
 *
 * 用法：
 *   node scripts/parity.mjs            # 需要 lua53
 *   LUA53=D:\Lua\lua53.exe node scripts/parity.mjs
 *
 * 没有 lua53 时只跑 TS 侧并提示跳过（退出码 0），不影响 CI。
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { VerletEngine } from '../src/physics/verlet.ts'
import { toLua } from '../src/export/exportLua.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const LUA = process.env.LUA53 || 'C:\\Tools\\Lua\\lua53.exe'
const DRIVER = path.join(here, 'lua-driver.lua')
const TOLERANCE = 1e-6

// ---------- 构造场景 ----------

const baseDoc = (over = {}) => ({
  version: 1,
  name: 'parity',
  canvas: { width: 400, height: 400 },
  ground: 360,
  params: {
    gravity: 0,
    damping: 0.99,
    friction: 0.6,
    restitution: 0.2,
    dragForce: 320,
    solverIterations: 8,
  },
  joints: [],
  bones: [],
  parts: [],
  poses: [],
  ...over,
})

const J = (id, x, y, pinned = false) => ({ id, name: id, x, y, radius: 5, pinned })
const B = (id, a, b, parent, over = {}) => ({
  id,
  name: id,
  a,
  b,
  parent,
  width: 10,
  mass: 1,
  friction: 0.4,
  restitution: 0.1,
  damping: 0.1,
  limitMode: 'none',
  stiffness: 3,
  limitLower: 0,
  limitUpper: 0,
  ...over,
})

const fps60 = n => Array.from({ length: n }, () => 1 / 60)

const scenarios = [
  {
    name: '静止（重力 0）',
    doc: baseDoc({ joints: [J('a', 100, 100), J('b', 100, 180)], bones: [B('ab', 'a', 'b')] }),
    dts: fps60(20),
  },
  {
    name: '自由落体',
    doc: baseDoc({
      params: { ...baseDoc().params, gravity: 1 },
      joints: [J('a', 100, 60), J('b', 100, 140)],
      bones: [B('ab', 'a', 'b')],
    }),
    dts: fps60(30),
  },
  {
    name: '阻尼衰减（初速 → 重力 0）',
    doc: baseDoc({
      params: { ...baseDoc().params, damping: 0.9 },
      joints: [J('a', 100, 100), J('b', 140, 100)],
      bones: [B('ab', 'a', 'b')],
    }),
    dts: fps60(30),
  },
  {
    name: '地面反弹',
    doc: baseDoc({
      params: { ...baseDoc().params, gravity: 1, restitution: 0.5 },
      ground: 200,
      joints: [J('a', 100, 60), J('b', 140, 60)],
      bones: [B('ab', 'a', 'b')],
    }),
    dts: fps60(60),
  },
  {
    name: '三节链 + 一端固定',
    doc: baseDoc({
      params: { ...baseDoc().params, gravity: 1 },
      joints: [J('a', 100, 60, true), J('b', 100, 140), J('c', 100, 220), J('d', 140, 220)],
      bones: [B('ab', 'a', 'b'), B('bc', 'b', 'c', 'ab'), B('cd', 'c', 'd', 'bc')],
    }),
    dts: fps60(40),
  },
  {
    name: '硬角度限制',
    doc: baseDoc({
      params: { ...baseDoc().params, gravity: 1 },
      joints: [J('a', 100, 60, true), J('b', 100, 140), J('c', 180, 200)],
      bones: [
        B('ab', 'a', 'b'),
        B('bc', 'b', 'c', 'ab', { limitMode: 'hard', limitLower: -10, limitUpper: 10 }),
      ],
    }),
    dts: fps60(40),
  },
  {
    name: '软回弹限制',
    doc: baseDoc({
      params: { ...baseDoc().params, gravity: 1 },
      joints: [J('a', 100, 60, true), J('b', 100, 140), J('c', 180, 200)],
      bones: [
        B('ab', 'a', 'b'),
        B('bc', 'b', 'c', 'ab', { limitMode: 'soft', limitLower: -10, limitUpper: 10 }),
      ],
    }),
    dts: fps60(40),
  },
  {
    name: '大 dt（累积器 / 子步上限）',
    doc: baseDoc({
      params: { ...baseDoc().params, gravity: 1 },
      joints: [J('a', 100, 60), J('b', 100, 140)],
      bones: [B('ab', 'a', 'b')],
    }),
    dts: [0.5, 0.5, 0.5],
  },
  {
    name: '异常 dt：0 / 负数 / NaN / Infinity / 极大',
    doc: baseDoc({
      params: { ...baseDoc().params, gravity: 1 },
      joints: [J('a', 100, 60), J('b', 100, 140)],
      bones: [B('ab', 'a', 'b')],
    }),
    dts: [0, 0, 1 / 60, -1, -0.5, Number.NaN, 1 / 60, Infinity, -Infinity, 1e9, 1 / 60],
  },
]

// ---------- 两端执行 ----------

function runTS(doc, dts) {
  const engine = new VerletEngine(doc)
  return dts.map(dt => engine.step(dt).joints)
}

function runLua(doc, dts) {
  const dir = mkdtempSync(path.join(tmpdir(), 'rig-parity-'))
  try {
    const rigPath = path.join(dir, 'rig.lua')
    writeFileSync(rigPath, toLua(doc), 'utf8')
    // 编码 dt：特殊值用标记传给 Lua，保持两端拿到的是同一个数
    const encoded = dts
      .map(d => {
        if (Number.isNaN(d)) return 'nan'
        if (d === Infinity) return 'inf'
        if (d === -Infinity) return '-inf'
        return Number(d).toFixed(10)
      })
      .join(',')
    const out = execFileSync(LUA, [DRIVER, rigPath, encoded], {
      encoding: 'utf8',
    })
    const lines = out.trim().split(/\r?\n/)
    const ids = lines[0].replace(/^IDS /, '').split(',')
    return lines.slice(1).map(line => {
      const nums = line.split(',').map(Number)
      const joints = {}
      ids.forEach((id, i) => {
        joints[id] = { x: nums[i * 2], y: nums[i * 2 + 1] }
      })
      return joints
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ---------- 比对 ----------

function compare(tsFrames, luaFrames, jointIds) {
  let worst = { delta: 0, joint: '-', step: -1 }
  const steps = Math.min(tsFrames.length, luaFrames.length)
  for (let s = 0; s < steps; s++) {
    for (const id of jointIds) {
      const t = tsFrames[s]?.[id]
      const l = luaFrames[s]?.[id]
      if (!t || !l) continue
      const d = Math.max(Math.abs(t.x - l.x), Math.abs(t.y - l.y))
      if (d > worst.delta) worst = { delta: d, joint: id, step: s + 1 }
    }
  }
  return worst
}

// ---------- 主流程 ----------

let luaOk = true
try {
  execFileSync(LUA, ['-v'], { stdio: 'ignore' })
} catch {
  luaOk = false
}

if (!luaOk) {
  // CI 里不允许静默跳过：没有 Lua 就等于这项没测，必须让流水线红
  const strict = process.env.REQUIRE_LUA === '1' || !!process.env.CI
  if (strict) {
    console.error(`[失败] 找不到 lua5.3：${LUA}`)
    console.error('CI / REQUIRE_LUA=1 下不允许跳过。请安装 lua5.3 或设置 LUA53 指向它。')
    process.exit(1)
  }
  console.log(`[跳过 Lua 侧] 找不到解释器：${LUA}`)
  console.log('设置环境变量 LUA53 指向你的 lua5.3 可执行文件后重跑。')
  console.log('（TS 侧仍会跑一遍，确保场景构造没报错）')
  for (const sc of scenarios) runTS(sc.doc, sc.dts)
  process.exit(0)
}

console.log(`lua: ${LUA}`)
console.log(`容差: ${TOLERANCE}\n`)

let failed = 0
const rows = []
for (const sc of scenarios) {
  const tsFrames = runTS(sc.doc, sc.dts)
  const luaFrames = runLua(sc.doc, sc.dts)
  const ids = sc.doc.joints.map(j => j.id)
  const worst = compare(tsFrames, luaFrames, ids)
  const pass = worst.delta <= TOLERANCE
  if (!pass) failed += 1
  rows.push({ 场景: sc.name, 步数: sc.dts.length, 最大偏差: worst.delta.toExponential(2), 位置: `${worst.joint}@第${worst.step}步`, 结果: pass ? 'PASS' : 'FAIL' })
}

console.table(rows)
if (failed) {
  console.log(`\n${failed}/${scenarios.length} 个场景不一致 —— 说明两端物理还没对齐。`)
  process.exit(1)
}
console.log(`\n全部 ${scenarios.length} 个场景一致。`)
