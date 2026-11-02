import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PanelItem } from '@/components/ui/panel-item'

interface Props {
  open: boolean
  onClose: () => void
}

interface Section {
  id: string
  title: string
  body: React.ReactNode
}

const H = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-1 mt-4 text-[13px] font-medium text-text">{children}</div>
)

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2 text-[13px] leading-6 text-muted">{children}</p>
)

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <div className="flex gap-2.5">
    <div className="flex flex-col items-center">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] text-on-primary">{n}</span>
      <span className="mt-1 w-px flex-1 bg-outline" />
    </div>
    <p className="pb-3 text-[13px] leading-6 text-muted">{children}</p>
  </div>
)

const ROW = ({ k, v }: { k: string; v: string }) => (
  <div className="flex gap-3 py-1.5">
    <span className="w-20 shrink-0 text-[13px] text-text">{k}</span>
    <span className="text-[13px] leading-6 text-muted">{v}</span>
  </div>
)

const SECTIONS: Section[] = [
  {
    id: 'keys',
    title: '快捷键',
    body: (
      <>
        <P>画布上的常用操作。</P>
        <PanelItem>
          <ROW k="Ctrl C" v="复制选中的关节 / 骨骼 / 部件" />
          <ROW k="Ctrl V" v="粘贴到当前工程（偏移 24px）" />
          <ROW k="Delete" v="删除选中内容" />
          <ROW k="中键拖动" v="平移画布" />
          <ROW k="滚轮" v="缩放画布（50%–500%）" />
          <ROW k="左键框选" v="框选关节、骨骼与部件" />
          <ROW k="双击标签" v="重命名标签" />
        </PanelItem>
        <H>鼠标</H>
        <P>右键画布打开菜单，可添加关节、骨骼、骨架预设，或导入工程与矢量稿。</P>
      </>
    ),
  },
  {
    id: 'start',
    title: '完整工作流',
    body: (
      <>
        <P>从一张矢量稿到能在千星里跑起来的角色，完整流程如下。</P>

        <H>一、准备造型</H>
        <div className="rounded-inner bg-surface px-3 py-2.5">
          <Step n={1}>矢量工具里做好造型，导出 SVG</Step>
          <Step n={2}>用矢量稿转换技能转成 scene JSON</Step>
          <Step n={3}>顶栏「导入 → 矢量稿 JSON」，可一次选多个</Step>
        </div>

        <H>二、摆位</H>
        <div className="rounded-inner bg-surface px-3 py-2.5">
          <Step n={4}>在画布上拖动部件，用变换框缩放与旋转</Step>
          <Step n={5}>必要时在「部件」标签里调坐标、缩放、旋转</Step>
        </div>

        <H>三、搭骨架</H>
        <div className="rounded-inner bg-surface px-3 py-2.5">
          <Step n={6}>「骨骼」标签里套用预设，或右键逐个添加关节与骨骼</Step>
          <Step n={7}>拖动关节让骨架贴合造型</Step>
          <Step n={8}>给需要弯曲的骨设父骨骼与角度上下限</Step>
          <Step n={9}>手臂、腿这类链打开「IK 末端」，之后拖末端即可摆姿势</Step>
        </div>

        <H>四、绑定</H>
        <div className="rounded-inner bg-surface px-3 py-2.5">
          <Step n={10}>选中部件 →「部件」标签 → 下拉选骨，或点「画布拾取」后在画布上点骨</Step>
          <Step n={11}>绑定后调偏移与相对旋转，让造型贴合骨骼</Step>
          <Step n={12}>用左侧资产栏检查是否有漏绑的部件</Step>
        </div>

        <H>五、物理与姿势</H>
        <div className="rounded-inner bg-surface px-3 py-2.5">
          <Step n={13}>「世界」标签调重力、拖拽力、求解迭代</Step>
          <Step n={14}>对头发、披风等设软限制的骨，进「物理预览」看摆动</Step>
          <Step n={15}>摆好一个姿态，到「姿势」标签点「记录当前」存下来</Step>
        </div>

        <H>六、导出</H>
        <div className="rounded-inner bg-surface px-3 py-2.5">
          <Step n={16}>「导出 → 工程 JSON」存档，方便下次继续改</Step>
          <Step n={17}>「导出 → 千星 Lua」拿到运行时脚本</Step>
        </div>
      </>
    ),
  },
  {
    id: 'runtime',
    title: '运行时接入',
    body: (
      <>
        <P>导出的 Lua 是数据加求解器，需要你自己把它挂到控件上。</P>
        <div className="rounded-inner bg-surface px-3 py-2.5">
          <ROW k="Rig.Update(dt)" v="推进一帧物理，返回关节与骨骼姿态" />
          <ROW k="Rig.GetFrame()" v="取当前帧的关节坐标与骨骼中点、角度" />
          <ROW k="Rig.GetPartTransform(id)" v="取部件的坐标、旋转、尺寸" />
          <ROW k="Rig.ApplyPose(name, t)" v="应用姿势，t 为 0–1 可做过渡" />
          <ROW k="Rig.SolveIK(chain, x, y)" v="把 IK 链末端拖到目标点" />
          <ROW k="Rig.FitHeight(root, 高度)" v="按目标屏幕高度缩放整个角色" />
        </div>
        <H>典型顺序</H>
        <div className="rounded-inner bg-surface px-3 py-2.5 text-[13px] leading-6 text-muted">
          <div>1. 开局：建好控件树，Rig.CreateParts 挂上部件</div>
          <div>2. 一次性：Rig.FitHeight(root, 目标高度) 决定大小</div>
          <div>3. 每帧：local frame = Rig.Update(dt)</div>
          <div>4. 每帧：按 frame 摆控件，或走 IK / 姿势驱动</div>
        </div>
        <H>尺寸</H>
        <P>导出的是比例正确的几何，最终多大由运行时的 FitHeight 决定，改一个数字即可，不用重新导出。</P>
      </>
    ),
  },
  {
    id: 'glossary',
    title: '术语表',
    body: (
      <>
        <P>这里的概念按“源文件 → 对象 → 结构 → 产出”分四层，名字互不重叠。</P>
        <PanelItem>
          <ROW k="矢量稿" v="外部矢量工具导出的 JSON（画布尺寸 + 若干图形）。只用于导入，不是编辑器里的对象。" />
          <ROW k="部件" v="一块可绑定的造型，由矢量稿导入而来，内部含任意多个图形。用户只操作部件，不操作图形。" />
          <ROW k="关节" v="一个点。两根骨骼在这里交汇，可以拖动、可以固定。" />
          <ROW k="骨骼" v="两个关节之间的一段。有质量、摩擦、角度限制。" />
          <ROW k="骨架" v="关节 + 骨骼的整体。" />
          <ROW k="工程 JSON" v="骨架 + 部件 + 参数，可再导入继续编辑。" />
          <ROW k="千星 Lua" v="给客户端脚本使用的数据与求解器代码。" />
        </PanelItem>
        <H>容易混淆的两组</H>
        <P>「骨骼」指一段，「骨架」指整体；「矢量稿」是源文件，「部件」是导入后的对象。</P>
      </>
    ),
  },
  {
    id: 'edit',
    title: '关节与骨骼',
    body: (
      <>
        <P>画布右键是主要入口，所有结构编辑都在那里。</P>
        <div className="space-y-1 rounded-inner bg-surface px-3 py-2.5 text-[13px] leading-6 text-muted">
          <div>· 添加关节 / 添加骨骼：骨骼会自动带两个关节</div>
          <div>· 删除：也可按 Delete 键</div>
          <div>· 固定：关节固定成锚点，骨骼两端都被固定时整根不动</div>
          <div>· 连接：选中一个关节 → 底栏连接 → 点另一个关节</div>
          <div>· 固定 / 连接 / 删除 / 复制：选中后从底栏操作</div>
          <div>· 添加骨架：右键 →「添加骨架」，会在当前工程里追加一副预设</div>
        </div>
        <H>选择方式</H>
        <P>左键点选，空白拖动为框选，中键拖动画布，滚轮缩放。</P>
      </>
    ),
  },
  {
    id: 'part',
    title: '部件与绑定',
    body: (
      <>
        <P>部件是一块造型，内部可以包含很多图形，但用户只操作部件本身。</P>
        <div className="rounded-inner bg-surface px-3 py-2.5">
          <ROW k="导入" v="顶栏「导入 → 矢量稿 JSON」，可一次选多个文件" />
          <ROW k="摆放" v="画布上直接拖动；选中后有变换框，可缩放与旋转" />
          <ROW k="绑定" v="选中部件 → 部件标签 → 绑定骨骼下拉，选一根骨" />
          <ROW k="解绑" v="下拉里选「未绑定」，部件会停在当前位置" />
        </div>
        <H>绑定之后</H>
        <P>部件的坐标由骨骼决定，灰色虚线表示它跟随哪根骨。左侧资产栏选中骨骼时，会同时显示它驱动了哪些部件。</P>
        <H>微调</H>
        <P>绑定后可以在部件标签里调「偏移 X/Y」「缩放」「旋转」，它们都是相对骨骼的。</P>
      </>
    ),
  },
  {
    id: 'assets',
    title: '资产栏',
    body: (
      <>
        <P>画布左上角的浮层列出当前工程的所有关节、骨骼和部件。</P>
        <div className="rounded-inner bg-surface px-3 py-2.5">
          <ROW k="搜索" v="按名称过滤，输入即筛" />
          <ROW k="筛选" v="全部 / 关节 / 骨骼 / 部件" />
          <ROW k="聚焦" v="点任意一项，画布会平移并缩放到它" />
          <ROW k="折叠" v="点左上角箭头收起，画布尺寸不变" />
        </div>
        <H>什么时候用</H>
        <P>部件被别的部件挡住、或者骨骼太密不好点时，从资产栏直接定位最快。</P>
      </>
    ),
  },
  {
    id: 'angle',
    title: '角度限制',
    body: (
      <>
        <P>限制的是「这根骨骼相对父骨骼的角度」，不是世界角度。</P>
        <PanelItem>
          <ROW k="0°" v="与父骨骼同方向，直着伸出去" />
          <ROW k="正角" v="向一侧弯" />
          <ROW k="负角" v="向另一侧弯" />
          <ROW k="上下限相等" v="不限制" />
        </PanelItem>
        <H>怎么定值</H>
        <P>把骨骼摆到想要的两个极限位置，看数值变化；数值小的那个就是下限。</P>
        <H>三种模式</H>
        <div className="space-y-1 text-[13px] leading-6 text-muted">
          <div>· 硬止挡：到边界就停（膝盖、机械关节）</div>
          <div>· 软回弹：越界后被拉回，可短暂超出（头发、披风）</div>
          <div>· 不限：自由摆动（触手、尾巴）</div>
        </div>
        <H>读预览图</H>
        <P>蓝 = 下限姿态，琥珀 = 上限姿态，灰 = 当前姿态，虚线 = 0° 方向。</P>
      </>
    ),
  },
  {
    id: 'physics',
    title: '物理预览',
    body: (
      <>
        <P>预览时属性面板会被禁用，因为预览用的是进入时的快照。</P>
        <div className="space-y-1 text-[13px] leading-6 text-muted">
          <div>· 重力：0 失重 / 1 约 2000 px/s²</div>
          <div>· 拖拽力：数值越大越拽得动</div>
          <div>· 求解迭代：骨架抖动时调高</div>
          <div>· 地面摩擦 / 弹性：只影响与地面的接触</div>
        </div>
      </>
    ),
  },
  {
    id: 'export',
    title: '导出',
    body: (
      <>
        <PanelItem>
          <ROW k="工程 JSON" v="存档或换机器继续编辑，包含骨架、部件与参数" />
          <ROW k="千星 Lua" v="给客户端脚本用，含数据表与 Verlet 求解器" />
        </PanelItem>
        <H>Lua 的主要接口</H>
        <div className="space-y-1 text-[13px] leading-6 text-muted">
          <div>· Rig.Update(dt)：推进一帧</div>
          <div>· Rig.GetFrame()：取关节与骨骼的当前姿态</div>
          <div>· Rig.GetPartTransform(id)：取部件摆放参数</div>
          <div>· Rig.SetPinned(id, v) / Rig.Impulse(id, x, y)</div>
        </div>
      </>
    ),
  },
]

export function TutorialDialog({ open, onClose }: Props) {
  const [active, setActive] = useState(SECTIONS[0].id)
  if (!open) return null

  const current = SECTIONS.find(s => s.id === active) ?? SECTIONS[0]

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex h-[560px] w-[760px] flex-col overflow-hidden rounded-card bg-panel elevation-2"
        onClick={e => e.stopPropagation()}
      >
        <div className="relative flex h-11 shrink-0 items-center justify-between bg-background px-4">
          <span className="absolute left-1/2 -translate-x-1/2 text-[14px] font-medium text-text">教程</span>
          <button
            aria-label="关闭"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-danger-text hover:bg-[var(--red-4)]"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex w-[180px] shrink-0 flex-col gap-1 bg-background p-2">
            {SECTIONS.map(s2 => (
              <button
                key={s2.id}
                onClick={() => setActive(s2.id)}
                className={cn(
                  'h-8 rounded-inner px-2.5 text-left text-[13px] transition-colors',
                  s2.id === active ? 'bg-surface font-medium text-text' : 'bg-surface/50 text-muted hover:bg-surface/80 hover:text-text',
                )}
              >
                {s2.title}
              </button>
            ))}
          </div>

          <div className="min-w-0 flex-1 overflow-y-auto bg-panel px-6 py-4">
            <div className="mb-1 text-[13px] font-medium text-text">{current.title}</div>
            <div className="text-[12px] text-muted">共 {SECTIONS.length} 节</div>
            <div className="mt-3">{current.body}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
