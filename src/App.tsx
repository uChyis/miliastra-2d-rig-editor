import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, Bone, ChevronDown, CircleDot, ClipboardPaste, Copy, FileJson, Image, Link, Link2, Moon, PawPrint, PersonStanding, Pin, Play, Redo2, RotateCcw, Settings, Square, Sun, Trash2, Undo2, Upload } from 'lucide-react'
import { StageCanvas, type View } from '@/components/StageCanvas'
import { Sidebar } from '@/components/Sidebar'
import { Button, IconButton } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { TabBar } from '@/components/TabBar'
import { AssetPanel } from '@/components/AssetPanel'
import { NewMenu } from '@/components/NewMenu'
import { ImportMenu } from '@/components/ImportMenu'
import { ExportMenu } from '@/components/ExportMenu'
import { SettingsDialog } from '@/components/SettingsDialog'
import { TutorialDialog } from '@/components/TutorialDialog'
import { CLIPBOARD_FILE, SETTINGS_FILE, WORKSPACE_FILE, cleanupOrphans, deleteFile, docFile, flushBeacon, historyFile, readText, writeText } from '@/storage/opfs'
import { useRig } from '@/store/rigStore'
import { VerletEngine, type RuntimeFrame } from '@/physics/verlet'
import { downloadJson, downloadText, toExport } from '@/export/exportRig'
import { toLua } from '@/export/exportLua'
import { parseScene } from '@/rig/scene'
import type { TemplateKey } from '@/rig/templates'
import { migrateNames, normalizeDoc } from '@/rig/migrate'
import { validateDoc } from '@/rig/validate'
import type { RigDoc } from '@/rig/types'

const DEFAULT_SCALE = 1
const BOTTOM_PAD = 96


export default function App() {
  const doc = useRig(s => s.doc)
  const mode = useRig(s => s.mode)
  const tabs = useRig(s => s.tabs)
  const activeTabId = useRig(s => s.activeTabId)
  const selectedJoints = useRig(s => s.selectedJoints)
  const selectedBones = useRig(s => s.selectedBones)
  const selectedParts = useRig(s => s.selectedParts)
  const linkFrom = useRig(s => s.linkFrom)
  const lastPicked = useRig(s => s.lastPicked)
  const past = useRig(s => s.past)
  const future = useRig(s => s.future)
  const {
    newTab, switchTab, closeTab, renameTab, moveTab, restoreWorkspace, moveJoint, moveJoints, setSelection, selectJoint, updateBone, renameJoint, setParam,
    setMode, addJoint, addBone, removeSelected, togglePinned, toggleBonePinned, startLink, cancelLink,
    beginGesture, endGesture, undo, redo, replaceDoc, updateAllBones, addPartFromScene, applySkeletonPreset, setSelectedParts, setMultiSelection, bindPart, capturePose, applyPose, removePose, pickingBoneFor, startPickBone, cancelPickBone, copySelection, pasteClipboard, clipboard, setClipboard, updatePart, removePart,
  } = useRig()

  const [frame, setFrame] = useState<RuntimeFrame | null>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: DEFAULT_SCALE })
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [measured, setMeasured] = useState(false)
  const [dark, setDark] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [hoverName, setHoverName] = useState<{ text: string; x: number; y: number } | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; wx: number; wy: number } | null>(null)
  const [ctxSub, setCtxSub] = useState<'skel' | 'import' | null>(null)
  const sceneRef = useRef<HTMLInputElement | null>(null)
  const [showJointNames, setShowJointNames] = useState(false)
  const [showBoneNames, setShowBoneNames] = useState(false)
  const [showPartNames, setShowPartNames] = useState(false)
  const [showPartLink, setShowPartLink] = useState(true)
  const [jointRadius, setJointRadius] = useState(5)
  const [boneWidth, setBoneWidth] = useState(5)
  const [fileAutosave, setFileAutosave] = useState(true)
  const maxHistory = useRig(s => s.maxHistory)
  const setMaxHistoryStore = useRig(s => s.setMaxHistory)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false)
  const [canvasReady, setCanvasReady] = useState(false)
  const [assetOpen, setAssetOpen] = useState(true)
  const pointerRef = useRef({ x: 0, y: 0 })
  const [cleanupText, setCleanupText] = useState<string | null>(null)
  const [clipboardText, setClipboardText] = useState<string | null>(null)

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const engineRef = useRef<VerletEngine | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastRef = useRef(0)
  const centeredRef = useRef(false)
  const docRef = useRef(doc)
  const viewsRef = useRef<Record<string, View>>({})
  const viewRef = useRef<View>(view)
  viewRef.current = view
  const prevTabRef = useRef<string | null>(null)
  docRef.current = doc
  const sizeRef = useRef({ jointRadius, boneWidth })
  const canvasSizeRef = useRef(size)
  canvasSizeRef.current = size
  sizeRef.current = { jointRadius, boneWidth }

  // 从 data/settings.json 读取设置
  useEffect(() => {
    let alive = true
    void (async () => {
      const text = await readText(SETTINGS_FILE)
      if (alive && text) {
        try {
          const st = JSON.parse(text) as Record<string, unknown>
          if (st.theme === 'light' || st.theme === 'dark') setDark(st.theme === 'dark')
          if (typeof st.jointNames === 'boolean') setShowJointNames(st.jointNames)
          if (typeof st.boneNames === 'boolean') setShowBoneNames(st.boneNames)
          if (typeof st.partNames === 'boolean') setShowPartNames(st.partNames)
          if (typeof st.partLink === 'boolean') setShowPartLink(st.partLink)
          if (typeof st.jointRadius === 'number') setJointRadius(st.jointRadius)
          if (typeof st.boneWidth === 'number') setBoneWidth(st.boneWidth)
          if (typeof st.autosave === 'boolean') setFileAutosave(st.autosave)
          if (typeof st.maxHistory === 'number' && st.maxHistory >= 10) setMaxHistoryStore(st.maxHistory)
        } catch {
          /* 设置文件损坏则使用默认值 */
        }
      }
      if (alive) setSettingsLoaded(true)
    })()
    return () => {
      alive = false
    }
  }, [])

  // 设置变化写回 data/settings.json
  useEffect(() => {
    if (!settingsLoaded) return
    const t = setTimeout(() => {
      void writeText(
        SETTINGS_FILE,
        JSON.stringify(
          {
            theme: dark ? 'dark' : 'light',
            jointNames: showJointNames,
            boneNames: showBoneNames,
            partNames: showPartNames,
            partLink: showPartLink,
            jointRadius,
            boneWidth,
            autosave: fileAutosave,
            maxHistory,
          },
          null,
          2,
        ),
      )
    }, 400)
    return () => clearTimeout(t)
  }, [settingsLoaded, dark, showJointNames, showBoneNames, showPartNames, showPartLink, jointRadius, boneWidth, fileAutosave, maxHistory])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  // 设置读出来后，让画布尺寸与设置保持一致
  useEffect(() => {
    if (!settingsLoaded) return
    useRig.setState(st => ({
      doc: {
        ...st.doc,
        joints: st.doc.joints.map(j => ({ ...j, radius: jointRadius })),
        bones: st.doc.bones.map(b => ({ ...b, width: boneWidth })),
      },
    }))
  }, [settingsLoaded, jointRadius, boneWidth])

  // 剪贴板：启动读取、变化写盘（只保留最近一次）
  useEffect(() => {
    let alive = true
    void (async () => {
      const text = await readText(CLIPBOARD_FILE)
      if (!alive || !text) return
      try {
        setClipboard(JSON.parse(text))
      } catch {
        /* ignore */
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const clipboardReadyRef = useRef(false)
  useEffect(() => {
    if (clipboard) {
      clipboardReadyRef.current = true
      void writeText(CLIPBOARD_FILE, JSON.stringify(clipboard))
      return
    }
    if (clipboardReadyRef.current) void deleteFile(CLIPBOARD_FILE)
  }, [clipboard])

  // 启动恢复：工作区标签 + 各标签的骨架与撤回栈
  useEffect(() => {
    let alive = true
    void (async () => {
      const text = await readText(WORKSPACE_FILE)
      if (!alive || !text) {
        setWorkspaceLoaded(true)
        return
      }
      try {
        const ws = JSON.parse(text) as { tabs: Array<{ id: string; name: string }>; activeId: string | null }
        const docs: Record<string, RigDoc> = {}
        const histories: Record<string, { past: RigDoc[]; future: RigDoc[] }> = {}
        const kept: Array<{ id: string; name: string }> = []

        for (const tab of ws.tabs ?? []) {
          const docText = await readText(docFile(tab.id))
          if (!docText) continue
          const parsed = normalizeDoc(migrateNames(JSON.parse(docText) as RigDoc))
          parsed.joints = parsed.joints.map(j => ({ ...j, radius: sizeRef.current.jointRadius }))
          parsed.bones = parsed.bones.map(b => ({ ...b, width: sizeRef.current.boneWidth }))
          docs[tab.id] = parsed
          kept.push(tab)

          const hisText = await readText(historyFile(tab.id))
          if (hisText) {
            try {
              const his = JSON.parse(hisText) as { past: RigDoc[]; future: RigDoc[] }
              histories[tab.id] = { past: his.past ?? [], future: his.future ?? [] }
            } catch {
              /* ignore */
            }
          }
        }

        if (alive && kept.length) restoreWorkspace(kept, ws.activeId, docs, histories)
      } catch {
        /* 工作区损坏则从空开始 */
      }
      if (alive) setWorkspaceLoaded(true)
    })()
    return () => {
      alive = false
    }
  }, [])

  // 立即把某个标签的骨架写入文件
  const flushDoc = (tabId: string, value: RigDoc) => writeText(docFile(tabId), JSON.stringify(value))

  // 当前标签的骨架写回各自的文件（受「自动保存」开关控制）
  useEffect(() => {
    if (!workspaceLoaded || !activeTabId) return
    if (!fileAutosave) return
    const t = setTimeout(() => {
      void writeText(docFile(activeTabId), JSON.stringify(docRef.current))
    }, 600)
    return () => clearTimeout(t)
  }, [doc, activeTabId, workspaceLoaded, fileAutosave])

  // 关闭页面/浏览器时，保证最后的状态落盘
  useEffect(() => {
    const onUnload = () => {
      const id = useRig.getState().activeTabId
      if (!id) return
      flushBeacon(docFile(id), JSON.stringify(useRig.getState().doc))
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  // 当前标签的撤回栈单独存
  useEffect(() => {
    if (!workspaceLoaded || !activeTabId || !fileAutosave) return
    const t = setTimeout(() => {
      void writeText(historyFile(activeTabId), JSON.stringify({ past, future }))
    }, 1200)
    return () => clearTimeout(t)
  }, [past.length, future.length, activeTabId, workspaceLoaded, fileAutosave]) // eslint-disable-line react-hooks/exhaustive-deps

  // 标签列表与激活项
  useEffect(() => {
    if (!workspaceLoaded) return
    void writeText(WORKSPACE_FILE, JSON.stringify({ tabs, activeId: activeTabId }, null, 2))
  }, [tabs, activeTabId, workspaceLoaded])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect
      setSize({ w: Math.max(320, Math.round(r.width)), h: Math.max(240, Math.round(r.height)) })
      setMeasured(true)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 每个标签记录自己的缩放与平移
  useEffect(() => {
    const prev = prevTabRef.current
    if (prev) viewsRef.current[prev] = viewRef.current
    prevTabRef.current = activeTabId
    if (!activeTabId) return
    const saved = viewsRef.current[activeTabId]
    if (saved) {
      setView(saved)
      setCanvasReady(true)
    }
    else scheduleFit(useRig.getState().doc)
  }, [activeTabId])


  const applyView = useCallback((v: View) => {
    if (mode !== 'play') {
      setView(v)
      return
    }
    const minY = size.h - BOTTOM_PAD - docRef.current.ground * v.scale
    setView({ ...v, y: Math.max(v.y, minY) })
  }, [size.h, mode])

  const homeView = useCallback((scale: number): View => {
    const js = docRef.current.joints
    const cx = js.length
      ? (Math.min(...js.map(j => j.x)) + Math.max(...js.map(j => j.x))) / 2
      : docRef.current.canvas.width / 2
    const cy = js.length ? js.reduce((s2, j) => s2 + j.y, 0) / js.length : docRef.current.canvas.height / 2
    return {
      scale,
      x: size.w / 2 - cx * scale,
      y: mode === 'play'
        ? size.h - BOTTOM_PAD - docRef.current.ground * scale
        : size.h / 2 - cy * scale,
    }
  }, [size.w, size.h, mode])

  useEffect(() => {
    if (centeredRef.current || !measured) return
    centeredRef.current = true
    applyView(homeView(DEFAULT_SCALE))
  }, [measured, size, applyView, homeView])

  // 进出物理预览时重新取景，避免地面突然跳到视口中间
  useEffect(() => {
    if (!measured) return
    applyView(homeView(1))
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    engineRef.current?.endDrag()
    engineRef.current = null
  }, [])

  useEffect(() => {
    if (mode !== 'play') {
      stopLoop()
      setFrame(null)
      return
    }
    const engine = new VerletEngine(docRef.current)
    engineRef.current = engine
    lastRef.current = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastRef.current) / 1000)
      lastRef.current = now
      setFrame(engine.step(dt))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return stopLoop
  }, [mode, stopLoop])

  useEffect(() => { engineRef.current?.setGravity(doc.params.gravity) }, [doc.params.gravity])
  useEffect(() => { engineRef.current?.setDragForce(doc.params.dragForce) }, [doc.params.dragForce])
  useEffect(() => {
    engineRef.current?.setSolverIterations(doc.params.solverIterations)
  }, [doc.params.solverIterations])

  const applyJointRadius = (v: number) => {
    setJointRadius(v)
    useRig.setState(st => ({ doc: { ...st.doc, joints: st.doc.joints.map(j => ({ ...j, radius: v })) } }))
  }

  const applyBoneWidth = (v: number) => {
    setBoneWidth(v)
    useRig.setState(st => ({ doc: { ...st.doc, bones: st.doc.bones.map(b => ({ ...b, width: v })) } }))
  }

  const toggleFileAutosave = () => {
    setFileAutosave(v => !v)
  }


  /** 布局落定后再取景，避免创建瞬间的跳动 */
  const scheduleFit = (target: RigDoc) => {
    setCanvasReady(false)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        centerOn(target)
        setCanvasReady(true)
      })
    })
  }

  /** 按容器实际尺寸把骨架摆到视野正中 */
  const centerOn = (target: RigDoc) => {
    const el = wrapRef.current
    const w = el && el.clientWidth ? el.clientWidth : canvasSizeRef.current.w
    const h = el && el.clientHeight ? el.clientHeight : canvasSizeRef.current.h
    if (!w || !h) return

    const pts = target.joints.map(j => ({ x: j.x, y: j.y }))
    if (!pts.length) {
      setView({ scale: 1, x: w / 2 - target.canvas.width / 2, y: h / 2 - target.canvas.height / 2 })
      return
    }

    const xs = pts.map(p2 => p2.x)
    const ys = pts.map(p2 => p2.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const pad = 160
    const bw = Math.max(1, maxX - minX + pad * 2)
    const bh = Math.max(1, maxY - minY + pad * 2)
    const scale = Math.min(2, Math.max(0.5, Math.min(w / bw, h / bh)))
    setView({
      scale,
      x: w / 2 - ((minX + maxX) / 2) * scale,
      y: h / 2 - ((minY + maxY) / 2) * scale,
    })
  }

  const focusAsset = (kind: 'joint' | 'bone' | 'part', id: string) => {
    if (kind === 'joint') {
      setSelection([id], [])
      const j = doc.joints.find(x => x.id === id)
      if (!j) return
      const sz = canvasSizeRef.current
      const scale = 1.4
      applyView({ scale, x: sz.w / 2 - j.x * scale, y: sz.h / 2 - j.y * scale })
      return
    }
    if (kind === 'bone') {
      setSelection([], [id])
      const b = doc.bones.find(x => x.id === id)
      if (!b) return
      const a = doc.joints.find(j => j.id === b.a)
      const c = doc.joints.find(j => j.id === b.b)
      if (!a || !c) return
      const sz = canvasSizeRef.current
      const cx = (a.x + c.x) / 2
      const cy = (a.y + c.y) / 2
      const len = Math.hypot(c.x - a.x, c.y - a.y) || 1
      const scale = Math.min(2, Math.max(0.6, (Math.min(sz.w, sz.h) * 0.5) / len))
      applyView({ scale, x: sz.w / 2 - cx * scale, y: sz.h / 2 - cy * scale })
      return
    }
    setSelectedParts([id])
    const part = doc.parts.find(x => x.id === id)
    if (!part) return
    const sz = canvasSizeRef.current
    const sc = part.scale ?? 1
    const w = (part.sceneWidth ?? part.width) * sc
    const h = (part.sceneHeight ?? part.height) * sc
    const scale = Math.min(2, Math.max(0.5, Math.min((sz.w * 0.7) / w, (sz.h * 0.7) / h)))
    applyView({ scale, x: sz.w / 2 - part.x * scale, y: sz.h / 2 - part.y * scale })
  }

  const importJson = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as RigDoc
        const issues = validateDoc(data)
        if (issues.fatal.length) {
          alert('导入失败，工程存在无法安全读取的问题：\n\n' + issues.fatal.join('\n'))
          return
        }
        if (issues.warnings.length) {
          console.warn('[导入工程] ' + issues.warnings.join('\n'))
          alert('工程已导入，但有以下需要注意的地方：\n\n' + issues.warnings.join('\n'))
        }
        data.canvas = data.canvas || { width: 820, height: 620 }
        data.ground = data.ground === undefined ? 560 : data.ground
        data.params.dragForce = data.params.dragForce || 320
        data.params.solverIterations = data.params.solverIterations || 8
        replaceDoc(normalizeDoc(migrateNames(data)))
        centerOn(useRig.getState().doc)
      } catch (err) {
        alert('导入失败：' + (err as Error).message)
      }
    }
    reader.readAsText(file)
  }

  const zoomPresets = [50, 75, 100, 150, 200, 300, 400, 500]
  const currentZoom = Math.round(view.scale * 100)
  const zoomOptions = (zoomPresets.includes(currentZoom) ? zoomPresets : [...zoomPresets, currentZoom])
    .sort((x, y) => x - y)
    .map(v => ({ value: String(v), label: v + '%' }))

  const zoomTo = (pct: number) => {
    const s = Math.min(5, Math.max(0.5, pct / 100))
    const cx = size.w / 2
    const cy = size.h / 2
    const wx = (cx - view.x) / view.scale
    const wy = (cy - view.y) / view.scale
    applyView({ scale: s, x: cx - wx * s, y: cy - wy * s })
  }

  // 拖拽被系统打断时结束手势，避免撤销快照永久停摆
  useEffect(() => {
    const stop = () => useRig.getState().endGesture()
    window.addEventListener('blur', stop)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('pointerup', stop)
    return () => {
      window.removeEventListener('blur', stop)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('pointerup', stop)
    }
  }, [])

  const handleSwitchTab = (id: string) => {
    const state = useRig.getState()
    if (state.activeTabId && state.activeTabId !== id) flushDoc(state.activeTabId, state.doc)
    switchTab(id)
  }

  const handleCloseTab = (id: string) => {
    const state = useRig.getState()
    const current = state.activeTabId
    closeTab(id)
    void (async () => {
      if (current) await flushDoc(current, state.doc)
      await deleteFile(docFile(id))
      await deleteFile(historyFile(id))
    })()
  }

  const handleApplyPreset = (key: TemplateKey) => {
    applySkeletonPreset(key)
    const state = useRig.getState()
    useRig.setState({
      doc: {
        ...state.doc,
        joints: state.doc.joints.map(j => ({ ...j, radius: jointRadius })),
        bones: state.doc.bones.map(b => ({ ...b, width: boneWidth })),
      },
    })
  }

  // 批量导入矢量稿：作为未绑定的部件摆到画布上
  const importScenes = (files: File[]) => {
    // 没有打开标签时，先建一个空标签（自定义骨架），导入即可看到画布
    if (!activeTabId) newTab('custom')
    const warnings: string[] = []
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const scene = parseScene(JSON.parse(String(reader.result)))
          for (const w of scene.warnings) warnings.push(`${file.name}：${w}`)
          addPartFromScene(null, file.name.replace(/\.json$/i, ''), scene)
        } catch (err) {
          alert(file.name + ' 导入失败：' + (err as Error).message)
        }
      }
      reader.readAsText(file)
    })
    if (warnings.length) {
      console.warn('[导入矢量稿] ' + warnings.join('\n'))
      setTimeout(() => alert('矢量稿已导入，但有以下修正：\n\n' + warnings.join('\n')), 0)
    }
  }

  const itemCls = 'flex h-8 w-full items-center gap-2 rounded-inner px-2.5 text-left text-[13px] text-text hover:bg-surface-hover'
  const subItemCls = 'flex h-7 w-full items-center rounded-inner px-2 text-left text-[13px] text-muted hover:bg-surface-hover hover:text-text'
  const flyout =
    ctxMenu && ctxMenu.x + 340 > window.innerWidth
      ? 'absolute right-full top-0 mr-1 w-[132px] rounded-card bg-panel p-1 elevation-2'
      : 'absolute left-full top-0 ml-1 w-[132px] rounded-card bg-panel p-1 elevation-2'

  const handleNew = (key: TemplateKey = 'custom') => {
    newTab(key)
    useRig.setState(st => ({
      doc: {
        ...st.doc,
        joints: st.doc.joints.map(j => ({ ...j, radius: jointRadius })),
        bones: st.doc.bones.map(b => ({ ...b, width: boneWidth })),
      },
    }))
    scheduleFit(useRig.getState().doc)
  }

  const hasSelection = selectedJoints.length > 0 || selectedBones.length > 0

  // Delete / Backspace 删除所选，输入框内不拦截
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const tag = el ? el.tagName : ''
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (el && el.isContentEditable)) return
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        copySelection()
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault()
        pasteClipboard(pointerRef.current)
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!hasSelection) return
        e.preventDefault()
        removeSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hasSelection, removeSelected, copySelection, pasteClipboard])

  return (
    <div className="flex h-full w-full flex-col bg-background">
        <header className="relative z-[40] flex h-14 shrink-0 items-center gap-2 bg-background px-3 elevation-down">
          <NewMenu onNew={() => handleNew()} disabled={tabs.length >= 6} />
          <ImportMenu onImportRig={importJson} onImportScenes={importScenes} />
          <ExportMenu
            disabled={!activeTabId}
            onExportJson={() => downloadJson((doc.name || 'rig') + '.rig.json', toExport(doc))}
            onExportLua={() => downloadText((doc.name || 'rig') + '.lua', toLua(doc))}
          />

          <div className="pointer-events-none absolute left-1/2 max-w-[36vw] -translate-x-1/2 truncate text-[14px] font-medium text-text">
            Miliastra 2D Rig Editor
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {activeTabId ? (
              <Button
                variant="filled"
                className="gap-1.5"
                onClick={() => setMode(mode === 'play' ? 'edit' : 'play')}
              >
                {mode === 'play' ? (
                  <span className="flex items-center gap-1.5">
                    <Square size={15} className="shrink-0" />
                    <span className="leading-none">回到编辑</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Play size={15} className="shrink-0" />
                    <span className="leading-none">物理预览</span>
                  </span>
                )}
              </Button>
            ) : null}
            <IconButton label="教程" onClick={() => setTutorialOpen(true)}><BookOpen size={18} /></IconButton>
            <IconButton label="设置" onClick={() => setSettingsOpen(true)}><Settings size={18} /></IconButton>
            <IconButton label={dark ? '切换到浅色' : '切换到深色'} onClick={() => setDark(v => !v)}>
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </IconButton>
          </div>
        </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          {tabs.length ? (
            <TabBar tabs={tabs} activeId={activeTabId} onSelect={handleSwitchTab} onClose={handleCloseTab} onRename={renameTab} onReorder={moveTab} />
          ) : null}




        <div ref={wrapRef} className="relative min-h-0 flex-1 bg-[var(--canvas-bg)]" style={{ opacity: !activeTabId || canvasReady ? 1 : 0, transition: 'opacity 120ms' }}>

          {activeTabId ? (
            <AssetPanel doc={doc} open={assetOpen} onToggle={() => setAssetOpen(v => !v)} onPick={focusAsset} />
          ) : null}

          {activeTabId ? (
          <StageCanvas
            width={size.w}
            height={size.h}
            doc={doc}
            mode={mode}
            frame={frame}
            view={view}
            theme={dark ? 'dark' : 'light'}
            onViewChange={applyView}
            selectedJoints={selectedJoints}
            selectedBones={selectedBones}
            selectedParts={selectedParts}
            linkFrom={linkFrom}
            onSetSelection={setSelection}
            onPickJoint={selectJoint}
            showJointNames={showJointNames}
            showBoneNames={showBoneNames}
            showPartNames={showPartNames}
            showPartLink={showPartLink}
            pickingBoneFor={pickingBoneFor}
            onPickBone={boneId => {
              if (pickingBoneFor) bindPart(pickingBoneFor, boneId)
              cancelPickBone()
            }}
            onMoveJoint={moveJoint}
            onMoveJoints={moveJoints}
            onMovePart={(id, x, y) => updatePart(id, { x, y })}
            onSelectParts={setSelectedParts}
            onSetMultiSelection={setMultiSelection}
            onUpdatePartBox={(id, patch) => updatePart(id, patch)}
            onPlayDragStart={(id, x, y) => engineRef.current?.beginDrag(id, x, y)}
            onPlayDragMove={(x, y) => engineRef.current?.moveDrag(x, y)}
            onPlayDragEnd={() => engineRef.current?.endDrag()}
            onBeginGesture={beginGesture}
            onEndGesture={endGesture}
            onContextMenuAt={(x, y, wx, wy) => {
              setSelection([], [])
              setSelectedParts([])
              setCtxSub(null)
              setCtxMenu({ x, y, wx, wy })
            }}
            onHoverName={(text, x, y) => setHoverName(text ? { text, x, y } : null)}
            onPointerWorld={(x, y) => (pointerRef.current = { x, y })}
          />
          ) : null}

          {activeTabId ? (
          <div className="pointer-events-none absolute right-3 top-3 text-right text-[12px] leading-5 text-muted">
            <div>{mode === 'play' ? '物理运行中' : '编辑模式'}</div>
            <div className="mt-2 tabular-nums">{selectedParts.length}/{doc.parts.length} 部件</div>
            <div className="tabular-nums">{selectedJoints.length}/{doc.joints.length} 关节</div>
            <div className="tabular-nums">{selectedBones.length}/{doc.bones.length} 骨骼</div>
          </div>
          ) : null}



          {activeTabId ? (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-card bg-surface px-1.5 py-1 elevation-2">
            <IconButton label="重置视图" onClick={() => applyView(homeView(1))}><RotateCcw size={17} /></IconButton>
            <div className="mx-1 h-5 w-px bg-outline" />
            <IconButton label="撤回" onClick={undo} disabled={!past.length}><Undo2 size={17} /></IconButton>
            <IconButton label="重做" onClick={redo} disabled={!future.length}><Redo2 size={17} /></IconButton>
            <div className="mx-1 h-5 w-px bg-outline" />
            <IconButton
              label={selectedJoints[0] && doc.joints.find(j => j.id === selectedJoints[0])?.pinned ? '取消固定' : '固定'}
              disabled={!(selectedJoints.length === 1 || selectedBones.length === 1)}
              onClick={() => {
                if (selectedJoints.length === 1) togglePinned(selectedJoints[0])
                else if (selectedBones.length === 1) toggleBonePinned(selectedBones[0])
              }}
            >
              <Pin size={17} />
            </IconButton>
            <IconButton
              label={linkFrom ? '取消连接' : '连接'}
              disabled={!linkFrom && selectedJoints.length !== 1}
              onClick={() => (linkFrom ? cancelLink() : startLink())}
            >
              <Link2 size={17} />
            </IconButton>
            <IconButton
              label="复制"
              className="hover:bg-transparent"
              disabled={!hasSelection && selectedParts.length === 0}
              onClick={copySelection}
            >
              <Copy size={17} />
            </IconButton>
            <IconButton
              label="删除"
              className="text-danger-text hover:bg-transparent hover:text-danger-text"
              disabled={!hasSelection && selectedParts.length === 0}
              onClick={removeSelected}
            >
              <Trash2 size={17} />
            </IconButton>
            <div className="mx-1 h-5 w-px bg-outline" />
            <Select
              className="w-[86px]"
              up
              value={String(Math.round(view.scale * 100))}
              options={zoomOptions}
              onChange={v => zoomTo(Number(v))}
            />
          </div>
        ) : null}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={e => {
            const f = e.target.files && e.target.files[0]
            e.target.value = ''
            if (f) importJson(f)
          }}
        />
        <input
          ref={sceneRef}
          type="file"
          multiple
          accept="application/json,.json"
          className="hidden"
          onChange={e => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            if (files.length) importScenes(files)
          }}
        />

        {!fileAutosave && activeTabId ? (
          <div className="pointer-events-none absolute bottom-3 left-3 z-[25] rounded-full bg-surface px-2.5 py-1 text-[12px] text-muted elevation-1">
            自动保存已关闭
          </div>
        ) : null}

        {hoverName ? (
          <div
            className="pointer-events-none fixed z-[120] rounded-inner bg-surface-active px-2 py-1 text-[12px] leading-4 text-text elevation-2"
            style={{ left: hoverName.x + 12, top: hoverName.y + 14 }}
          >
            {hoverName.text}
          </div>
        ) : null}

        {ctxMenu ? (
          <>
            <div className="fixed inset-0 z-[80]" onClick={() => { setCtxMenu(null); setCtxSub(null) }} onContextMenu={e => e.preventDefault()} />
            <div
              className="fixed z-[90] w-[168px] overflow-visible rounded-card bg-panel p-1 elevation-2"
              style={{ left: ctxMenu.x, top: ctxMenu.y }}
            >
              <div className="space-y-0.5 rounded-inner bg-surface/60 p-0.5">
              <button
                onClick={() => {
                  addJoint(jointRadius, ctxMenu.wx, ctxMenu.wy)
                  setCtxMenu(null)
                }}
                className={itemCls}
              >
                <CircleDot size={15} className="text-muted" />
                添加关节
              </button>
              <button
                onClick={() => {
                  addBone(boneWidth, jointRadius, ctxMenu.wx, ctxMenu.wy)
                  setCtxMenu(null)
                }}
                className={itemCls}
              >
                <Bone size={15} className="text-muted" />
                添加骨骼
              </button>
              <div className="relative">
                <button onClick={() => setCtxSub(ctxSub === 'skel' ? null : 'skel')} className={itemCls}>
                  <Bone size={15} className="text-muted" />
                  添加骨架
                  <ChevronDown size={13} className="-rotate-90 ml-auto text-muted" />
                </button>
                {ctxSub === 'skel' ? (
                  <div className={flyout}>
                    {([['human', '人形'], ['quad', '四足'], ['chain', '单链']] as Array<[TemplateKey, string]>).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => {
                          handleApplyPreset(key)
                          setCtxMenu(null)
                          setCtxSub(null)
                        }}
                        className={subItemCls}
                      >
                        {key === 'human' ? (
                          <PersonStanding size={14} className="mr-2 text-muted" />
                        ) : key === 'quad' ? (
                          <PawPrint size={14} className="mr-2 text-muted" />
                        ) : (
                          <Link size={14} className="mr-2 text-muted" />
                        )}
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              </div>
              <div className="h-1.5" />
              <div className="relative">
                <button onClick={() => setCtxSub(ctxSub === 'import' ? null : 'import')} className={itemCls}>
                  <Upload size={15} className="text-muted" />
                  导入
                  <ChevronDown size={13} className="-rotate-90 ml-auto text-muted" />
                </button>
                {ctxSub === 'import' ? (
                  <div className={flyout}>
                    <button
                      onClick={() => {
                        setCtxMenu(null)
                        setCtxSub(null)
                        fileRef.current?.click()
                      }}
                      className={subItemCls}
                    >
                      <FileJson size={14} className="mr-2 text-muted" />
                      工程 JSON
                    </button>
                    <button
                      onClick={() => {
                        setCtxMenu(null)
                        setCtxSub(null)
                        sceneRef.current?.click()
                      }}
                      className={subItemCls}
                    >
                      <Image size={14} className="mr-2 text-muted" />
                      矢量稿 JSON
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="h-1.5" />
              <div className="rounded-inner bg-surface/60 p-0.5">
              <button
                disabled={!clipboard}
                onClick={() => {
                  pasteClipboard({ x: ctxMenu.wx, y: ctxMenu.wy })
                  setCtxMenu(null)
                }}
                className="flex h-8 w-full items-center justify-between gap-2 rounded-inner px-2.5 text-left text-[13px] text-text enabled:hover:bg-surface-hover disabled:opacity-40"
              >
                <span className="flex items-center gap-2">
                  <ClipboardPaste size={15} className="text-muted" />
                  粘贴
                </span>
                <span className="text-[12px] text-muted">Ctrl V</span>
              </button>
              </div>

            </div>
          </>
        ) : null}
      </main>



      <TutorialDialog open={tutorialOpen} onClose={() => setTutorialOpen(false)} />

      <SettingsDialog
        open={settingsOpen}
        showJointNames={showJointNames}
        showBoneNames={showBoneNames}
        showPartNames={showPartNames}
        showPartLink={showPartLink}
        jointRadius={jointRadius}
        boneWidth={boneWidth}
        fileAutosave={fileAutosave}
        maxHistory={maxHistory}
        onChangeMaxHistory={n => setMaxHistoryStore(n)}
        onChangeJointNames={setShowJointNames}
        onChangeBoneNames={setShowBoneNames}
        onChangePartNames={setShowPartNames}
        onChangePartLink={setShowPartLink}
        onChangeJointRadius={applyJointRadius}
        onChangeBoneWidth={applyBoneWidth}
        onToggleAutosave={toggleFileAutosave}
        cleanupText={cleanupText}
        clipboardText={clipboardText}
        onClearClipboard={async () => {
          setClipboard(null)
          await deleteFile(CLIPBOARD_FILE)
          setClipboardText('已清空复制历史')
        }}
        onCleanup={async () => {
          const keep = useRig.getState().tabs.map(t => t.id)
          const removed = await cleanupOrphans(keep)
          setCleanupText(removed > 0 ? '已删除 ' + removed + ' 个残留文件' : '没有需要清理的文件')
        }}
        onClose={() => setSettingsOpen(false)}
      />

      {activeTabId ? (
      <Sidebar
        doc={doc}
        selectedJoints={selectedJoints}
        selectedBones={selectedBones}
        selectedParts={selectedParts}
        onSelectParts={setSelectedParts}
        lastPicked={lastPicked}
        onParam={setParam}
        onUpdateBone={updateBone}
        onUpdateAllBones={updateAllBones}
        disabled={mode === 'play'}
        onRenameJoint={renameJoint}
        onApplyPreset={handleApplyPreset}
        onBindPart={bindPart}
        pickingBoneFor={pickingBoneFor}
        onStartPickBone={startPickBone}
        onCancelPickBone={cancelPickBone}
        onAddPartFromScene={addPartFromScene}
        onUpdatePart={updatePart}
        onRemovePart={removePart}
        onCapturePose={capturePose}
        onApplyPose={applyPose}
        onRemovePose={removePose}
      />
      ) : null}
      </div>
    </div>
  )
}







































