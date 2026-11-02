#!/usr/bin/env node
/**
 * 导出侧检查：复合图元的坐标系 + 用户输入的字符串转义。
 *
 * 1) 图元局部坐标 = 场景坐标 − 部件画布的一半（不是减世界坐标）
 * 2) 名字里带引号/反斜杠/换行时，导出的 Lua 仍然语法正确
 *
 * 用法：node scripts/export-check.mjs   （需要 lua53，路径见 LUA53）
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { toLua } from '../src/export/exportLua.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const LUA = process.env.LUA53 || 'C:\\Tools\\Lua\\lua53.exe'
const DRIVER = path.join(here, 'export-check.lua')

try {
  execFileSync(LUA, ['-v'], { stdio: 'ignore' })
} catch {
  console.log(`[跳过] 找不到 lua53：${LUA}（设置 LUA53 后重跑）`)
  process.exit(0)
}

const dir = mkdtempSync(path.join(tmpdir(), 'rig-export-'))
const writeRig = (doc, name) => {
  const file = path.join(dir, name + '.lua')
  writeFileSync(file, toLua(doc), 'utf8')
  return file
}
const runDriver = file =>
  execFileSync(LUA, [DRIVER, file], { encoding: 'utf8' })
    .trim()
    .split(/\r?\n/)
    .map(line => {
      const [kind, partId, x, y, rot] = line.split(' ')
      return { kind, partId, x: Number(x), y: Number(y), rot: Number(rot) }
    })

let failed = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`)
  if (!ok) failed += 1
}

// ---------- 1) 坐标系 ----------

const sceneW = 200
const sceneH = 100
const scale = 2
const elX = 50
const elY = 30
const boneMid = { x: 400, y: 300 } // 故意让世界坐标远离 sceneW/2，混用空间必然算错

const geoDoc = {
  version: 1,
  name: 'geo',
  canvas: { width: 800, height: 600 },
  ground: 560,
  params: { gravity: 0, damping: 0.99, friction: 0.6, restitution: 0.2, dragForce: 320, solverIterations: 8 },
  joints: [
    { id: 'a', name: 'a', x: boneMid.x, y: boneMid.y - 40, radius: 5, pinned: false },
    { id: 'b', name: 'b', x: boneMid.x, y: boneMid.y + 40, radius: 5, pinned: false },
  ],
  bones: [
    {
      id: 'ab', name: 'ab', a: 'a', b: 'b', width: 10, mass: 1, friction: 0.4, restitution: 0.1,
      damping: 0.1, limitMode: 'none', stiffness: 3, limitLower: 0, limitUpper: 0,
    },
  ],
  parts: [
    {
      id: 'p1', name: 'p1', imageId: 100001, bone: 'ab', width: sceneW, height: sceneH,
      x: 0, y: 0, scale, offsetX: 0, offsetY: 0, rotation: 0, z: 1,
      sceneWidth: sceneW, sceneHeight: sceneH,
      elements: [
        {
          id: 'e1', type: 'rectangle', x: elX, y: elY, width: 10, height: 10,
          rotation: 0, color: '#ff0000', opacity: 1, zIndex: 0,
        },
      ],
    },
  ],
  poses: [],
}

const rows = runDriver(writeRig(geoDoc, 'geo'))
const el = rows.find(r => r.kind === 'ELEMENT' && r.partId === 'p1')
const expectedX = elX * scale - (sceneW * scale) / 2
const expectedY = elY * scale - (sceneH * scale) / 2
check(
  !!el && Math.abs(el.x - expectedX) < 1e-6 && Math.abs(el.y - expectedY) < 1e-6,
  '图元局部坐标以部件画布中心为原点',
  el ? `实际 (${el.x}, ${el.y}) 期望 (${expectedX}, ${expectedY})` : '没有生成图元控件',
)

const grp = rows.find(r => r.kind === 'GROUP' && r.partId === 'p1')
check(!!grp, '部件组节点已创建', grp ? `组位置 (${grp.x}, ${grp.y})` : '')

// ---------- 2) 字符串转义 ----------

const nastyName = 'he"ad\\x\n第二行'
const escDoc = {
  ...geoDoc,
  name: 'doc"name\nline2',
  joints: [
    { id: 'a', name: nastyName, x: 100, y: 100, radius: 5, pinned: false },
    { id: 'b', name: 'b', x: 100, y: 180, radius: 5, pinned: false },
  ],
  // 数值里塞一个 NaN，检查不会被写成非法 Lua
  poses: [{ id: 'p', name: 'po"se', joints: { a: { x: 100, y: 100 }, b: { x: Number.NaN, y: 180 } } }],
}

const escFile = writeRig(escDoc, 'esc')
let syntaxOk = true
let syntaxErr = ''
try {
  const snippet =
    `local f, e = loadfile([==[${escFile}]==]); ` +
    `if not f then io.stderr:write(tostring(e)); os.exit(1) end`
  execFileSync(LUA, ['-e', snippet], { stdio: 'pipe' })
} catch (e) {
  syntaxOk = false
  syntaxErr = String(e.stderr || e.message).split('\n')[0]
}
check(syntaxOk, '带引号/反斜杠/换行的名字仍能导出合法 Lua', syntaxErr)

let runOk = true
let runErr = ''
try {
  runDriver(escFile)
} catch (e) {
  runOk = false
  runErr = String(e.stderr || e.message).split('\n')[0]
}
check(runOk, '非法名字的结构仍能被引擎加载', runErr)

rmSync(dir, { recursive: true, force: true })

if (failed) {
  console.log(`\n${failed} 项失败`)
  process.exit(1)
}
console.log('\n全部通过')
