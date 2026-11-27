---
version: 2.0
name: Slate-Frosted-Navigation
description: 温润中性 Slate 基底 + 低饱和现代主色（4 套可选主题色）+ 轻磨砂浮层的前后台统一视觉规范。强调整洁排版层级、清晰边界对齐、高对比度文字与克制微交互。
---

# 视觉设计规范（DESIGN.md）

本项目采用**「温润中性 Slate 基底 + 低饱和现代主色 + 轻磨砂浮层」**视觉体系，前后台共享同一套语义 CSS Token、圆角阶梯、边框透明度、柔和阴影与焦点环规则，源码落位于 [src/web/styles.css](src/web/styles.css) 与 [src/web/index.html](src/web/index.html)。

## 配色与表面体系

### 基础表面与文字（Light / `.dark`）

| 语义 Token                | Light                       | Dark (`.dark`)              | 用途                                                     |
| ------------------------- | --------------------------- | --------------------------- | -------------------------------------------------------- |
| `--background`            | `#f8fafc`                   | `#0b0f19`                   | 页面主背景画布                                           |
| `--card`                  | `rgba(255, 255, 255, 0.88)` | `rgba(17, 24, 39, 0.82)`    | 轻磨砂主卡片与容器（配合 `backdrop-filter: blur(16px)`） |
| `--popover`               | `rgba(255, 255, 255, 0.94)` | `rgba(17, 24, 39, 0.94)`    | 弹窗、抽屉、命令面板、下拉菜单等高优先级浮层             |
| `--secondary` / `--muted` | `#f1f5f9`                   | `#111827`                   | 分段控件底槽、次要芯片与列表表头底色                     |
| `--foreground`            | `#0f172a`                   | `#f8fafc`                   | 标题与主要正文（与画布对比度 > 17:1）                    |
| `--muted-foreground`      | `#475569`                   | `#94a3b8`                   | 次要说明、域名、计数与辅助文案（对比度 > 7:1）           |
| `--border`                | `rgba(148, 163, 184, 0.24)` | `rgba(148, 163, 184, 0.14)` | 1px 细腻结构分隔与控件边界                               |
| `--border-strong`         | `rgba(148, 163, 184, 0.42)` | `rgba(148, 163, 184, 0.28)` | 悬停态与强调边界                                         |
| `--destructive`           | `#dc2626`                   | `#f87171`                   | 删除、报错与危险操作                                     |

### 4 套主题主色（`<html data-palette="indigo|emerald|amber|rose">`）

默认主题色为 `indigo`，由 `src/web/index.html` 内联脚本在首屏渲染前从 `localStorage` 同步恢复，避免闪烁。

| `data-palette`   | 名称     | Light `--primary` / `--primary-hover` | Light `--primary-foreground` | Dark `--primary` / `--primary-hover` | Dark `--primary-foreground` |
| ---------------- | -------- | ------------------------------------- | ---------------------------- | ------------------------------------ | --------------------------- |
| `indigo`（默认） | 靛蓝晴空 | `#4f46e5` / `#4338ca`                 | `#ffffff`                    | `#818cf8` / `#6366f1`                | `#0b0f19`                   |
| `emerald`        | 翡翠森语 | `#059669` / `#047857`                 | `#ffffff`                    | `#34d399` / `#10b981`                | `#0b0f19`                   |
| `amber`          | 暖珀微光 | `#d97706` / `#b45309`                 | `#ffffff`                    | `#fbbf24` / `#f59e0b`                | `#0b0f19`                   |
| `rose`           | 玫瑰暮霞 | `#e11d48` / `#be123c`                 | `#ffffff`                    | `#fb7185` / `#f43f5e`                | `#0b0f19`                   |

- 暗色模式实心主色按钮统一使用深色文字 `#0b0f19`，常态与悬停态均满足 WCAG AA（≥ 4.5:1）对比度。
- `--accent` 与 `--sidebar-accent` 基于当前主色按 `10%`（Light）/ `16%`（Dark）混合派生，保证导航选中态、命令面板高亮与标签徽章在 4 套配色下协调一致。

### 自定义背景图可读性保护

- 启用背景图片时，`<html class="has-background">` 固定平铺 `--bg-image`，并通过固定定位的 `html.has-background::before` 渲染保护遮罩层：
  - 遮罩底色随明暗模式切换（`--bg-overlay-rgb: 248 250 252` / `11 15 25`）；
  - 浓度由 `--bg-overlay-opacity` 控制（默认 `0.72`，支持用户在外观面板调节 `25%–95%`，持久化至 `nav-bg-overlay-opacity`）；
  - 同步施加 `backdrop-filter: blur(12px)` 背景模糊，叠加卡片层的 `blur(16px)` 轻磨砂表面，确保任意壁纸下卡片文字与微章满足 WCAG AA 可读性。

## 形状、层次与微交互

- **统一圆角阶梯**：容器与浮层弹窗统一 `rounded-2xl`（16px），按钮、输入框与导航项统一 `rounded-xl`（12px），内部微章与紧凑按钮统一 `rounded-lg` / `rounded-md`。
- **层次与阴影**：常规面板使用轻磨砂底色 + 1px `--border` + 柔和 `--shadow-soft`；悬浮弹窗与命令面板使用 `--popover` + `shadow-xl` / `shadow-2xl`。
- **克制微交互与现代过渡**：
  - 书签卡片与概览快捷入口采用独立变换 `translate: 0 0` 基态，桌面悬停时以物理 `linear()` 弹簧曲线轻抬 `2px` 并强化边框与阴影；前台书签卡片额外提供指针跟随径向微光（仅 `@media (hover: hover)`）与图标轻倾缩放（`.bookmark-card-icon`），并按优先原生 `sibling-index()`（不支持时回退至行内 `--sibling-index`）交错弹性入场（`.card-stagger-enter`）。
  - 常用星标切换触发弹簧微旋（`.star-pop`），动态出现的搜索清除按钮通过 `@starting-style` 弹入（`.control-enter`），按钮按下轻缩 `motion-safe:active:scale-[0.98]`。
  - 明暗切换支持原生 View Transitions 从触发按钮中心展开圆形光圈波纹（`vt-theme-ripple`），视图密度/搜索模式切换与跨页跳转支持温和淡入淡出（`viewTransition: true`）；首页与后台顶部配有纯 CSS 滚动驱动进度丝带（`.scroll-progress-bar`，基于 `animation-timeline: scroll(root block)`）。
  - 前后台弹窗、抽屉、下拉菜单与 Tooltip 统一采用合成层 `opacity`/`scale`/`translate` 双向过渡（基于 Base UI `data-starting-style`/`data-ending-style` 与原生 `@starting-style`，配合 `linear()` 弹性曲线及 `ease-out` 回退）；后台设置 Tabs 使用 Base UI `Tabs.Indicator` 跟随 `--active-tab-*` 弹性滑动；原生 `<details>` 渐进支持 `::details-content` + `interpolate-size: allow-keywords` 平滑展开。
  - **减少动态偏好**：在 `prefers-reduced-motion: reduce` 下禁用 `::view-transition-*` 动画、卡片位移/微光与进度丝带，抑制浮层位移缩放仅保留短促透明度淡入淡出，所有 `animate-spin`/`animate-pulse` 使用 `motion-safe:` 守卫，并放慢不定态 `<progress>` 进度动画。
- **前后台统一侧边栏折叠与底部工具栏**：前后台桌面左侧边栏统一采用 `264px` 展开态 ↔ `72px` 紧凑图标栏（Icon Rail，配合 Tooltip、头部折叠按钮与 `Cmd/Ctrl + B`），共享轻磨砂 `glass-surface` 材质；折叠为 `72px` 图标栏时，左上角将品牌 `BrandIcon` 与展开按钮合二为一（桌面端悬停或键盘聚焦显现展开图标，触控设备显示右下角极小角标），复用同一焦点节点；前后台展开态及移动抽屉底部统一收束为单行无边框轻量工具栏（左侧入口「后台 / 登录 / 前台」，右侧统一「主题 / 4 套主题色」菜单 + 退出图标），折叠态统一为竖排居中 `44px` 图标按钮，移除前台重复的视图密度与遮罩浓度开关（分别保留在主工作区/⌘K 与后台设置）。前台书签网格采用 CSS 容器查询（`@container`）而非视口宽度决定列数，折叠侧边栏释放宽度后自动增加列数。
- **桌面悬停操作胶囊与触控热区**：桌面端书签管理操作（置顶/编辑/移入回收站）仅在真实悬停指针设备（`@media (hover: hover)`）下启用 `absolute top-2.5 right-2.5` 磨砂悬浮胶囊；触控屏与平板设备常显操作条，并在粗指针环境（`pointer: coarse`）下统一保证交互热区不小于 `44px`（`min-h-11`）。
- **无障碍、高对比度与滚动条**：同步 `<meta name="color-scheme">` 与 `:root { color-scheme: light dark; }`（CSS `:has()` 跟随覆盖），文本选区使用 `color-mix(in oklab, ...)`；页面主滚屏保留系统标准 `scrollbar-width`，侧边栏与弹窗/下拉列表采用柔和半透明 Slate 滑块（对比度 ≥ 3:1，桌面静息隐身、悬停/聚焦显现，72px 图标栏隐藏滑块并配合滚动驱动边缘渐变），直出式横向标签筛选条采用无滚动条设计配合滚动驱动/IntersectionObserver 边缘渐隐提示（`.scroll-edge-fade-x`）与内嵌键盘焦点环（`-outline-offset: -2px`），弹窗滚动区内置于 `rounded-2xl` 裁切框内并配滚动阴影提示，在 `prefers-contrast: more` 下常显高对比度滑块与轨道（含横向标签条滚动条恢复）；在 `forced-colors: active`（Windows 高对比度）下保留明确 `:focus-visible` 轮廓、标签筛选芯片 `Highlight`/`HighlightText` 选中态与主题色色卡真实颜色（`forced-color-adjust: none`）。

## 本项目组件与状态规则

- 技术与边界约束见根 [AGENTS.md](AGENTS.md#工作约束)：前台使用 Base UI 无样式原语自持组件，管理后台使用 `shadcn/ui`，前后台共享同一套 CSS Token 与视觉配方，不跨边界导入组件代码。
- 功能性图标统一使用 `lucide-react`，禁止手写 SVG 或混用其他图标库；私有分类与私有书签统一使用 `LockKeyhole` 图标及醒目「私有」微章。
- 键盘焦点通过 `:focus-visible` 与 `focus-visible:ring-2 focus-visible:ring-ring/45` 清晰可见；弹出菜单、抽屉与命令面板关闭后恢复触发点焦点。
- 首页一级分类内部以二级标题与组间留白组织书签网格，保持单个外层轻磨砂面板；二级标题不作为切换按钮，空二级保留标题与提示。支持「舒适卡片」与「紧凑网格」双视图密度切换。
- 视觉验收范围见 [视觉确认清单](docs/usage.md#视觉确认)，验证标准见根 [AGENTS.md](AGENTS.md#风险匹配验证)。
