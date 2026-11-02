#!/usr/bin/env node
/**
 * OPFS 存储层检查（不需要浏览器）。
 *
 * 用一棵内存目录树模拟 OPFS，并且**刻意复刻规范**：
 * getFileHandle / getDirectoryHandle 的 name 里出现 "/" 直接抛错。
 * 所以这个 mock 能复现「docs/tab1.json 存不下来」这个原始 bug，
 * 也能证明修好之后写入/读取/列举/删除都对。
 */
import assert from 'node:assert/strict'

// ---------- 假 OPFS ----------

let fileStore = new Map() // path -> content
let dirStore = new Set(['']) // 已存在的目录路径

const joinPath = (base, name) => (base ? base + '/' + name : name)
const badName = name => name.includes('/') || name.includes('\\')

function makeFileHandle(fullPath) {
  return {
    kind: 'file',
    async getFile() {
      return { text: async () => fileStore.get(fullPath) ?? '' }
    },
    async createWritable() {
      let buf = ''
      return {
        async write(chunk) {
          buf += chunk
        },
        async close() {
          fileStore.set(fullPath, buf)
          dirStore.add(fullPath.split('/').slice(0, -1).join('/'))
        },
      }
    },
  }
}

function makeDirHandle(fullPath) {
  return {
    kind: 'directory',
    async getDirectoryHandle(name, opts = {}) {
      if (badName(name)) throw new TypeError('directory name must not contain "/"')
      const child = joinPath(fullPath, name)
      if (!dirStore.has(child)) {
        if (!opts.create) throw new DOMException('not found', 'NotFoundError')
        dirStore.add(child)
      }
      return makeDirHandle(child)
    },
    async getFileHandle(name, opts = {}) {
      // 规范：这里只接受文件名，不接受路径
      if (badName(name)) throw new TypeError('file name must not contain "/"')
      const child = joinPath(fullPath, name)
      if (!fileStore.has(child)) {
        if (!opts.create) throw new DOMException('not found', 'NotFoundError')
        fileStore.set(child, '')
        dirStore.add(fullPath)
      }
      return makeFileHandle(child)
    },
    async removeEntry(name) {
      const child = joinPath(fullPath, name)
      if (fileStore.delete(child)) return
      if (dirStore.delete(child)) return
      throw new DOMException('not found', 'NotFoundError')
    },
    async *entries() {
      const prefix = fullPath ? fullPath + '/' : ''
      const seen = new Set()
      for (const p of [...fileStore.keys(), ...dirStore]) {
        if (!p.startsWith(prefix) || p === fullPath) continue
        const rest = p.slice(prefix.length)
        const head = rest.split('/')[0]
        if (!head || seen.has(head)) continue
        seen.add(head)
        yield [head, { kind: rest.includes('/') ? 'directory' : 'file' }]
      }
    },
  }
}

// Node 24 的 navigator 是只读 getter，必须用 defineProperty 覆盖
Object.defineProperty(globalThis, 'navigator', {
  value: { storage: { getDirectory: async () => makeDirHandle('') } },
  configurable: true,
  writable: true,
})
// 让服务端路径必然失败，强制走 OPFS
Object.defineProperty(globalThis, 'fetch', {
  value: async () => {
    throw new Error('no server')
  },
  configurable: true,
  writable: true,
})

// ---------- 断言 ----------

const { writeText, readText, deleteFile, listFiles } = await import('../src/storage/opfs.ts')

let failed = 0
const check = async (label, fn) => {
  try {
    await fn()
    console.log('PASS  ' + label)
  } catch (e) {
    failed += 1
    console.log('FAIL  ' + label + ' — ' + (e?.message ?? e))
  }
}

await check('多级路径可写（docs/tab1.json）', async () => {
  const ok = await writeText('docs/tab1.json', '{"a":1}')
  assert.equal(ok, true, 'writeText 返回 false')
  assert.equal(fileStore.get('docs/tab1.json'), '{"a":1}')
})

await check('多级路径可读', async () => {
  assert.equal(await readText('docs/tab1.json'), '{"a":1}')
})

await check('历史文件可写可读', async () => {
  await writeText('docs/tab1.history.json', '{"past":[]}')
  assert.equal(await readText('docs/tab1.history.json'), '{"past":[]}')
})

await check('不同 tabId 互不干扰', async () => {
  await writeText('docs/tab2.json', '{"a":2}')
  assert.equal(await readText('docs/tab1.json'), '{"a":1}')
  assert.equal(await readText('docs/tab2.json'), '{"a":2}')
})

await check('目录列举', async () => {
  const names = await listFiles('docs')
  assert.deepEqual(names, ['tab1.history.json', 'tab1.json', 'tab2.json'])
})

await check('删除同时清理内容', async () => {
  await deleteFile('docs/tab2.json')
  assert.equal(await readText('docs/tab2.json'), null)
  assert.equal(fileStore.has('docs/tab2.json'), false)
})

await check('顶层文件（workspace.json）不受影响', async () => {
  await writeText('workspace.json', '{"tabs":[]}')
  assert.equal(await readText('workspace.json'), '{"tabs":[]}')
})

await check('读取不存在的文件返回 null', async () => {
  assert.equal(await readText('docs/nope.json'), null)
})

if (failed) {
  console.log(`\n${failed} 项失败`)
  process.exit(1)
}
console.log('\n全部通过')
