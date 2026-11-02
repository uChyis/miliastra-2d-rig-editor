-- 骨骼编辑器导出的 Lua 该怎么接进来：最小可运行示例
-- 用法：把本文件改名成你的主脚本（例如 main.lua），按需改模板索引与姿势名

local UI = require('my-prefabs')      -- 你自己的模板模块：{ container = 索引, image = 索引 }
local Rig = require('hero')           -- 骨骼编辑器导出的 hero.lua

local root

function OnStart()
  -- 1. 建控件树：根容器 + 每个部件一个组节点
  root = Rig.CreateCharacter(nil, { container = UI.container, image = UI.image })
  if not root then
    print('[rig] 创建失败：检查容器/图片模板索引是否填对')
    return
  end

  -- 2. 定大小：按目标屏幕高度换算，改这一个数字即可
  local k = Rig.FitHeight(root, 320)
  print('[rig] 缩放 k =', k)

  -- 3. 初始姿势
  Rig.ApplyPose('idle', 1)
end

function OnUpdate(dt)
  -- 1. 推进物理（不用物理时可以不调）
  Rig.Update(dt)

  -- 2. 把控件摆到当前姿态
  Rig.UpdateControls()

  -- 3. 要驱动姿势时：
  -- Rig.ApplyPose('kick', 0.3)
  --
  -- 4. 要用 IK 时：
  -- local chain = Rig.ikChains[1]
  -- Rig.SolveIK(chain, targetX, targetY)
end

function OnDestroy()
  Rig.controls = nil
  Rig.groups = nil
  Rig.root = nil
end
