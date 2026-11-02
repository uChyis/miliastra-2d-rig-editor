-- TS ↔ Lua 物理对照的驱动脚本（由 scripts/parity.mjs 调用）
-- 用法：lua53 lua-driver.lua <导出的 rig.lua> <dt1,dt2,...>
-- 输出：第一行 IDS <关节 id 列表>，之后每行是一次 Update(dt) 后的 x,y（%.9f）

local rigPath = arg[1]
local dtList = arg[2]

-- 导出的模块在加载期只需要这几个全局；Update 本身不触碰引擎
game = {
  InstantiateClientUIControl = function() return nil end,
  GetClientUIRoots = function() return nil end,
}
Enum = { ImageSource = { StaticReference = 1 }, ImageType = { Basic = 1 } }
Color = { FromRGBA = function(r, g, b, a) return { r, g, b, a } end }

local chunk = assert(loadfile(rigPath))
local Rig = assert(chunk(), '导出的 lua 没有返回 Rig')

local ids = {}
for _, j in ipairs(Rig.joints) do ids[#ids + 1] = j.id end
print('IDS ' .. table.concat(ids, ','))

-- dt 允许用 nan / inf / -inf 三个特殊标记，方便测异常输入
local function parseDt(token)
  if token == 'nan' then return 0 / 0 end
  if token == 'inf' then return math.huge end
  if token == '-inf' then return -math.huge end
  return tonumber(token)
end

for token in string.gmatch(dtList, '[^,]+') do
  Rig.Update(parseDt(token))
  local cells = {}
  for _, id in ipairs(ids) do
    local s = Rig.state[id]
    cells[#cells + 1] = string.format('%.9f,%.9f', s.x, s.y)
  end
  print(table.concat(cells, ','))
end
