#!/usr/bin/env node
/**
 * 数据层检查：工程校验（validateDoc）与矢量稿解析（parseScene）。
 * 只验证「能不能安全读进来」，不改数据。
 */
import assert from 'node:assert/strict'

import { validateDoc } from '../src/rig/validate.ts'
import { parseScene } from '../src/rig/scene.ts'
import { prepareImportedDoc } from '../src/rig/migrate.ts'
import { restoreTabs } from '../src/rig/restore.ts'
import { beginGesture, endGesture, forgetTab, gateOf, resetGates, shouldSnapshot } from '../src/store/historyGate.ts'

let failed = 0
const check = (label, fn) => {
  try {
    fn()
    console.log('PASS  ' + label)
  } catch (e) {
    failed += 1
    console.log('FAIL  ' + label + ' — ' + (e?.message ?? e))
  }
}

const checkAsync = async (label, fn) => {
  try {
    await fn()
    console.log('PASS  ' + label)
  } catch (e) {
    failed += 1
    console.log('FAIL  ' + label + ' — ' + (e?.message ?? e))
  }
}

const doc = (over = {}) => ({
  version: 1,
  name: 't',
  canvas: { width: 400, height: 400 },
  ground: 360,
  params: { gravity: 0, damping: 0.99, friction: 0.6, restitution: 0.2, dragForce: 320, solverIterations: 8 },
  joints: [
    { id: 'a', name: 'a', x: 100, y: 100, radius: 5, pinned: false },
    { id: 'b', name: 'b', x: 100, y: 180, radius: 5, pinned: false },
  ],
  bones: [
    { id: 'ab', name: 'ab', a: 'a', b: 'b', width: 10, mass: 1, friction: 0.4, restitution: 0.1, damping: 0.1, limitMode: 'none', stiffness: 3, limitLower: 0, limitUpper: 0 },
  ],
  parts: [],
  poses: [],
  ...over,
})

// ---- validateDoc ----

check('合法工程无致命问题', () => {
  const r = validateDoc(doc())
  assert.deepEqual(r.fatal, [])
})

check('缺 joints 判为致命', () => {
  const r = validateDoc({ ...doc(), joints: undefined })
  assert.ok(r.fatal.some(m => m.includes('joints')))
})

check('关节 id 重复判为致命', () => {
  const d = doc()
  d.joints.push({ id: 'a', name: 'a2', x: 0, y: 0, radius: 5, pinned: false })
  assert.ok(validateDoc(d).fatal.some(m => m.includes('重复')))
})

check('骨骼引用不存在的关节判为致命', () => {
  const d = doc()
  d.bones[0].b = 'zzz'
  assert.ok(validateDoc(d).fatal.some(m => m.includes('不存在的关节')))
})

check('骨骼两端相同判为致命', () => {
  const d = doc()
  d.bones[0].b = 'a'
  assert.ok(validateDoc(d).fatal.some(m => m.includes('同一个关节')))
})

check('父骨成环判为致命', () => {
  const d = doc()
  d.joints.push({ id: 'c', name: 'c', x: 100, y: 260, radius: 5, pinned: false })
  d.bones.push({ ...d.bones[0], id: 'bc', a: 'b', b: 'c', parent: 'ab' })
  d.bones[0].parent = 'bc'
  assert.ok(validateDoc(d).fatal.some(m => m.includes('成环')))
})

check('关节坐标 NaN 判为致命', () => {
  const d = doc()
  d.joints[0].x = Number.NaN
  assert.ok(validateDoc(d).fatal.some(m => m.includes('有效数值')))
})

check('父骨不存在只给提示', () => {
  const d = doc()
  d.bones[0].parent = 'nope'
  const r = validateDoc(d)
  assert.deepEqual(r.fatal, [])
  assert.ok(r.warnings.some(m => m.includes('父骨不存在')))
})

check('版本不同只给提示（保证老工程可读）', () => {
  const r = validateDoc(doc({ version: 2 }))
  assert.deepEqual(r.fatal, [])
  assert.ok(r.warnings.some(m => m.includes('版本')))
})

check('姿势重名给提示', () => {
  const d = doc()
  d.poses = [
    { id: 'p1', name: 'idle', joints: {} },
    { id: 'p2', name: 'idle', joints: {} },
  ]
  const r = validateDoc(d)
  assert.deepEqual(r.fatal, [])
  assert.ok(r.warnings.some(m => m.includes('姿势名称重复')))
})

check('部件绑定不存在的骨骼给提示', () => {
  const d = doc()
  d.parts = [{ id: 'p', name: 'p', imageId: 100001, bone: 'nope', width: 10, height: 10, x: 0, y: 0, scale: 1, offsetX: 0, offsetY: 0, rotation: 0, z: 1 }]
  const r = validateDoc(d)
  assert.deepEqual(r.fatal, [])
  assert.ok(r.warnings.some(m => m.includes('不存在的骨骼')))
})

// ---- parseScene ----

const scene = (elements, canvas = { width: 100, height: 100 }) => ({ canvas, elements })

check('合法矢量稿解析通过', () => {
  const r = parseScene(scene([{ id: 'r1', type: 'rectangle', x: 10, y: 10, width: 5, height: 5, color: '#ff0000', opacity: 1 }]))
  assert.equal(r.elements.length, 1)
  assert.deepEqual(r.warnings, [])
})

check('未知图元类型报错并指出元素', () => {
  assert.throws(
    () => parseScene(scene([{ id: 'bad1', type: 'polygon', x: 0, y: 0, width: 5, height: 5, color: '#fff000' }])),
    /polygon/,
  )
})

check('坐标非数值报错', () => {
  // 缺字段会按 0 兜底（可接受），但显式给了非数值就必须报错
  assert.throws(
    () => parseScene(scene([{ id: 'bad2', type: 'rectangle', x: 'abc', y: 0, width: 5, height: 5, color: '#ff0000' }])),
    /有效数值/,
  )
  assert.throws(
    () => parseScene(scene([{ id: 'bad3', type: 'rectangle', x: Number.NaN, y: 0, width: 5, height: 5, color: '#ff0000' }])),
    /有效数值/,
  )
})

check('颜色无法识别给提示并兜底', () => {
  const r = parseScene(scene([{ id: 'c1', type: 'rectangle', x: 1, y: 1, width: 5, height: 5, color: 'red' }]))
  assert.equal(r.elements[0].color, '#888888')
  assert.ok(r.warnings.some(m => m.includes('颜色')))
})

check('过小尺寸被抬到 0.5 并给提示', () => {
  const r = parseScene(scene([{ id: 's1', type: 'rectangle', x: 1, y: 1, width: 0.1, height: 0.1, color: '#ff0000' }]))
  assert.equal(r.elements[0].width, 0.5)
  assert.ok(r.warnings.some(m => m.includes('0.5px')))
})

// ---- prepareImportedDoc：旧工程兼容（缺 params）----

check('缺整个 params 时补默认值且不抛错', () => {
  const raw = doc()
  delete raw.params
  const out = prepareImportedDoc(raw)
  assert.deepEqual(out.params, {
    gravity: 0,
    damping: 0.99,
    friction: 0.6,
    restitution: 0.2,
    dragForce: 320,
    solverIterations: 8,
  })
})

check('只缺部分 params 字段时保留已有值', () => {
  const raw = doc({ params: { gravity: 0.5, damping: 0.9 } })
  const out = prepareImportedDoc(raw)
  assert.equal(out.params.gravity, 0.5)
  assert.equal(out.params.damping, 0.9)
  assert.equal(out.params.dragForce, 320)
  assert.equal(out.params.solverIterations, 8)
})

check('缺 canvas / ground / parts / poses 时补默认值', () => {
  const raw = doc()
  delete raw.canvas
  delete raw.ground
  delete raw.parts
  delete raw.poses
  const out = prepareImportedDoc(raw)
  assert.deepEqual(out.canvas, { width: 820, height: 620 })
  assert.equal(out.ground, 560)
  assert.deepEqual(out.parts, [])
  assert.deepEqual(out.poses, [])
})

check('不是工程对象时给出明确错误', () => {
  assert.throws(() => prepareImportedDoc({ version: 1 }), /joints/)
})

// ---- restoreTabs：单个损坏不影响其它标签 ----

await checkAsync('三个标签中一个损坏，其余正常恢复', async () => {
  const files = {
    'docs/a.json': JSON.stringify(doc()),
    'docs/b.json': '{ this is not json',
    'docs/c.json': JSON.stringify((() => {
      const d = doc()
      delete d.params
      return d
    })()),
  }
  const read = async name => files[name] ?? null
  const res = await restoreTabs(
    [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ],
    read,
    id => `docs/${id}.json`,
    id => `docs/${id}.history.json`,
    { jointRadius: 5, boneWidth: 6 },
  )
  assert.deepEqual(res.kept.map(t => t.id), ['a', 'c'])
  assert.deepEqual(res.failed.map(f => f.id), ['b'])
  assert.ok(res.failed[0].reason.length > 0, '损坏原因应非空')
  assert.ok(res.docs.a && res.docs.c, '正常工程应恢复')
  assert.equal(res.docs.b, undefined, '损坏工程不应进入 docs')
  // 缺 params 的旧工程也要能恢复
  assert.equal(res.docs.c.params.solverIterations, 8)
})

await checkAsync('文件缺失的标签单独标记为失败', async () => {
  const read = async () => null
  const res = await restoreTabs([{ id: 'x', name: 'X' }], read, id => id + '.json', id => id + '.his', {
    jointRadius: 5,
    boneWidth: 6,
  })
  assert.deepEqual(res.kept, [])
  assert.equal(res.failed.length, 1)
  assert.match(res.failed[0].reason, /不存在/)
})

await checkAsync('历史文件损坏只丢历史，工程仍恢复', async () => {
  const files = {
    'docs/a.json': JSON.stringify(doc()),
    'docs/a.his.json': 'broken',
  }
  const read = async name => files[name] ?? null
  const res = await restoreTabs([{ id: 'a', name: 'A' }], read, id => `docs/${id}.json`, id => `docs/${id}.his.json`, {
    jointRadius: 5,
    boneWidth: 6,
  })
  assert.deepEqual(res.kept.map(t => t.id), ['a'])
  assert.equal(res.histories.a, undefined)
})

// ---- historyGate：撤销状态按标签隔离 ----

await checkAsync('A 标签拖拽中不影响 B 的撤销触发', async () => {
  resetGates()
  beginGesture('tabA')
  assert.equal(shouldSnapshot('tabA', 1000), false, 'A 在手势中不该压快照')
  assert.equal(shouldSnapshot('tabB', 1000), true, 'B 不受 A 的手势影响')
})

await checkAsync('节流窗口按标签分别计时', async () => {
  resetGates()
  assert.equal(shouldSnapshot('A', 1000), true)
  assert.equal(shouldSnapshot('A', 1200), false, '400ms 内应被节流')
  assert.equal(shouldSnapshot('B', 1200), true, 'B 有自己的计时')
  assert.equal(shouldSnapshot('A', 1450), true, '超过窗口后恢复')
})

await checkAsync('结束手势后立刻允许压快照', async () => {
  resetGates()
  beginGesture('A')
  assert.equal(shouldSnapshot('A', 5000), false)
  endGesture('A')
  assert.equal(shouldSnapshot('A', 5000), true)
})

await checkAsync('关闭标签后状态被清理', async () => {
  resetGates()
  beginGesture('X')
  forgetTab('X')
  assert.equal(gateOf('X').inGesture, false)
})

if (failed) {
  console.log(`\n${failed} 项失败`)
  process.exit(1)
}
console.log('\n全部通过')

