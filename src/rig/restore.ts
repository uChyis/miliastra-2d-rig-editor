import type { RigDoc } from './types.ts'
// 显式带 .ts：这个模块会被 scripts/*.mjs 直接 import（Node 不做扩展名补全）
import { prepareImportedDoc } from './migrate.ts'
import { validateDoc } from './validate.ts'

export interface TabRef {
  id: string
  name: string
}

export interface RestoreFailure {
  id: string
  name: string
  reason: string
}

export interface RestoreResult {
  docs: Record<string, RigDoc>
  histories: Record<string, { past: RigDoc[]; future: RigDoc[] }>
  /** 成功恢复的标签 */
  kept: TabRef[]
  /** 打不开的标签（原始文件必须保留，不能当孤儿删掉） */
  failed: RestoreFailure[]
}

/**
 * 恢复工作区里的多个标签。
 *
 * 每个标签**独立** try/catch：一个工程损坏不能让其它标签一起丢掉。
 * 这里只读不写，失败的标签原文件保持不动。
 */
export async function restoreTabs(
  tabs: TabRef[],
  read: (name: string) => Promise<string | null>,
  docFileOf: (id: string) => string,
  historyFileOf: (id: string) => string,
  defaults: { jointRadius: number; boneWidth: number },
): Promise<RestoreResult> {
  const docs: Record<string, RigDoc> = {}
  const histories: Record<string, { past: RigDoc[]; future: RigDoc[] }> = {}
  const kept: TabRef[] = []
  const failed: RestoreFailure[] = []

  for (const tab of tabs) {
    try {
      const text = await read(docFileOf(tab.id))
      if (!text) {
        failed.push({ id: tab.id, name: tab.name, reason: '工程文件不存在' })
        continue
      }
      const raw = JSON.parse(text) as RigDoc
      const issues = validateDoc(raw)
      if (issues.fatal.length) {
        failed.push({ id: tab.id, name: tab.name, reason: issues.fatal[0] })
        continue
      }

      const doc = prepareImportedDoc(raw)
      doc.joints = doc.joints.map(j => ({ ...j, radius: defaults.jointRadius }))
      doc.bones = doc.bones.map(b => ({ ...b, width: defaults.boneWidth }))
      docs[tab.id] = doc
      kept.push(tab)

      const hisText = await read(historyFileOf(tab.id))
      if (hisText) {
        try {
          const his = JSON.parse(hisText) as { past?: RigDoc[]; future?: RigDoc[] }
          histories[tab.id] = {
            past: Array.isArray(his.past) ? his.past : [],
            future: Array.isArray(his.future) ? his.future : [],
          }
        } catch {
          // 历史损坏只丢历史，工程本身照常打开
        }
      }
    } catch (err) {
      failed.push({ id: tab.id, name: tab.name, reason: (err as Error).message })
    }
  }

  return { docs, histories, kept, failed }
}
