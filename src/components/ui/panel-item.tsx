import type { ReactNode } from 'react'

/** 面板里的内容块：设置、教程共用同一套尺寸与底色 */
export function PanelItem({ children }: { children: ReactNode }) {
  return <div className="rounded-inner bg-surface px-3 py-2.5">{children}</div>
}
