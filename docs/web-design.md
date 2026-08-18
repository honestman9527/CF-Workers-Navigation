# Web 视觉：私人书签柜

产品：一个人每天打开的书签柜。不是公开导航、不是 SaaS 后台。

## Token

| 角色           | 浅色      | 深色      |
| -------------- | --------- | --------- |
| 纸面 paper     | `#e9efe8` | `#10241f` |
| 墨 ink         | `#18332d` | `#e6f0e9` |
| 淡墨 muted     | `#60756d` | `#99b0a5` |
| 线 rule        | `#c9d8cf` | `#2d4a41` |
| 火漆 seal      | `#d65f4a` | `#f17a62` |
| 青釉 verdigris | `#2e7567` | `#79c5ae` |

字体：展示用 `Fraunces`（书签柜标题），正文 `Geist`，网址与计数用 `Geist Mono`。

## 布局

```
┌ login ─────────────────────┐     ┌ header: 印 + 添加 + 菜单 ───────────┐
│           印               │     │ 索引 │ 搜索                         │
│          书签柜             │     │ 标签 │ 常用入口 / 书签卡墙            │
│        [密码] [进入]        │     │      │ 归档 / 回收站                 │
└────────────────────────────┘     └──────┴──────────────────────────────┘
```

签名：左侧标签索引和卡片上的 `#tag` 胶囊，像个人知识档案的索引签。卡片是纸片，不是玻璃拟态。

### 侧边栏（响应式）

同一份标签索引，两种归宿：

- `lg`（≥1024px）及以上：索引栏常驻左侧，按常用入口、归档、回收站和标签分组。
- `lg` 以下：索引栏收进抽屉，从顶栏按钮唤起，选完标签自动收起。

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
