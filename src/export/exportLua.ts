import type { RigDoc } from '@/rig/types'

/** Lua 字符串字面量：转义引号、反斜杠与控制字符，避免名字里一个 " 就把导出文件写坏 */
const luaString = (v: unknown): string => {
  const s = String(v ?? '')
  let out = '"'
  for (const ch of s) {
    const code = ch.codePointAt(0) as number
    if (ch === '\\') out += '\\\\'
    else if (ch === '"') out += '\\"'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else if (code < 0x20 || code === 0x7f) out += '\\' + code.toString().padStart(3, '0')
    else out += ch
  }
  return out + '"'
}

/** 写进单行注释的内容：换行会把后面的代码也变成注释 */
const oneLine = (v: unknown): string => String(v ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ')

/** 非法数值的计数（每次导出重置），用于在文件头提示 */
let badNumbers = 0

/** 安全数值：NaN / Infinity 落成 0（否则会写出 `NaN` 这种非法 Lua） */
const n = (v: number): string => {
  const x = Number(v)
  if (!Number.isFinite(x)) {
    badNumbers += 1
    return '0'
  }
  return (Math.round(x * 1000) / 1000).toString()
}

/** 生成千星客户端可直接使用的 Lua 模块（骨架数据 + Verlet 求解器） */
export function toLua(doc: RigDoc): string {
  badNumbers = 0
  // 内部 id → 可读 id 的映射（p<stamp>_head → head）。
  // 注意：只能用在「id 字段」上，不能对整段 Lua 做文本替换。
  // 单字母 id（单链预设的 a/b/c/d/e）那样替换会把 local、character 这类词打碎。
  const cleanIdMap = new Map<string, string>()
  const used = new Set<string>()
  const makeClean = (rawName: string, fallback: string) => {
    const base = (rawName || '').trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
    const stem = base.length ? base : fallback
    let id = stem
    let k = 2
    while (used.has(id)) {
      id = stem + '_' + k
      k += 1
    }
    used.add(id)
    return id
  }
  doc.joints.forEach((j, i) => cleanIdMap.set(j.id, makeClean(j.name, 'joint_' + (i + 1))))
  doc.bones.forEach((b, i) => cleanIdMap.set(b.id, makeClean(b.name, 'bone_' + (i + 1))))
  doc.parts.forEach((pt, i) => cleanIdMap.set(pt.id, makeClean(pt.name, 'part_' + (i + 1))))
  /** 取清洗后的 id；未登记的保持原样 */
  const cid = (raw?: string) => (raw && cleanIdMap.has(raw) ? (cleanIdMap.get(raw) as string) : (raw ?? ''))

  const jointRows = doc.joints
    .map(j => `  { id = ${luaString(cid(j.id))}, name = ${luaString(j.name)}, x = ${n(j.x)}, y = ${n(j.y)}, r = ${n(j.radius)}, pinned = ${j.pinned ? 'true' : 'false'} },`)
    .join('\n')

  const boneRows = doc.bones
    .map(
      b =>
        `  { id = ${luaString(cid(b.id))}, a = ${luaString(cid(b.a))}, b = ${luaString(cid(b.b))}, width = ${n(b.width)}, ` +
        `limitLo = ${n(b.limitLower)}, limitHi = ${n(b.limitUpper)}, ` +
        `mode = ${luaString(b.limitMode ?? 'hard')}, stiff = ${n(b.stiffness ?? 3)}, ` +
        `parent = ${b.parent ? luaString(cid(b.parent)) : 'nil'} },`,
    )
    .join('\n')

  const partCenter = (part: RigDoc['parts'][number]) => {
    const bone = part.bone ? doc.bones.find(b => b.id === part.bone) : undefined
    if (!bone) return { x: part.x, y: part.y }
    const ja = doc.joints.find(j => j.id === bone.a)
    const jb = doc.joints.find(j => j.id === bone.b)
    if (!ja || !jb) return { x: part.x, y: part.y }
    const ang = Math.atan2(jb.y - ja.y, jb.x - ja.x)
    const mx = (ja.x + jb.x) / 2
    const my = (ja.y + jb.y) / 2
    return {
      x: Math.round((mx + Math.cos(ang) * part.offsetX - Math.sin(ang) * part.offsetY) * 100) / 100,
      y: Math.round((my + Math.sin(ang) * part.offsetX + Math.cos(ang) * part.offsetY) * 100) / 100,
    }
  }

  const partsLua = doc.parts
    .map(p => {
      const c = partCenter(p)
      const sw = (p.sceneWidth ?? p.width) * (p.scale ?? 1)
      const sh = (p.sceneHeight ?? p.height) * (p.scale ?? 1)
      return (
        `  { id = ${luaString(cid(p.id))}, imageId = ${n(p.imageId)}, bone = ${luaString(cid(p.bone))}, ` +
        `w = ${n(p.width)}, h = ${n(p.height)}, dx = ${n(p.offsetX)}, dy = ${n(p.offsetY)}, ` +
        `rot = ${n(p.rotation)}, z = ${n(p.z)}, ` +
        `cx = ${n(c.x)}, cy = ${n(c.y)}, sw = ${n(sw)}, sh = ${n(sh)} },`
      )
    })
    .join('\n')

  const elementsLua = doc.parts
    .filter(p => p.elements && p.elements.length > 0)
    .map(p => {
      const sc = p.scale ?? 1
      const rows = (p.elements ?? [])
        .slice()
        .sort((a, b) => a.zIndex - b.zIndex)
        .map(el => {
          const mask = el.mask
            ? `, mask = { imageId = ${n(el.mask.imageId)}, dx = ${n(el.mask.offsetX)}, dy = ${n(el.mask.offsetY)}` +
              `, w = ${n(el.mask.width)}, h = ${n(el.mask.height)}` +
              `, reverse = ${el.mask.reverse ? 'true' : 'false'}` +
              `, soft = ${el.mask.softEdge ? 'true' : 'false'} }`
            : ''
          return (
            `    { kind = ${luaString(el.type)}, x = ${n(el.x * sc)}, y = ${n(el.y * sc)}` +
            `, w = ${n(el.width * sc)}, h = ${n(el.height * sc)}, rot = ${n(el.rotation)}` +
            `, color = ${luaString(el.color)}, alpha = ${n(el.opacity)}, z = ${n(el.zIndex)}${mask} },`
          )
        })
        .join('\n')
      return `  [${luaString(cid(p.id))}] = {\n${rows}\n  },`
    })
    .join('\n')
  const ikRows = doc.bones
    .filter(b => b.ik && b.parent)
    .map(b => {
      const parent = doc.bones.find(x => x.id === b.parent)
      if (!parent) return null
      return `  { root = ${luaString(cid(parent.a))}, mid = ${luaString(cid(b.a))}, tip = ${luaString(cid(b.b))} },`
    })
    .filter(Boolean)
    .join('\n')

  const poseRows = doc.poses
    .map(pose => {
      const jointRows = Object.entries(pose.joints)
        .map(([jid, v]) => `[${luaString(cid(jid))}] = { x = ${n(v.x)}, y = ${n(v.y)} }`)
        .join(', ')
      return `  [${luaString(pose.name)}] = { ${jointRows} },`
    })
    .join('\n')

  const p = doc.params

  const warnHeader =
    badNumbers > 0 ? `-- ⚠ 已把 ${badNumbers} 个非法数值（NaN/Infinity）按 0 导出，请检查工程数据\n` : ''

  const raw = `${warnHeader}-- 由 Miliastra 2D Rig Editor 导出
-- 骨架：${oneLine(doc.name)}
-- 单位：像素；坐标系与千星控件一致（左上角为原点，y 向下为正）

local Rig = {}

-- 控件模板由调用方传入（来自你项目自己的模板模块）
-- 用法：Rig.CreateCharacter(parent, { container = ..., image = ... })
Rig.PREFAB = {}

Rig.joints = {
${jointRows}
}

Rig.bones = {
${boneRows}
}

Rig.parts = {
${partsLua}
}

-- 复合图元（来自矢量 JSON）：每个图元由若干基础形状组成
Rig.partElements = {
${elementsLua}
}

Rig.ikChains = {
${ikRows}
}

Rig.poses = {
${poseRows}
}

Rig.params = {
  gravity = ${n(p.gravity * 2000)},   -- px/s^2
  damping = ${n(p.damping)},
  friction = ${n(p.friction)},
  restitution = ${n(p.restitution)},
  ground = ${n(doc.ground)},
  iterations = ${Math.round(p.solverIterations)},
}

Rig.boneById = {}
for _, b in ipairs(Rig.bones) do Rig.boneById[b.id] = b end

-- 运行时状态
Rig.state = {}
for _, j in ipairs(Rig.joints) do
  Rig.state[j.id] = { x = j.x, y = j.y, px = j.x, py = j.y, pinned = j.pinned }
end

local function distance(a, b)
  local dx, dy = b.x - a.x, b.y - a.y
  return math.sqrt(dx * dx + dy * dy), dx, dy
end

-- Lua 5.1 用 atan2，5.3 只有 atan(y, x)
local function angleOf(dy, dx)
  if math.atan2 then return math.atan2(dy, dx) end
  return math.atan(dy, dx)
end

-- 骨原长同样按初始姿态快照；否则会取到已经积分过的长度
for _, b in ipairs(Rig.bones) do
  local sa, sb = Rig.state[b.a], Rig.state[b.b]
  if sa and sb then b.__rest = distance(sa, sb) end
end

-- 角度限制的基准角：按初始姿态一次性快照（编辑器侧同样在构造时快照）
for _, b in ipairs(Rig.bones) do
  if b.parent then
    local pb = Rig.boneById[b.parent]
    local pa = pb and Rig.state[pb.a]
    local pe = pb and Rig.state[pb.b]
    local sa, sb = Rig.state[b.a], Rig.state[b.b]
    if pa and pe and sa and sb then
      b.restRel = angleOf(sb.y - sa.y, sb.x - sa.x) - angleOf(pe.y - pa.y, pe.x - pa.x)
    end
  end
end

-- 位置修正必须同时挪上一帧位置，否则修正量会变成速度（编辑器侧同理）
local function shift(s, dx, dy)
  s.x, s.y = s.x + dx, s.y + dy
  s.px, s.py = s.px + dx, s.py + dy
end

-- 固定子步：与编辑器一致，避免帧率波动引起抖动
local FIXED_DT = 1 / 120
local MAX_STEP = 40          -- 单子步最大位移（px）

Rig.acc = 0

--- 推进一帧：内部按 1/120 固定子步积分，最多补 8 步
-- 在客户端脚本的 OnUpdate(dt) 里调用
function Rig.Update(dt)
  if type(dt) ~= "number" or dt ~= dt or dt < 0 then dt = 0 end
  if dt > 0.1 then dt = 0.1 end
  Rig.acc = math.min(Rig.acc + dt, 0.1)
  local guard = 0
  while Rig.acc >= FIXED_DT and guard < 8 do
    Rig.Substep(FIXED_DT)
    Rig.acc = Rig.acc - FIXED_DT
    guard = guard + 1
  end
  return Rig.GetFrame()
end

--- 单个子步：顺序与编辑器完全相同
function Rig.Substep(h)
  local gp = Rig.params
  local damp = 1 - math.min(1, 1 - gp.damping) * 0.5

  -- 1. 积分（限幅单步位移，防止速度失控）
  for _, j in ipairs(Rig.joints) do
    local s = Rig.state[j.id]
    if not s.pinned then
      local vx = (s.x - s.px) * damp
      local vy = (s.y - s.py) * damp
      s.px, s.py = s.x, s.y
      local nx = vx
      local ny = vy + gp.gravity * h * h
      local mag = math.sqrt(nx * nx + ny * ny)
      local k = mag > MAX_STEP and MAX_STEP / mag or 1
      s.x = s.x + nx * k
      s.y = s.y + ny * k
    end
  end

  -- 2. 距离约束与角度约束交替收敛
  for _ = 1, gp.iterations do
    Rig.SolveDistance()
    Rig.SolveAngles(0.3)
  end

  -- 3. 最后一次只沿骨轴修正，保证长度精确
  Rig.ProjectLengths()

  -- 4. 地面：低速接触时清掉速度，避免抖动
  local ground = gp.ground
  for _, j in ipairs(Rig.joints) do
    local s = Rig.state[j.id]
    if not s.pinned and s.y > ground then
      local vy = s.y - s.py
      s.y = ground
      if math.abs(vy) < 20 then
        s.px = s.x
        s.py = s.y
      else
        s.py = s.y + vy * gp.restitution
      end
    end
  end
end

--- 距离约束：骨长固定
function Rig.SolveDistance()
  for _, b in ipairs(Rig.bones) do
    local sa, sb = Rig.state[b.a], Rig.state[b.b]
    if sa and sb and not (sa.pinned and sb.pinned) then
      local rest = Rig.restLength(b)
      local dx, dy = sb.x - sa.x, sb.y - sa.y
      local d = math.sqrt(dx * dx + dy * dy)
      if d > 0.000001 then
        local diff = (d - rest) / d
        local ox, oy = dx * diff, dy * diff
        if sa.pinned then
          shift(sb, -ox, -oy)
        elseif sb.pinned then
          shift(sa, ox, oy)
        else
          shift(sa, ox * 0.5, oy * 0.5)
          shift(sb, -ox * 0.5, -oy * 0.5)
        end
      end
    end
  end
end

--- 只沿骨轴修正长度：不改方向，因此不会重新破坏刚修好的角度
function Rig.ProjectLengths()
  for _, b in ipairs(Rig.bones) do
    local sa, sb = Rig.state[b.a], Rig.state[b.b]
    if sa and sb and not (sa.pinned and sb.pinned) then
      local rest = Rig.restLength(b)
      local dx, dy = sb.x - sa.x, sb.y - sa.y
      local d = math.sqrt(dx * dx + dy * dy)
      if d > 0.000001 then
        local ux, uy = dx / d, dy / d
        local diff = d - rest
        if sa.pinned then
          shift(sb, -ux * diff, -uy * diff)
        elseif sb.pinned then
          shift(sa, ux * diff, uy * diff)
        else
          shift(sa, ux * diff * 0.5, uy * diff * 0.5)
          shift(sb, -ux * diff * 0.5, -uy * diff * 0.5)
        end
      end
    end
  end
end

--- 角度限制：hard 绕关节刚性旋转子链，soft 按刚度逐渐拉回
function Rig.SolveAngles(beta)
  beta = beta or 1
  local MAX_ANGLE_STEP = math.rad(30)
  for _, b in ipairs(Rig.bones) do
    if b.parent and b.mode ~= "none" and b.limitHi ~= b.limitLo then
      local pb = Rig.boneById[b.parent]
      local sa, sb = Rig.state[b.a], Rig.state[b.b]
      if pb and sa and sb and not sb.pinned then
        local pa, pe = Rig.state[pb.a], Rig.state[pb.b]
        if pa and pe then
          local parentAngle = angleOf(pe.y - pa.y, pe.x - pa.x)
          local childAngle = angleOf(sb.y - sa.y, sb.x - sa.x)
          local base = b.restRel or 0
          local rel = childAngle - parentAngle
          local loDeg = math.min(b.limitLo, b.limitHi)
          local hiDeg = math.max(b.limitLo, b.limitHi)
          local lo = base + math.rad(loDeg)
          local hi = base + math.rad(hiDeg)
          local EPS = math.rad(0.5)
          local target = nil
          if rel < lo - EPS then target = lo elseif rel > hi + EPS then target = hi end

          if target then
            -- 单次修正限幅，避免大跨度时弹飞
            local delta = math.max(-MAX_ANGLE_STEP, math.min(MAX_ANGLE_STEP, target - rel))
            local len = distance(sa, sb)
            if len >= 0.001 then
              if b.mode == "hard" then
                -- 撞到边界不该保留朝边界外的速度
                sb.px, sb.py = sb.x, sb.y
                -- 绕关节刚性旋转整段子链：长度与下游角度都不变
                local d2 = delta * beta
                local cos, sin = math.cos(d2), math.sin(d2)
                local moved = {}
                local function rotate(bone)
                  if moved[bone.b] then return end
                  local t = Rig.state[bone.b]
                  if t and not t.pinned then
                    local dx, dy = t.x - sa.x, t.y - sa.y
                    local tx = sa.x + dx * cos - dy * sin
                    local ty = sa.y + dx * sin + dy * cos
                    shift(t, tx - t.x, ty - t.y)
                  end
                  moved[bone.b] = true
                end
                rotate(b)
                for _, other in ipairs(Rig.bones) do
                  local cur, guard = other.parent, 0
                  while cur and guard < 64 do
                    if cur == b.id then
                      rotate(other)
                      break
                    end
                    local pbn = Rig.boneById[cur]
                    cur = pbn and pbn.parent or nil
                    guard = guard + 1
                  end
                end
              else
                local factor = math.min(0.4, (b.stiff or 3) * 0.05)
                local a = childAngle + delta * factor
                local nx = sa.x + math.cos(a) * len
                local ny = sa.y + math.sin(a) * len
                shift(sb, nx - sb.x, ny - sb.y)
              end
            end
          end
        end
      end
    end
  end
end

--- 骨的原长（首次调用时按当前姿态缓存）
function Rig.restLength(b)
  if not b.__rest then
    local sa, sb = Rig.state[b.a], Rig.state[b.b]
    local d = distance(sa, sb)
    b.__rest = d
  end
  return b.__rest
end

--- 取当前帧：关节坐标 + 骨的中点/角度/长度
function Rig.GetFrame()
  local frame = { joints = {}, bones = {} }
  for _, j in ipairs(Rig.joints) do
    local s = Rig.state[j.id]
    frame.joints[j.id] = { x = s.x, y = s.y }
  end
  for _, b in ipairs(Rig.bones) do
    local sa, sb = Rig.state[b.a], Rig.state[b.b]
    local mx, my = (sa.x + sb.x) * 0.5, (sa.y + sb.y) * 0.5
    local dx, dy = sb.x - sa.x, sb.y - sa.y
    frame.bones[b.id] = {
      x = mx,
      y = my,
      angle = angleOf(dy, dx),
      length = math.sqrt(dx * dx + dy * dy),
      width = b.width,
    }
  end
  Rig.frame = frame
  return frame
end

--- 把某个关节钉住或解除（对应编辑器里的「固定」）
function Rig.SetPinned(jointId, value)
  local s = Rig.state[jointId]
  if s then s.pinned = value end
end

--- 施加一次冲量（点击、碰撞用）
function Rig.Impulse(jointId, ix, iy, scale)
  local s = Rig.state[jointId]
  if not s or s.pinned then return end
  local k = scale or 1
  s.px = s.px - ix * k
  s.py = s.py - iy * k
end

Rig.partById = {}
for _, p in ipairs(Rig.parts) do Rig.partById[p.id] = p end

--- 取图元当前的摆放参数：坐标、旋转（弧度）、尺寸
function Rig.GetPartTransform(partId)
  local p = Rig.partById[partId]
  if not p then return nil end
  -- 未绑定骨骼的部件：停在原地，只按自身旋转变换
  if not p.bone or p.bone == "" then
    return { x = p.cx or 0, y = p.cy or 0, angle = math.rad(p.rot or 0), w = p.w, h = p.h }
  end
  if not Rig.frame then return nil end
  local b = Rig.frame.bones[p.bone]
  if not b then return nil end
  local x = b.x + math.cos(b.angle) * p.dx - math.sin(b.angle) * p.dy
  local y = b.y + math.sin(b.angle) * p.dx + math.cos(b.angle) * p.dy
  return { x = x, y = y, angle = b.angle + math.rad(p.rot), w = p.w, h = p.h }
end

-- 双骨 IK：把 end 关节拖到 (tx, ty)，自动解算 mid，保持两段长度
function Rig.SolveIK(chain, tx, ty)
  local R = Rig.state[chain.root]
  local M = Rig.state[chain.mid]
  local E = Rig.state[chain.tip]
  if not R or not M or not E then return end

  local L1 = math.sqrt((M.x - R.x) ^ 2 + (M.y - R.y) ^ 2)
  local L2 = math.sqrt((E.x - M.x) ^ 2 + (E.y - M.y) ^ 2)
  local dx, dy = tx - R.x, ty - R.y
  local dist = math.sqrt(dx * dx + dy * dy)
  if dist < 1e-6 then return end

  local d = math.max(math.abs(L1 - L2) + 0.01, math.min(L1 + L2 - 0.01, dist))
  local ux, uy = dx / dist, dy / dist
  local cross = ux * (M.y - R.y) - uy * (M.x - R.x)
  local sign = cross >= 0 and 1 or -1
  local a = (L1 * L1 - L2 * L2 + d * d) / (2 * d)
  local h = math.sqrt(math.max(0, L1 * L1 - a * a))

  M.x, M.y = R.x + ux * a - uy * h * sign, R.y + uy * a + ux * h * sign
  E.x, E.y = R.x + ux * d, R.y + uy * d
end

-- 应用姿势：t 为 0~1，可在两个姿势之间插值
function Rig.ApplyPose(name, t)
  local target = Rig.poses[name]
  if not target then return end
  local k = math.max(0, math.min(1, t or 1))
  for jid, pos in pairs(target) do
    local s = Rig.state[jid]
    if s and not s.pinned then
      if k >= 1 then
        -- 直接摆到位：当作瞬移，清掉速度
        s.x, s.y = pos.x, pos.y
        s.px, s.py = pos.x, pos.y
      else
        -- 部分混合：位置与上一帧位置一起挪，有位移但不额外注入速度
        local dx = (pos.x - s.x) * k
        local dy = (pos.y - s.y) * k
        s.x, s.y = s.x + dx, s.y + dy
        s.px, s.py = s.px + dx, s.py + dy
      end
    end
  end
end

-- 按图元数据创建控件：createControl(elementKind) 返回一个图片控件
-- 颜色用 imageColor，遮罩用 enableMask / reverseMaskArea
function Rig.CreateParts(createControl)
  for _, part in ipairs(Rig.parts) do
    local els = Rig.partElements[part.id]
    if els then
      for _, el in ipairs(els) do
        local c = createControl(el.kind)
        if c then
          c.enableMask = el.mask ~= nil
          if el.mask then
            c.reverseMaskArea = el.mask.reverse == true
            c.enableSoftEdge = el.mask.soft == true
          end
          if el.color and c.SetColor then
            local r = tonumber(el.color:sub(2, 3), 16) or 255
            local g = tonumber(el.color:sub(4, 5), 16) or 255
            local b = tonumber(el.color:sub(6, 7), 16) or 255
            c:SetColor(Color.FromRGBA(r, g, b, math.floor((el.alpha or 1) * 255)))
          end
        end
      end
    end
  end
end

--- 骨架当前高度（像素），用于运行时换算缩放
function Rig.GetSize()
  local minX, minY = math.huge, math.huge
  local maxX, maxY = -math.huge, -math.huge

  local function add(x0, y0, x1, y1)
    minX = math.min(minX, x0); maxX = math.max(maxX, x1)
    minY = math.min(minY, y0); maxY = math.max(maxY, y1)
  end

  for _, j in ipairs(Rig.joints) do add(j.x, j.y, j.x, j.y) end
  for _, p in ipairs(Rig.parts) do
    if p.cx and p.cy then
      local hw, hh = (p.sw or 0) / 2, (p.sh or 0) / 2
      -- 用当前骨骼位置推算（绑定件会随骨骼动）
      local s = Rig.state and p.bone and p.bone ~= '' and Rig.state[p.bone] or nil
      add(p.cx - hw, p.cy - hh, p.cx + hw, p.cy + hh)
    end
  end

  if minX == math.huge then return 0, 0 end
  return maxX - minX, maxY - minY
end

function Rig.GetHeight()
  local _, h = Rig.GetSize()
  return h
end

--- 按目标屏幕高度缩放整个角色；返回实际使用的 k
-- control 传角色的根控件，子控件会跟着缩放
function Rig.FitHeight(control, targetHeight)
  local _, h = Rig.GetSize()
  if h <= 0 then return 1 end
  local k = targetHeight / h
  if control and control.SetLocalScale then
    control:SetLocalScale(k, k)
  end
  return k
end

--- 运行时手动设缩放的兜底：k 自己算好传入
function Rig.SetScale(control, k)
  if control and control.SetLocalScale then
    control:SetLocalScale(k, k)
  end
  return k
end

--- 统一设置锚点、轴心、位置、旋转与缩放
-- 千星控件默认按左上角定位，不设 anchor/pivot 会整体偏移
function Rig.ResetControl(control, x, y, rot, sx, sy)
  if not control then return nil end
  if control.SetAnchorMin then control:SetAnchorMin(0.5, 0.5) end
  if control.SetAnchorMax then control:SetAnchorMax(0.5, 0.5) end
  if control.SetPivot then control:SetPivot(0.5, 0.5) end
  control:SetAnchoredPosition(x or 0, y or 0)
  control:SetLocalRotation(0, 0, rot or 0)
  control:SetLocalScale(sx or 1, sy or 1, 1)
  return control
end

-- 画布尺寸与原点：文档坐标原点在左上角，千星控件原点是父控件中心
Rig.canvas = { w = ${doc.canvas.width}, h = ${doc.canvas.height} }
Rig.origin = { x = Rig.canvas.w / 2, y = Rig.canvas.h / 2 }

--- 文档坐标 → 控件坐标
function Rig.ToScreen(x, y)
  return x - Rig.origin.x, y - Rig.origin.y
end

-- 图片类型映射：矩形 / 圆 / 三角
local IMAGE_OF_KIND = { rectangle = 100001, ellipse = 100002, triangle = 100003 }

--- 创建一个角色：根容器 + 每个部件一个组节点
-- parent 父控件（nil 表示挂到 UI 根）
-- prefab { container = 容器模板, image = 图片模板, part = 部件组模板(可选，缺省用 container) }
-- 返回根容器控件
function Rig.CreateCharacter(parent, prefab)
  prefab = prefab or Rig.PREFAB
  local containerPrefab = prefab.container
  local imagePrefab = prefab.image
  if not containerPrefab or not imagePrefab then
    error("CreateCharacter 缺少控件模板：请传入 { container = 索引, image = 索引 }")
  end
  if not game or not game.InstantiateClientUIControl then return nil end

  local base = parent
  if not base then
    local roots = game.GetClientUIRoots and game.GetClientUIRoots() or nil
    base = roots and roots[1] or nil
  end

  local root = game.InstantiateClientUIControl(containerPrefab, base)
  if not root then return nil end
  Rig.ResetControl(root, 0, 0, 0, 1, 1)

  local partPrefab = prefab.part or containerPrefab
  local groups = {}
  local elements = {}

  -- 按 z 升序创建并设置兄弟序号，保证遮挡关系稳定
  local ordered = {}
  for _, part in ipairs(Rig.parts) do ordered[#ordered + 1] = part end
  table.sort(ordered, function(a, b) return (a.z or 0) < (b.z or 0) end)

  for index, part in ipairs(ordered) do
    local g = game.InstantiateClientUIControl(partPrefab, root)
    if g then
      if g.SetSiblingIndex then g:SetSiblingIndex(index - 1) end
      local gx, gy = Rig.ToScreen(part.cx or 0, part.cy or 0)
      Rig.ResetControl(g, gx, gy, part.rot or 0, 1, 1)
      groups[part.id] = g

      local els = Rig.partElements[part.id]
      if els then
        for _, el in ipairs(els) do
          local c = game.InstantiateClientUIControl(imagePrefab, g)
          if c then
            c:SetImage(Enum.ImageSource.StaticReference, IMAGE_OF_KIND[el.kind] or 100001)
            -- 元素用相对部件中心的局部坐标，跟随组节点一起转
            -- 元素坐标是「场景画布内」的坐标，组节点已经放在部件中心，
            -- 所以这里必须减去部件自身画布的一半，不能减世界坐标（part.cx）
            Rig.ResetControl(c, el.x - (part.sw or 0) / 2, el.y - (part.sh or 0) / 2, el.rot, 1, 1)
            if c.SetSizeDelta then c:SetSizeDelta(el.w, el.h) end
            c.imageColor = Color.FromRGBA(
              tonumber(el.color:sub(2, 3), 16) or 255,
              tonumber(el.color:sub(4, 5), 16) or 255,
              tonumber(el.color:sub(6, 7), 16) or 255,
              math.floor((el.alpha or 1) * 255)
            )
            c.enableMask = el.mask ~= nil
            if el.mask then
              c.reverseMaskArea = el.mask.reverse == true
              c.enableSoftEdge = el.mask.soft == true
            end
            elements[#elements + 1] = { control = c, part = part }
          end
        end
      end
    end
  end

  Rig.groups = groups
  Rig.controls = elements
  Rig.root = root
  return root
end

--- 每帧把控件摆到当前姿态：OnUpdate 里调用一次
function Rig.UpdateControls()
  if not Rig.frame or not Rig.groups then return end
  for _, part in ipairs(Rig.parts) do
    local g = Rig.groups[part.id]
    if g then
      local t = Rig.GetPartTransform(part.id)
      if t then
        local sx, sy = Rig.ToScreen(t.x, t.y)
        g:SetAnchoredPosition(sx, sy)
        g:SetLocalRotation(0, 0, (t.angle or 0) * 180 / math.pi)
      end
    end
  end
end


return Rig
`

  return raw
}

/** 生成一个最小示例：如何把骨架接到控件上 */
export function toLuaExample(): string {
  return `-- 用法示例（粘到你的客户端脚本里）
local Rig = require("rig")

function OnUpdate(dt)
  local frame = Rig.Update(dt)

  -- 骨：用图片控件按中点与角度摆放
  for id, t in pairs(frame.bones) do
    local control = BoneControls[id]
    if control then
      control:SetAnchoredPosition(t.x, t.y)
      control:SetLocalRotation(t.angle)
      control:SetLocalScale(1, t.length / BaseLength[id])
    end
  end

  -- 关节：用圆形控件标出节点位置
  for id, p in pairs(frame.joints) do
    local control = JointControls[id]
    if control then
      control:SetAnchoredPosition(p.x, p.y)
    end
  end
end
`
}
