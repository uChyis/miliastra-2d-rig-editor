/**
 * 持久化：优先走本地小服务（文件落在工具目录的 data/ 下），
 * 服务不可用时退回浏览器 OPFS（隐藏目录）。
 *
 * 注意：OPFS 的 getFileHandle() 只接受「文件名」，不接受 `docs/x.json` 这种带斜杠的路径，
 * 必须自己逐级 getDirectoryHandle()。否则在纯静态部署下所有标签页文档都存不下来。
 */
const API = '/api/file'

async function serverWrite(name: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(API + '?name=' + encodeURIComponent(name), {
      method: 'PUT',
      body: text,
      headers: { 'Content-Type': 'text/plain' },
    })
    return res.ok
  } catch {
    return false
  }
}

async function serverRead(name: string): Promise<string | null> {
  try {
    const res = await fetch(API + '?name=' + encodeURIComponent(name))
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

async function serverDelete(name: string): Promise<boolean> {
  try {
    const res = await fetch(API + '?name=' + encodeURIComponent(name), { method: 'DELETE' })
    return res.ok
  } catch {
    return false
  }
}

// ---------- OPFS ----------

type OpfsTarget = { dir: FileSystemDirectoryHandle; file: string }

/** 把 `docs/xxx.json` 拆成「目录句柄 + 文件名」，逐级创建或查找 */
async function resolveOpfs(name: string, create: boolean): Promise<OpfsTarget | null> {
  if (!navigator.storage?.getDirectory) return null
  const parts = name.split('/').filter(Boolean)
  if (!parts.length) return null
  let dir = await navigator.storage.getDirectory()
  for (const seg of parts.slice(0, -1)) {
    try {
      dir = await dir.getDirectoryHandle(seg, { create })
    } catch {
      return null
    }
  }
  return { dir, file: parts[parts.length - 1] }
}

async function opfsWrite(name: string, text: string): Promise<boolean> {
  try {
    const target = await resolveOpfs(name, true)
    if (!target) return false
    const handle = await target.dir.getFileHandle(target.file, { create: true })
    const writable = await handle.createWritable()
    await writable.write(text)
    await writable.close()
    return true
  } catch {
    return false
  }
}

async function opfsRead(name: string): Promise<string | null> {
  try {
    const target = await resolveOpfs(name, false)
    if (!target) return null
    const handle = await target.dir.getFileHandle(target.file)
    return await (await handle.getFile()).text()
  } catch {
    return null
  }
}

async function opfsDelete(name: string): Promise<boolean> {
  try {
    const target = await resolveOpfs(name, false)
    if (!target) return false
    await target.dir.removeEntry(target.file)
    return true
  } catch {
    return false
  }
}

async function opfsList(dirName: string): Promise<string[]> {
  try {
    const parts = dirName.split('/').filter(Boolean)
    let dir = await navigator.storage.getDirectory()
    for (const seg of parts) dir = await dir.getDirectoryHandle(seg)
    const names: string[] = []
    for await (const [entryName, handle] of (dir as unknown as {
      entries(): AsyncIterableIterator<[string, FileSystemHandle]>
    }).entries()) {
      if (handle.kind === 'file') names.push(entryName)
    }
    return names.sort()
  } catch {
    return []
  }
}

// ---------- 对外接口 ----------

export async function writeText(name: string, text: string): Promise<boolean> {
  if (await serverWrite(name, text)) return true
  return opfsWrite(name, text)
}

export async function readText(name: string): Promise<string | null> {
  const fromServer = await serverRead(name)
  if (fromServer !== null) return fromServer
  return opfsRead(name)
}

export const AUTOSAVE_FILE = 'rig.autosave.json'
export const HISTORY_FILE = 'rig.history.json'
export const CLIPBOARD_FILE = 'clipboard.json'
export const SETTINGS_FILE = 'settings.json'

export const WORKSPACE_FILE = 'workspace.json'

/** 标签对应的骨架文件与历史文件 */
export function docFile(tabId: string) {
  return 'docs/' + tabId + '.json'
}

export function historyFile(tabId: string) {
  return 'docs/' + tabId + '.history.json'
}

/** 删除文件：服务端与 OPFS 两边都清，避免残留孤儿 */
export async function deleteFile(name: string): Promise<void> {
  await Promise.all([serverDelete(name), opfsDelete(name)])
}

/** 页面卸载时同步落盘（sendBeacon 不受卸载中断影响；OPFS 在卸载期不可靠，仅走服务端） */
export function flushBeacon(name: string, text: string) {
  try {
    const blob = new Blob([text], { type: 'text/plain' })
    navigator.sendBeacon(API + '?name=' + encodeURIComponent(name), blob)
  } catch {
    /* ignore */
  }
}

/** 列出某个子目录的文件名；服务端不可用时退回 OPFS */
export async function listFiles(dir: string): Promise<string[]> {
  try {
    const res = await fetch('/api/list?dir=' + encodeURIComponent(dir))
    if (res.ok) {
      const names = (await res.json()) as string[]
      // 服务端可用时以它为准（哪怕是空目录），不要再用 OPFS 的旧数据
      if (Array.isArray(names)) return names
    }
  } catch {
    /* 落到 OPFS */
  }
  return opfsList(dir)
}

/** 删除 docs 下不属于任何打开标签的文件，返回删除数量 */
export async function cleanupOrphans(keepTabIds: string[]): Promise<number> {
  const keep = new Set(keepTabIds)
  const names = await listFiles('docs')
  let removed = 0
  for (const name of names) {
    const id = name.replace(/\.history\.json$/, '').replace(/\.json$/, '')
    if (keep.has(id)) continue
    await deleteFile('docs/' + name)
    removed += 1
  }
  return removed
}
