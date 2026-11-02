-- 导出侧检查的驱动：装好假控件工厂，跑 CreateCharacter / UpdateControls
-- 输出 ELEMENT/GROUP 行，由 scripts/export-check.mjs 解析断言

local rigPath = arg[1]

local function newControl(prefab, parent)
  local c = { prefab = prefab, parent = parent, children = {}, px = 0, py = 0, rot = 0 }
  function c:SetAnchorMin() end
  function c:SetAnchorMax() end
  function c:SetPivot() end
  function c:SetAnchoredPosition(x, y) self.px, self.py = x, y end
  function c:SetLocalRotation(a, b, d) self.rot = d end
  function c:SetLocalScale(x, y) self.sx, self.sy = x, y end
  function c:SetImage(src, id) self.imageId = id end
  function c:SetSizeDelta(w, h) self.w, self.h = w, h end
  function c:SetSiblingIndex(i) self.sibling = i end
  function c:SetVisible() end
  if parent then parent.children[#parent.children + 1] = c end
  return c
end

game = {
  InstantiateClientUIControl = newControl,
  GetClientUIRoots = function() return { newControl(0, nil) } end,
}
Enum = { ImageSource = { StaticReference = 1 }, ImageType = { Basic = 1 } }
Color = { FromRGBA = function(r, g, b, a) return { r, g, b, a } end }

local Rig = assert(assert(loadfile(rigPath))(), '导出文件没有返回 Rig')
local root = assert(Rig.CreateCharacter(nil, { container = 1, image = 2 }), 'CreateCharacter 失败')

for partId, g in pairs(Rig.groups) do
  print(string.format('GROUP %s %.6f %.6f %.6f', partId, g.px, g.py, g.rot or 0))
  for _, child in ipairs(g.children) do
    print(string.format('ELEMENT %s %.6f %.6f %.6f', partId, child.px, child.py, child.rot or 0))
  end
end
