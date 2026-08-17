# Web 视觉：私人书签柜

产品：一个人每天打开的书签柜。不是公开导航、不是 SaaS 后台。

## Token

| 角色       | 浅色      | 深色      |
| ---------- | --------- | --------- |
| 纸面 paper | `#f4efe4` | `#161410` |
| 墨 ink     | `#1c1914` | `#ece7dc` |
| 淡墨 muted | `#6f675c` | `#a39a8c` |
| 线 rule    | `#d8d0c2` | `#3a342c` |
| 火漆 seal  | `#8f2d2a` | `#d46a62` |
| 铜 rust    | `#b86a2a` | `#e0a15a` |

字体：展示用 `Fraunces`（文件夹名、登录标题），正文 `Source Serif 4`，数据/URL 用 `IBM Plex Mono`。

## 布局

```
┌ login ─────────────────────┐     ┌ header: 印 + 搜索 + 菜单 ──────────┐
│           印               │     │ folder │  面包屑                    │
│        私人书签柜           │     │ 树     │  书签卡墙                   │
│        [密码] [进入]        │     │        │                            │
└────────────────────────────┘     └────────┴────────────────────────────┘
```

签名：左侧文件夹索引上的火漆细轨——当前文件夹旁亮起一截 2px 的火漆竖条。卡片是纸片，不是玻璃拟态。

### 侧边栏（响应式）

同一份文件夹索引，两种归宿：

- `lg`（≥1024px）及以上：索引栏常驻左侧，与顶栏品牌区同宽对齐，独立滚动；选中文件夹时火漆轨亮起。
- `lg` 以下：索引栏收进抽屉——从左侧滑入、覆盖内容，点遮罩或向左拖拽关闭；由顶栏「打开分类」按钮唤起，选完文件夹自动收起。

## 组件组合

界面不手写临时 markup，一律从项目内本地化的 shadcn/base-nova 组件（`src/web/components/ui`）组合：

- 骨架与导航：Sidebar 系（侧边栏索引、导航结构），配合 AppShell 工作台壳。
- 覆盖层：Dialog、AlertDialog；覆盖层必须带标题，视觉隐藏用 `sr-only`。
- 内容块：Card 系，按 CardHeader / CardTitle / CardContent / CardFooter 完整组合。
- 表单：Field 组合（Field + FieldLabel + Input / Select / Textarea / Checkbox），校验用 `data-invalid` + `aria-invalid`。
- 反馈与点缀：toast、Skeleton、Empty、Badge、Separator、Tooltip、DropdownMenu 等，不复刻样式。
- 图标只用 lucide-react，按钮内图标走 `data-icon`，不写尺寸类。

以上是组合惯例：具体以 `src/web/components/ui` 中已安装的组件为准，缺的组件按需补装进同一目录，而不是手写自定义结构替代。配色只走语义 token（paper/ink/rule 落到 background/foreground/border，seal/rust 落到 primary 等），组件不写死 hex，也不做手写 `dark:` 覆盖。

## 不做什么

不套奶油底+衬线模板的大数字 hero；不套黑底酸绿；扩展页面不套这套皮肤。
