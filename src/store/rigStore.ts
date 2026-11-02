import { create } from 'zustand'
import type { Bone, EditorMode, Part, RigDoc, SceneElement } from '@/rig/types'
import { buildTemplate, type TemplateKey } from '@/rig/templates'
import { beginGesture as beginTabGesture, endGesture as endTabGesture, forgetTab, gateOf, shouldSnapshot } from '@/store/historyGate'

const DEFAULT_MAX_HISTORY = 50
let seq = 0

interface RigState {
  doc: RigDoc
  mode: EditorMode
  selectedJoints: string[]
  selectedBones: string[]
  linkFrom: string | null
  lastPicked: 'joint' | 'bone'
  selectedParts: string[]
  setSelectedParts: (ids: string[]) => void
  setMultiSelection: (joints: string[], bones: string[], parts: string[]) => void
  pickingBoneFor: string | null
  startPickBone: (partId: string) => void
  cancelPickBone: () => void
  setSelectedPart: (id: string | null) => void
  maxHistory: number
  setMaxHistory: (n: number) => void
  past: RigDoc[]
  future: RigDoc[]
  tabs: Array<{ id: string; name: string }>
  activeTabId: string | null
  docs: Record<string, RigDoc>
  histories: Record<string, { past: RigDoc[]; future: RigDoc[] }>
  newTab: (key: TemplateKey) => void
  switchTab: (id: string) => void
  closeTab: (id: string) => void
  renameTab: (id: string, name: string) => void
  moveTab: (fromId: string, toId: string) => void
  restoreWorkspace: (
    tabs: Array<{ id: string; name: string }>,
    activeTabId: string | null,
    docs: Record<string, RigDoc>,
    histories: Record<string, { past: RigDoc[]; future: RigDoc[] }>,
  ) => void

  loadTemplate: (key: TemplateKey) => void
  moveJoint: (id: string, x: number, y: number) => void
  moveJoints: (items: Array<{ id: string; x: number; y: number }>) => void
  selectJoint: (id: string | null) => void
  selectBone: (id: string | null) => void
  setSelection: (joints: string[], bones: string[]) => void
  setParam: (key: keyof RigDoc['params'], value: number) => void
  setMode: (mode: EditorMode) => void
  rename: (name: string) => void
  renameJoint: (id: string, name: string) => void
  addJoint: (radius: number, x?: number, y?: number) => void
  addBone: (width: number, radius: number, x?: number, y?: number) => void
  removeSelected: () => void
  clipboard: { joints: RigDoc['joints']; bones: RigDoc['bones']; parts: RigDoc['parts'] } | null
  copySelection: () => void
  pasteClipboard: (at?: { x: number; y: number }) => void
  setClipboard: (data: RigState['clipboard']) => void
  togglePinned: (id: string) => void
  toggleBonePinned: (id: string) => void
  startLink: () => void
  cancelLink: () => void
  updateBone: (id: string, patch: Partial<Bone>) => void
  updateAllBones: (patch: Partial<Bone>) => void
  applySkeletonPreset: (key: TemplateKey) => void
  addPartFromScene: (boneId: string | null, name: string, scene: { width: number; height: number; elements: SceneElement[] }) => void
  updatePart: (id: string, patch: Partial<Part>) => void
  capturePose: (name?: string) => void
  applyPose: (id: string) => void
  removePose: (id: string) => void
  bindPart: (id: string, boneId: string | null) => void
  removePart: (id: string) => void
  beginGesture: () => void
  endGesture: () => void
  undo: () => void
  redo: () => void
  replaceDoc: (doc: RigDoc) => void
}

export const useRig = create<RigState>((set, get) => {
  const snapshot = () => {
    const state = get()
    // 手势与节流状态按标签页隔离，切 tab 不能串用
    if (!shouldSnapshot(state.activeTabId, Date.now())) return
    set({ past: [...state.past, state.doc].slice(-state.maxHistory), future: [] })
  }

  const commit = (doc: RigDoc, extra: Partial<RigState> = {}) => set({ doc, future: [], ...extra })

  return {
    doc: buildTemplate('human'),
    mode: 'edit',
    selectedJoints: [],
    selectedBones: [],
    linkFrom: null,
    lastPicked: 'joint',
    selectedParts: [],
    maxHistory: DEFAULT_MAX_HISTORY,
    past: [],
    future: [],

    tabs: [],
    activeTabId: null,
    docs: {},
    histories: {},

    newTab: key => {
      const state = get()
      if (state.tabs.length >= 6) return
      seq += 1
      const id = 'tab_' + Date.now().toString(36) + '_' + seq
      const doc = buildTemplate(key)
      const name = '未命名骨架 ' + (state.tabs.length + 1)
      const docs = state.activeTabId ? { ...state.docs, [state.activeTabId]: state.doc } : state.docs
      const histories = state.activeTabId
        ? { ...state.histories, [state.activeTabId]: { past: state.past, future: state.future } }
        : state.histories
      set({
        docs: { ...docs, [id]: doc },
        histories,
        tabs: [...state.tabs, { id, name }],
        activeTabId: id,
        doc: { ...doc, name },
        past: [],
        future: [],
        selectedJoints: [],
        selectedBones: [],
        mode: 'edit',
        linkFrom: null,
      })
    },

    switchTab: id => {
      const state = get()
      if (state.activeTabId === id) return
      const docs = state.activeTabId ? { ...state.docs, [state.activeTabId]: state.doc } : state.docs
      const histories = state.activeTabId
        ? { ...state.histories, [state.activeTabId]: { past: state.past, future: state.future } }
        : state.histories
      const target = docs[id]
      if (!target) return
      const hist = histories[id] ?? { past: [], future: [] }
      set({
        docs,
        histories,
        activeTabId: id,
        doc: target,
        past: hist.past,
        future: hist.future,
        selectedJoints: [],
        selectedBones: [],
        selectedParts: [],
        linkFrom: null,
      })
    },

    closeTab: id => {
      const state = get()
      // 关掉标签就丢掉它的手势/节流状态，避免 id 复用时继承旧状态
      forgetTab(id)
      const docs = state.activeTabId === id ? state.docs : { ...state.docs, [state.activeTabId ?? '']: state.doc }
      const tabs = state.tabs.filter(t => t.id !== id)
      const restDocs = { ...docs }
      delete restDocs[id]
      if (state.activeTabId !== id) {
        set({ tabs, docs: restDocs })
        return
      }
      const idx = state.tabs.findIndex(t => t.id === id)
      const next = tabs[idx] ?? tabs[idx - 1] ?? null
      const nextDoc = next ? restDocs[next.id] : null
      const hist = next ? state.histories[next.id] ?? { past: [], future: [] } : { past: [], future: [] }
      set({
        tabs,
        docs: restDocs,
        activeTabId: next ? next.id : null,
        doc: nextDoc ?? state.doc,
        past: hist.past,
        future: hist.future,
        selectedJoints: [],
        selectedBones: [],
        selectedParts: [],
        linkFrom: null,
      })
    },

    moveTab: (fromId, toId) => {
      const tabs = [...get().tabs]
      const from = tabs.findIndex(t => t.id === fromId)
      const to = tabs.findIndex(t => t.id === toId)
      if (from < 0 || to < 0 || from === to) return
      const [moved] = tabs.splice(from, 1)
      tabs.splice(to, 0, moved)
      set({ tabs })
    },

    renameTab: (id, rawName) => {
      const state = get()
      const name = rawName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').slice(0, 24).trim()
      if (!name) return
      set({
        tabs: state.tabs.map(t => (t.id === id ? { ...t, name } : t)),
        doc: state.activeTabId === id ? { ...state.doc, name } : state.doc,
      })
    },

    restoreWorkspace: (tabs, activeTabId, docs, histories) => {
      const active = activeTabId && docs[activeTabId] ? activeTabId : tabs[0]?.id ?? null
      const doc = active ? docs[active] : null
      const hist = active ? histories[active] ?? { past: [], future: [] } : { past: [], future: [] }
      set({
        tabs,
        docs,
        histories,
        activeTabId: active,
        doc: doc ?? get().doc,
        past: hist.past,
        future: hist.future,
        selectedJoints: [],
        selectedBones: [],
        selectedParts: [],
        linkFrom: null,
      })
    },

    loadTemplate: key => {
      const state = get()
      set({
        doc: buildTemplate(key),
        // 切换预设也算一步，可以撤回
        past: [...state.past, state.doc].slice(-state.maxHistory),
        future: [],
        selectedJoints: [],
        selectedBones: [],
        mode: 'edit',
        linkFrom: null,
      })
    },

    moveJoint: (id, x, y) => {
      snapshot()
      const doc0 = get().doc
      const ikBone = doc0.bones.find(b => b.ik && b.b === id)
      const parentBone = ikBone?.parent ? doc0.bones.find(b => b.id === ikBone.parent) : undefined

      if (ikBone && parentBone) {
        const R = doc0.joints.find(j => j.id === parentBone.a)
        const M = doc0.joints.find(j => j.id === ikBone.a)
        const E = doc0.joints.find(j => j.id === ikBone.b)
        if (R && M && E) {
          const L1 = Math.hypot(M.x - R.x, M.y - R.y)
          const L2 = Math.hypot(E.x - M.x, E.y - M.y)
          const dx = x - R.x
          const dy = y - R.y
          const dist = Math.hypot(dx, dy) || 1e-6
          const d = Math.max(Math.abs(L1 - L2) + 0.01, Math.min(L1 + L2 - 0.01, dist))
          const ux = dx / dist
          const uy = dy / dist
          // 保持原有膝盖朝向
          const cross = ux * (M.y - R.y) - uy * (M.x - R.x)
          const sign = cross >= 0 ? 1 : -1
          const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d)
          const h = Math.sqrt(Math.max(0, L1 * L1 - a * a))
          const mx = R.x + ux * a + -uy * h * sign
          const my = R.y + uy * a + ux * h * sign
          commit({
            ...doc0,
            joints: doc0.joints.map(j => {
              if (j.id === ikBone.a) return { ...j, x: mx, y: my }
              if (j.id === ikBone.b) return { ...j, x: R.x + ux * d, y: R.y + uy * d }
              return j
            }),
          })
          return
        }
      }

      snapshot()
      const doc = get().doc
      commit({ ...doc, joints: doc.joints.map(j => (j.id === id ? { ...j, x, y } : j)) })
    },

    moveJoints: items => {
      snapshot()
      const doc = get().doc
      const map = new Map(items.map(i => [i.id, i]))
      commit({
        ...doc,
        joints: doc.joints.map(j => {
          const it = map.get(j.id)
          return it ? { ...j, x: it.x, y: it.y } : j
        }),
      })
    },

    selectJoint: id => {
      const state = get()
      if (state.linkFrom && id && id !== state.linkFrom) {
        set({
          doc: connect(state.doc, state.linkFrom, id),
          linkFrom: null,
          selectedJoints: [id],
          selectedBones: [],
          lastPicked: 'joint',
          future: [],
        })
        return
      }
      set({ selectedJoints: id ? [id] : [], selectedBones: [], lastPicked: 'joint' })
    },

    selectBone: id =>
      set({ selectedBones: id ? [id] : [], selectedJoints: [], linkFrom: null, lastPicked: 'bone' }),

    setSelection: (joints, bones) =>
      set({
        selectedJoints: joints,
        selectedBones: bones,
        selectedParts: [],
        linkFrom: null,
        lastPicked: bones.length ? 'bone' : 'joint',
      }),

    setSelectedParts: ids =>
      set({
        selectedParts: ids,
        selectedJoints: [],
        selectedBones: [],
        linkFrom: null,
      }),

    setMultiSelection: (joints, bones, parts) =>
      set({
        selectedJoints: joints,
        selectedBones: bones,
        selectedParts: parts,
        linkFrom: null,
      }),

    pickingBoneFor: null,

    startPickBone: partId => set({ pickingBoneFor: partId }),
    cancelPickBone: () => set({ pickingBoneFor: null }),

    setSelectedPart: id => set({ selectedParts: id ? [id] : [] }),

    setParam: (key: keyof RigDoc['params'], value: number) => {
      snapshot()
      set(state => ({ doc: { ...state.doc, params: { ...state.doc.params, [key]: value } } }))
    },


    setMode: mode => set({ mode, linkFrom: null }),
    rename: name => set(state => ({ doc: { ...state.doc, name } })),

    renameJoint: (id, name) => {
      snapshot()
      const doc = get().doc
      const joints = doc.joints.map(j => (j.id === id ? { ...j, name } : j))
      const nameOf = (jid: string) => joints.find(j => j.id === jid)?.name ?? jid
      const bones = doc.bones.map(b =>
        b.a === id || b.b === id ? { ...b, name: nameOf(b.a) + ' to ' + nameOf(b.b) } : b,
      )
      commit({ ...doc, joints, bones })
    },

    addJoint: (radius, atX, atY) => {
      snapshot()
      const doc = get().doc
      seq += 1
      const id = 'joint_' + Date.now().toString(36) + '_' + seq
      commit(
        {
          ...doc,
          joints: [
            ...doc.joints,
            {
              id,
              name: 'joint' + (doc.joints.length + 1),
              x: Math.round(atX ?? doc.canvas.width / 2),
              y: Math.round(atY ?? doc.canvas.height / 2),
              radius,
              pinned: false,
            },
          ],
        },
        { selectedJoints: [id], selectedBones: [], lastPicked: 'joint' },
      )
    },

    addBone: (width, radius, atX, atY) => {
      snapshot()
      const doc = get().doc
      seq += 1
      const stamp = Date.now().toString(36) + '_' + seq
      const idA = 'joint_' + stamp + 'a'
      const idB = 'joint_' + stamp + 'b'
      const n = doc.joints.length + 1
      const cx = Math.round(atX ?? doc.canvas.width / 2)
      const cy = Math.round(atY ?? doc.canvas.height / 2)
      const jointA = { id: idA, name: 'joint' + n, x: cx - 40, y: cy, radius, pinned: false }
      const jointB = { id: idB, name: 'joint' + (n + 1), x: cx + 40, y: cy, radius, pinned: false }
      const bone: Bone = {
        id: idA + '_' + idB,
        name: 'joint' + n + ' to ' + 'joint' + (n + 1),
        a: idA,
        b: idB,
        width,
        mass: 1,
        friction: 0.4,
        restitution: 0.1,
        damping: 0.1,
        limitMode: 'hard',
        stiffness: 3,
        limitLower: 0,        limitUpper: 0,
      }
      commit(
        { ...doc, joints: [...doc.joints, jointA, jointB], bones: [...doc.bones, bone] },
        { selectedBones: [bone.id], selectedJoints: [], lastPicked: 'bone' },
      )
    },

    clipboard: null,

    setClipboard: data => set({ clipboard: data }),

    copySelection: () => {
      const state = get()
      const doc = state.doc
      const pickedBones = doc.bones.filter(b => state.selectedBones.includes(b.id))
      // 选中骨骼时，把它两端关节一起带上，否则粘贴不出骨骼
      const wantJoints = new Set(state.selectedJoints)
      pickedBones.forEach(b => {
        wantJoints.add(b.a)
        wantJoints.add(b.b)
      })
      const joints = doc.joints.filter(j => wantJoints.has(j.id))
      const bones = pickedBones
      const parts = doc.parts.filter(p2 => state.selectedParts.includes(p2.id))
      if (!joints.length && !bones.length && !parts.length) return
      set({ clipboard: JSON.parse(JSON.stringify({ joints, bones, parts })) })
    },

    pasteClipboard: at => {
      const state = get()
      const clip = state.clipboard
      if (!clip) return
      const doc = state.doc
      snapshot()
      seq += 1
      const stamp = Date.now().toString(36) + '_' + seq
      const idMap = new Map<string, string>()

      // 副本命名：原名 + -copyN，N 按已存在的同名副本递增
      const allNames = new Set([
        ...doc.joints.map(j => j.name),
        ...doc.bones.map(b => b.name),
        ...doc.parts.map(p2 => p2.name),
      ])
      const copyName = (base: string) => {
        const prefix = base + '-copy'
        let max = 0
        allNames.forEach(nm => {
          if (!nm.startsWith(prefix)) return
          const rest = nm.slice(prefix.length)
          if (/^[0-9]+$/.test(rest)) max = Math.max(max, Number(rest))
        })
        const name = prefix + (max + 1)
        allNames.add(name)
        return name
      }

      // 位置：把整组的左上角对齐到鼠标
      const xs: number[] = []
      const ys: number[] = []
      clip.joints.forEach(j => { xs.push(j.x); ys.push(j.y) })
      clip.parts.forEach(p2 => { if (!p2.bone) { xs.push(p2.x); ys.push(p2.y) } })
      const minX = xs.length ? Math.min(...xs) : 0
      const minY = ys.length ? Math.min(...ys) : 0
      const dx = at ? at.x - minX : 24
      const dy = at ? at.y - minY : 24

      const joints = clip.joints.map(j => {
        const id = 'j_' + stamp + '_' + j.id
        idMap.set(j.id, id)
        return { ...j, id, x: j.x + dx, y: j.y + dy, pinned: false, name: copyName(j.name) }
      })
      const boneIds = new Set(doc.bones.map(b => b.id))
      const bones = clip.bones.map(b => ({
        ...b,
        id: 'b_' + stamp + '_' + b.id,
        a: idMap.get(b.a) ?? b.a,
        b: idMap.get(b.b) ?? b.b,
        parent: b.parent && boneIds.has(b.parent) ? b.parent : undefined,
        name: copyName(b.name),
      }))
      const parts = clip.parts.map(p2 => ({
        ...p2,
        id: 'pt_' + stamp + '_' + p2.id,
        bone: p2.bone && boneIds.has(p2.bone) ? p2.bone : undefined,
        x: p2.x + dx,
        y: p2.y + dy,
        name: copyName(p2.name),
      }))

      commit(
        { ...doc, joints: [...doc.joints, ...joints], bones: [...doc.bones, ...bones], parts: [...doc.parts, ...parts] },
        {
          selectedJoints: joints.map(j => j.id),
          selectedBones: bones.map(b => b.id),
          selectedParts: parts.map(p2 => p2.id),
        },
      )
    },

    removeSelected: () => {
      const state = get()
      const doc = state.doc
      const partsSel = state.selectedParts ?? []
      if (!state.selectedJoints.length && !state.selectedBones.length && !partsSel.length) return
      snapshot()

      const removedBoneIds = new Set(state.selectedBones)
      // 被选中骨骼两端点也一起删除（若没有被其它骨骼引用）
      const endpoints = new Set<string>()
      doc.bones.forEach(b => {
        if (removedBoneIds.has(b.id)) {
          endpoints.add(b.a)
          endpoints.add(b.b)
        }
      })

      let bones = doc.bones.filter(b => !removedBoneIds.has(b.id))
      const usedJoints = new Set<string>()
      bones.forEach(b => {
        usedJoints.add(b.a)
        usedJoints.add(b.b)
      })

      const dropJoints = new Set([...state.selectedJoints, ...endpoints].filter(id => !usedJoints.has(id)))
      const joints = doc.joints.filter(j => !dropJoints.has(j.id))
      bones = bones.filter(b => !dropJoints.has(b.a) && !dropJoints.has(b.b))

      const keepBoneIds = new Set(bones.map(b => b.id))
      // 父骨被删时，子骨的 parent 置空，避免角度限制指向不存在的骨
      bones = bones.map(b => (b.parent && !keepBoneIds.has(b.parent) ? { ...b, parent: undefined } : b))

      // 绑定在已删除骨骼上的部件：换算成世界坐标后解绑，避免跳变
      const parts = doc.parts
        .filter(p2 => !partsSel.includes(p2.id))
        .map(p2 => {
          if (!p2.bone || keepBoneIds.has(p2.bone)) return p2
          const bone = doc.bones.find(b => b.id === p2.bone)
          if (!bone) return { ...p2, bone: undefined }
          const ja = doc.joints.find(j => j.id === bone.a)
          const jb = doc.joints.find(j => j.id === bone.b)
          if (!ja || !jb) return { ...p2, bone: undefined }
          const ang = Math.atan2(jb.y - ja.y, jb.x - ja.x)
          const mx = (ja.x + jb.x) / 2
          const my = (ja.y + jb.y) / 2
          return {
            ...p2,
            bone: undefined,
            x: mx + Math.cos(ang) * p2.offsetX - Math.sin(ang) * p2.offsetY,
            y: my + Math.sin(ang) * p2.offsetX + Math.cos(ang) * p2.offsetY,
            rotation: p2.rotation + (ang * 180) / Math.PI,
          }
        })

      commit(
        { ...doc, joints, bones, parts },
        { selectedJoints: [], selectedBones: [], selectedParts: [], linkFrom: null },
      )
    },

    togglePinned: id => {
      snapshot()
      const doc = get().doc
      commit({ ...doc, joints: doc.joints.map(j => (j.id === id ? { ...j, pinned: !j.pinned } : j)) })
    },

    toggleBonePinned: id => {
      snapshot()
      const doc = get().doc
      const bone = doc.bones.find(b => b.id === id)
      if (!bone) return
      const both = doc.joints.filter(j => j.id === bone.a || j.id === bone.b)
      const nextPinned = !both.every(j => j.pinned)
      commit({
        ...doc,
        joints: doc.joints.map(j =>
          j.id === bone.a || j.id === bone.b ? { ...j, pinned: nextPinned } : j,
        ),
      })
    },

    startLink: () => {
      const sel = get().selectedJoints
      if (sel.length === 1) set({ linkFrom: sel[0] })
    },

    cancelLink: () => set({ linkFrom: null }),

    updateAllBones: patch => {
      snapshot()
      const doc = get().doc
      commit({ ...doc, bones: doc.bones.map(b => ({ ...b, ...patch })) })
    },

    updateBone: (id, patch) => {
      snapshot()
      const doc = get().doc
      commit({ ...doc, bones: doc.bones.map(b => (b.id === id ? { ...b, ...patch } : b)) })
    },

    applySkeletonPreset: key => {
      snapshot()
      const state = get()
      const doc = state.doc
      const tpl = buildTemplate(key)
      const prefix = 'p' + Date.now().toString(36)
      const hasExisting = doc.bones.length > 0
      const shift = hasExisting ? 220 : 0

      const idMap = new Map<string, string>()
      const joints = tpl.joints.map(j => {
        const id = prefix + '_' + j.id
        idMap.set(j.id, id)
        return { ...j, id, x: j.x + shift, y: j.y, name: j.name }
      })
      const bones = tpl.bones.map(b => ({
        ...b,
        id: prefix + '_' + b.id,
        a: idMap.get(b.a) ?? b.a,
        b: idMap.get(b.b) ?? b.b,
        parent: b.parent ? prefix + '_' + b.parent : undefined,
      }))

      set({
        doc: { ...doc, joints: [...doc.joints, ...joints], bones: [...doc.bones, ...bones] },
        past: [...state.past, state.doc].slice(-state.maxHistory),
        future: [],
        selectedJoints: [],
        selectedBones: [],
        selectedParts: [],
      })
    },

    addPartFromScene: (boneId, name, scene) => {
      snapshot()
      const doc = get().doc
      seq += 1
      const id = 'part_' + Date.now().toString(36) + '_' + seq
      const count = doc.parts.length
      const fit = Math.min(1, 360 / Math.max(scene.height, scene.width * 0.6))
      const part: Part = {
        id,
        name: name || 'scene ' + (count + 1),
        imageId: 100001,
        bone: boneId ?? undefined,
        x: Math.round(doc.canvas.width / 2 + ((count % 3) - 1) * 120),
        y: Math.round(doc.canvas.height / 2),
        scale: fit,
        width: scene.width,
        height: scene.height,
        offsetX: 0,
        offsetY: 0,
        rotation: 0,
        z: doc.parts.reduce((m, p) => Math.max(m, p.z), 0) + 1,
        elements: scene.elements,
        sceneWidth: scene.width,
        sceneHeight: scene.height,
      }
      commit({ ...doc, parts: [...doc.parts, part] })
    },

    capturePose: name => {
      snapshot()
      const doc = get().doc
      seq += 1
      const id = 'pose_' + Date.now().toString(36) + '_' + seq
      const joints: Record<string, { x: number; y: number }> = {}
      doc.joints.forEach(j => {
        joints[j.id] = { x: j.x, y: j.y }
      })
      const pose = { id, name: name ?? 'pose ' + (doc.poses.length + 1), joints }
      commit({ ...doc, poses: [...doc.poses, pose] })
    },

    applyPose: id => {
      const doc = get().doc
      const pose = doc.poses.find(x => x.id === id)
      if (!pose) return
      snapshot()
      commit({
        ...doc,
        joints: doc.joints.map(j => {
          const p2 = pose.joints[j.id]
          return p2 ? { ...j, x: p2.x, y: p2.y } : j
        }),
      })
    },

    removePose: id => {
      snapshot()
      const doc = get().doc
      commit({ ...doc, poses: doc.poses.filter(x => x.id !== id) })
    },

    bindPart: (id, boneId) => {
      snapshot()
      const doc = get().doc
      const part = doc.parts.find(p => p.id === id)
      if (!part) return

      const jointOf = (jid: string) => doc.joints.find(j => j.id === jid)
      const boneOf = (bid: string) => doc.bones.find(b => b.id === bid)

      // 当前世界位置
      let wx = part.x
      let wy = part.y
      let wrot = part.rotation
      const currentBone = part.bone ? boneOf(part.bone) : undefined
      if (currentBone) {
        const ja = jointOf(currentBone.a)
        const jb = jointOf(currentBone.b)
        if (ja && jb) {
          const ang = Math.atan2(jb.y - ja.y, jb.x - ja.x)
          const mx = (ja.x + jb.x) / 2
          const my = (ja.y + jb.y) / 2
          wx = mx + Math.cos(ang) * part.offsetX - Math.sin(ang) * part.offsetY
          wy = my + Math.sin(ang) * part.offsetX + Math.cos(ang) * part.offsetY
          wrot = part.rotation + (ang * 180) / Math.PI
        }
      }

      if (!boneId) {
        commit({ ...doc, parts: doc.parts.map(p => (p.id === id ? { ...p, bone: undefined, x: wx, y: wy, rotation: wrot } : p)) })
        return
      }

      const target = boneOf(boneId)
      const ja = target ? jointOf(target.a) : undefined
      const jb = target ? jointOf(target.b) : undefined
      if (!target || !ja || !jb) return

      const ang = Math.atan2(jb.y - ja.y, jb.x - ja.x)
      const mx = (ja.x + jb.x) / 2
      const my = (ja.y + jb.y) / 2
      const dx = wx - mx
      const dy = wy - my
      const offsetX = dx * Math.cos(-ang) - dy * Math.sin(-ang)
      const offsetY = dx * Math.sin(-ang) + dy * Math.cos(-ang)

      commit({
        ...doc,
        parts: doc.parts.map(p =>
          p.id === id
            ? { ...p, bone: boneId, offsetX, offsetY, rotation: wrot - (ang * 180) / Math.PI }
            : p,
        ),
      })
    },

    updatePart: (id, patch) => {
      snapshot()
      const doc = get().doc
      commit({ ...doc, parts: doc.parts.map(p => (p.id === id ? { ...p, ...patch } : p)) })
    },

    removePart: id => {
      snapshot()
      const doc = get().doc
      commit({ ...doc, parts: doc.parts.filter(p => p.id !== id) }, { selectedParts: [] })
    },

    beginGesture: () => {
      const state = get()
      // 已经在手势里就不重复压栈；手势状态按标签页独立
      if (gateOf(state.activeTabId).inGesture) return
      beginTabGesture(state.activeTabId)
      set({ past: [...state.past, state.doc].slice(-state.maxHistory), future: [] })
    },

    endGesture: () => {
      endTabGesture(get().activeTabId)
    },

    undo: () => {
      const state = get()
      if (!state.past.length) return
      set({
        doc: state.past[state.past.length - 1],
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future].slice(0, state.maxHistory),
        selectedJoints: [],
        selectedBones: [],
        selectedParts: [],
        linkFrom: null,
      })
    },

    redo: () => {
      const state = get()
      if (!state.future.length) return
      set({
        doc: state.future[0],
        past: [...state.past, state.doc].slice(-state.maxHistory),
        future: state.future.slice(1),
        selectedJoints: [],
        selectedBones: [],
        selectedParts: [],
        linkFrom: null,
      })
    },

    setMaxHistory: n => {
      const max = Math.max(10, Math.min(500, Math.round(n)))
      const state = get()
      set({ maxHistory: max, past: state.past.slice(-max), future: state.future.slice(-max) })
    },

    replaceDoc: doc =>
      commit(doc, { selectedJoints: [], selectedBones: [], linkFrom: null, past: [], future: [] }),
  }
})

function connect(doc: RigDoc, a: string, b: string): RigDoc {
  if (a === b) return doc
  const exists = doc.bones.some(x => (x.a === a && x.b === b) || (x.a === b && x.b === a))
  if (exists) return doc
  const ja = doc.joints.find(j => j.id === a)
  const jb = doc.joints.find(j => j.id === b)
  if (!ja || !jb) return doc
  const bone: Bone = {
    id: a + '_' + b,
    name: ja.name + ' to ' + jb.name,
    a,
    b,
    width: 12,
    mass: 1,
    friction: 0.4,
    restitution: 0.1,
    damping: 0.1,
    limitMode: 'hard',
    stiffness: 3,
    limitLower: 0,    limitUpper: 0,
  }
  return { ...doc, bones: [...doc.bones, bone] }
}

export const useRigDoc = () => useRig(s => s.doc)







