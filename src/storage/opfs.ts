/**
 * 持久化：优先走本地小服务（文件落在工具目录的 data/ 下），
 * 服务不可用时退回浏览器 OPFS（隐藏目录）。
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

async function opfsWrite(name: string, text: string): Promise<boolean> {
  try {
    const dir = await navigator.storage.getDirectory()
    const handle = await dir.getFileHandle(name, { create: true })
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
    const dir = await navigator.storage.getDirectory()
    const handle = await dir.getFileHandle(name)
    const file = await handle.getFile()
    return await file.text()
  } catch {
    return null
  }
}

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

/** 删除文件（服务端不可用时忽略） */
export async function deleteFile(name: string): Promise<void> {
  try {
    await fetch(API + '?name=' + encodeURIComponent(name), { method: 'DELETE' })
  } catch {
    /* ignore */
  }
}

/** 页面卸载时同步落盘（sendBeacon 不受卸载中断影响） */
export function flushBeacon(name: string, text: string) {
  try {
    const blob = new Blob([text], { type: 'text/plain' })
    navigator.sendBeacon(API + '?name=' + encodeURIComponent(name), blob)
  } catch {
    /* ignore */
  }
}

/** 列出 data 下某个子目录的文件名；服务不可用时返回空 */
export async function listFiles(dir: string): Promise<string[]> {
  try {
    const res = await fetch('/api/list?dir=' + encodeURIComponent(dir))
    if (!res.ok) return []
    return (await res.json()) as string[]
  } catch {
    return []
  }
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

