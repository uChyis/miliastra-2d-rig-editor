# Miliastra 2D Rig Editor

[![CI](https://github.com/uChyis/miliastra-2d-rig-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/uChyis/miliastra-2d-rig-editor/actions/workflows/ci.yml)
[![Deploy](https://github.com/uChyis/miliastra-2d-rig-editor/actions/workflows/pages.yml/badge.svg)](https://github.com/uChyis/miliastra-2d-rig-editor/actions/workflows/pages.yml)

面向原神「千星奇域」（UGC）的 **2D 关节 / 骨骼编辑与绑定工具**：在浏览器里搭骨架、把矢量稿绑到骨上、用物理预览调姿势，导出**千星客户端可直接使用的 Lua 模块**。

纯前端（React + Konva + Zustand），无需账号、无需联网，一个静态站点就能跑。

> English: a browser-based 2D joint/rig editor for Genshin Impact's UGC platform (Miliastra). Rigs a character from vector parts, previews physics, and exports a Lua module the game client can drive.

## 它做什么 / 不做什么

**做**
- 用关节和骨搭出人形、四足或任意链式骨架
- 把「矢量稿 JSON」作为部件挂到骨上，摆位、定层级
- 记录姿势，导出后由游戏脚本切换
- 用与导出端**同一套 Verlet 求解器**做物理预览
- 导出 JSON 工程（可回导继续改）与千星 Lua（数据 + 求解器 + 控件创建）

**不做**
- 不做时间轴动画（目前只有姿势 + 代码插值）
- 不做蒙皮/网格变形（部件是刚体，跟骨整体变换）
- 不生成玩法逻辑

这些都列在下面的 [Roadmap](#roadmap) 里，属于**有意留白**，不是遗漏。

## 快速开始

```powershell
# Windows：双击 start.bat（起本地服务并打开 http://127.0.0.1:5178/）
# 或
pnpm install
pnpm dev        # 开发
pnpm build      # 类型检查 + 构建到 dist/
pnpm preview    # 预览构建产物
```

`dist/` 可直接放 GitHub Pages / Cloudflare Pages 等静态托管（`base: './'`，子目录也能用）。

**在线试用**：<https://uChyis.github.io/miliastra-2d-rig-editor/>

**没有后端也能用**：`server.mjs` 只负责把工程存成文件；没有 `/api` 时自动退到浏览器 OPFS。

## 功能

| 模块 | 现状 |
|---|---|
| **骨架预设** | 人形 19 关节 / 18 骨、四足 23 / 22、单链 5 / 4，另可新建空白骨架；预设**追加**到当前工程，不动已有部件 |
| **关节** | 拖动、增删、改名、多选/框选、整体平移、设为固定（锚点） |
| **骨** | 两点连接、父子关系、角度限制（硬止挡 / 软回弹 / 不限）、IK 末端、骨粗、质量 / 摩擦 / 弹性 / 阻尼 |
| **IK** | 前臂、小腿这类两节链，预设默认开启；拖动末端关节时反解中间关节 |
| **部件** | 导入矢量稿 JSON（可多选）、显示为图元组、绑定骨骼（下拉或画布拾取）、偏移 / 相对旋转 / 缩放、层级 z |
| **姿势** | 记录当前 / 应用 / 删除，随工程一起导出 |
| **物理预览** | Verlet 质点 + 距离约束 + 角度限制，固定 1/120 子步；重力 / 阻尼 / 迭代可调 |
| **导出** | 工程 JSON（可回导）、千星 Lua（`Rig.*` 模块） |
| **工程管理** | 多标签、撤销重做、复制粘贴、自动保存、历史缓存清理 |
| **界面** | 深浅主题、资产栏（搜索 / 筛选 / 聚焦）、设置面板、内置教程 |

## 导出的 Lua 怎么接

导出文件是一个**独立模块**，不引用任何宿主约定，控件模板索引由调用方传入：

```lua
local UI  = require('my-prefabs')   -- { container = 索引, image = 索引 }
local Rig = require('hero')         -- 本工具导出的文件

function OnStart()
  local root = Rig.CreateCharacter(nil, { container = UI.container, image = UI.image })
  Rig.FitHeight(root, 320)          -- 按目标屏幕高度缩放
  Rig.ApplyPose('idle', 1)
end

function OnUpdate(dt)
  Rig.Update(dt)                    -- 推进物理
  Rig.UpdateControls()              -- 把控件摆到当前姿态
end
```

完整可运行示例见 [`examples/demo.lua`](examples/demo.lua)。

主要接口：

| 函数 | 作用 |
|---|---|
| `Rig.CreateCharacter(parent, prefab)` | 建根容器 + 每个部件一个组节点 |
| `Rig.Update(dt)` | 推进一帧物理，返回关节与骨姿态 |
| `Rig.UpdateControls()` | 把组节点摆到当前姿态 |
| `Rig.ApplyPose(name, t)` | 应用姿势，`t` 0–1 可做过渡 |
| `Rig.SolveIK(chain, x, y)` | 把 IK 链末端拖到目标点 |
| `Rig.FitHeight(root, h)` | 按目标高度缩放整角色 |
| `Rig.ResetControl(c, x, y, rot, sx, sy)` | 设锚点 / 轴心 / 位置 / 旋转 / 缩放 |
| `Rig.GetPartTransform(id)` / `Rig.GetSize()` | 取部件变换 / 骨架包围盒 |

## 目录结构

```
src/
├── App.tsx                  顶栏、标签、持久化、预览循环
├── components/
│   ├── StageCanvas.tsx      Konva 画布：命中、拖拽、变换框、图元绘制
│   ├── Sidebar.tsx          右侧属性栏（世界 / 关节 / 骨骼 / 部件 / 姿势）
│   ├── AssetPanel.tsx       左侧资产栏
│   ├── TutorialDialog.tsx   内置教程
│   └── ui/                  Button / Select / Slider / Card / Tooltip
├── physics/verlet.ts        物理求解器（与导出的 Lua 同构）
├── rig/
│   ├── types.ts             数据模型：RigDoc / Joint / Bone / Part / Pose
│   ├── templates.ts         三套骨架预设
│   ├── scene.ts             解析矢量稿 JSON
│   └── migrate.ts           旧工程迁移与默认值
├── store/rigStore.ts        Zustand：文档、选区、撤销栈、姿势、绑定
├── export/
│   ├── exportLua.ts         导出千星 Lua（数据 + 求解器 + 控件创建）
│   └── exportRig.ts         导出工程 JSON
└── storage/opfs.ts          没有后端时的浏览期存储兜底
```

## 几条硬约定（改代码前先看）

1. **编辑器与导出必须是同一套物理**：预览走 `src/physics/verlet.ts`，导出走 `exportLua.ts` 里的 `Rig.Update`，改一边必须同步另一边
2. **固定子步 1/120**，不要用真实 dt 积分
3. **每轮先距离约束、再按 beta 渐进修角度**（100% 修正在边界上会来回弹）
4. **拖拽 = 绕父关节旋转**，不是拉向鼠标（直接拉会两帧循环抖动）
5. **角度限制相对「静止姿态」**，不是绝对角度；预设默认不限制
6. **千星控件原点是父节点中心，文档原点在左上角**：所有位置必须过 `Rig.ToScreen`
7. **一个部件 = 一个组节点**，否则部件无法整体旋转

## 已知限制

- **尚未在千星真机验证**：控件能否创建、`SetSizeDelta` 语义、旋转符号、`SetSiblingIndex` 的遮挡顺序、颜色与整体缩放，都只在桩环境跑过
- **遮罩控件未创建**：渐变素材的 `enableMask` 只置了标志位，真机上不会生效
- **没有时间轴**：只有姿势切换 + 代码插值
- 部件内的图元只应用自身旋转，部件整体旋转依赖组节点

## Roadmap

**这是一个会继续开发的项目，不是存档。** 优先级按"卡不卡住别人用"排：

### P0 · 先让它在真机上跑通

- [ ] 真机首跑，逐项确认：控件能否创建、`SetSizeDelta` 的语义、旋转符号、`SetSiblingIndex` 的遮挡顺序、`Color.FromRGBA`、整体缩放
- [ ] 修首跑暴露的问题（大概率集中在坐标原点 / 尺寸 / 旋转符号）
- [ ] 把结论写回下面「已知限制」一节

> 这一项没做完之前，其它功能的收益都打折——因为无法区分"编辑器错了"还是"导出错了"。

### P1 · 补齐"能不能用"的判断

- [ ] **控件预算面板**：部件数 / 着色图元 / 总控件（含容器）/ 透明图元，按部件分组
      口径：`总控件 = opacity > 0 的图元数 + 每个部件组的容器`
- [ ] **叠图对照**：把参考图半透明叠在画布上，检查比例、接缝、遮挡
- [ ] **目标尺寸预览**：按实际展示高度渲染，提前发现"缩小后糊成一团"

### P2 · 与生态互补，而不是重叠

- [ ] **物理导出**：把 Verlet 结果转成每帧 `SetJointsJSON` 调用，接到 `studio.qiyu.games` 导出的 `PrimitiveRigEngine.lua` 上（它的引擎明确不含物理）
- [ ] **布局 JSON → GIA**：把多个图元组 + 容器打包成可导入编辑器的官方资产格式（这一段目前没有现成工具）

### 有意不做

| 不做 | 原因 |
|---|---|
| 时间轴 / 动作分层编辑器 | 生态里已有成熟工具覆盖，重复实现不划算 |
| 网格形变 / Live2D 导入 | 同上；且面片数会直接撞上控件预算上限 |
| 云项目 / 分享 / 资产中心 | 同上 |
| 蒙皮权重 | 千星运行时只接受整控件的刚体变换 |

### 贡献

- 提交前跑 `pnpm build`（含 `tsc --noEmit`）
- 改动如果涉及物理或导出，请说明**是否在千星真机验证过**；没验证请明确写"未验证"
- 改 `src/physics/verlet.ts` 必须同步改 `src/export/exportLua.ts` 里的 `Rig.Substep`（两边必须同构），并跑 `pnpm parity` 确认逐子步一致

#### 本地校验脚本

```powershell
pnpm check          # 下面四个一起跑
pnpm check:data     # 工程校验 + 矢量稿解析（不需要额外环境）
pnpm check:opfs     # 存储层：多级目录、删除、列举（用假 OPFS，不需要浏览器）
pnpm check:export   # 导出侧：图元坐标系、名字转义（需要 lua5.3）
pnpm parity         # 物理：TS 与 Lua 逐子步比对 8 个场景（需要 lua5.3）
```

后两个通过 `LUA53` 环境变量找解释器，默认 `C:\Tools\Lua\lua53.exe`；
没有 lua5.3 时它们会提示跳过并以 0 退出，不会卡住 CI。

## 部署

仓库自带两个工作流：

| 工作流 | 触发 | 作用 |
|---|---|---|
| `.github/workflows/ci.yml` | push 与 PR | `pnpm install` + `pnpm build`，确认能构建 |
| `.github/workflows/pages.yml` | push 到 `main`、或手动 | 构建 `dist/` 并部署到 GitHub Pages |

**首次发布需要手动开一次**：仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
之后每次 push 到 `main` 自动更新，站点地址在 Actions 的 deploy 步骤里能看到。

不想用 Pages 也可以自己托管 `dist/`：`vite.config.ts` 里 `base: './'`，放子目录也能用。

## 许可

MIT，见 [LICENSE](LICENSE)。
