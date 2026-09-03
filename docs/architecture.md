# 架构

## 目录与职责

```text
src/
├── worker/     # Hono API、登录会话、Drizzle、元数据与导入导出
│   ├── routes/     # 薄路由：解析参数与 body、zod 校验、把结果与错误映射为 HTTP 响应
│   ├── services/   # 业务逻辑与数据访问：书签、标签、分类、管理概览、导入导出
│   └── transfer/   # 导入导出格式的探测、解析与序列化
├── web/        # 必须登录的 React 书签柜，通过同源 /api/v1/* 访问 Worker
│   ├── features/   # 业务模块按功能聚合：auth、bookmarks、admin、layout、workspace 等
│   ├── components/ # 功能无关的通用组件；ui/ 是项目本地 shadcn/base-nova 组件
│   ├── pages/      # 整页入口（登录页）
│   └── hooks/ lib/ api/ utils/   # 跨功能复用的基础代码
└── shared/     # API DTO、端点、fetch client、错误与偏好契约
public/icons/   # Web 图标
migrations/     # D1 初始基线迁移
```

仓库只有一个根 `package.json` 和一套依赖。目录表示运行时与源码边界，不是 workspace。

Worker 内部按「薄路由 + 服务」分层：`routes/` 只做 HTTP 层工作——解析参数与 body、zod 校验、把服务结果与错误映射为 JSON 响应；业务逻辑与数据访问在 `services/`，导入导出格式的探测、解析与序列化在 `transfer/`。路由不直接触碰数据库。

每个 API 请求只创建一次 Drizzle 客户端并通过 Hono 上下文传给路由和服务。书签列表、状态、标签、置顶和搜索都在 D1 中筛选与分页；查询用 SQL 聚合标签，避免先取书签再逐条读取关联。写入批量复用标签，导入按块插入或更新，减少 D1 往返。

书签按 `created_at + id` 使用不透明游标分页；全文搜索按 FTS5 `rank + id` 分页。数据库保留 `bookmarks`、`categories`、`tags`、`bookmark_tags`、`settings` 和 FTS5 结构；分类是一棵通过 `parent_id` 自引用的树，书签经 `category_id` 归属单个分类（删除分类时书签变为未分类、不误删书签），不做手动排序字段。

API 资源以 `/api/v1/*` 下的独立路由表达：`bookmarks`、`categories`、`tags`（标签 CRUD 与合并）、`admin/stats`（管理后台概览）、`settings`、`transfer`；`/bookmarks/tags` 保留为标签列表的过时别名。标签合并与删除直接操作 `bookmark_tags` 关联，不引入新表或迁移。

Web 内部按功能而非按层组织：业务模块以 `src/web/features/<功能>` 聚合，界面与状态随功能走；只有被多个功能复用的基础代码才提升到 `components/ui`、`hooks`、`lib`、`api`、`utils`，不为潜在复用新增顶层模块。

Web 用 TanStack Router（code-based 配置，不引入代码生成插件）以路由驱动模块视图：启动台首页在 `/`，工作区筛选（视图/分类/标签/搜索/置顶）与登录态、管理后台路径全部编码进 URL，`src/web/routes/` 只做路由声明（含 `validateSearch`、`beforeLoad` 认证守卫），业务组件仍在 `features/`。启动台（`/`）是默认首页：中部搜索框（可配置搜索引擎）+ 常用网站瓦片；原侧边栏工作区在 `/workspace`，两种布局经顶栏从页面自由切换。书签柜无筛选的裸 `/workspace` 会在分类加载后以 `replace` 补写默认分类（本地记忆 → 第一个根分类 → 未分类），不再有「全部网站」落地视图，URL 始终反映当前位置。管理后台 `/admin` 是侧边栏式布局（shadcn Sidebar 原语，桌面常驻浮动栏 + 移动端抽屉），其 tab（概览/网站/分类/标签/设置/导入导出）是独立懒加载 chunk；工作区内的添加/编辑表单与危险操作确认仍是本地瞬态对话框、不进路由。认证状态经 router context 注入，未登录访问受保护路由由守卫重定向到 `/login`，退出或 401 过期由 `App` 统一回登录页。

Web 状态管理分层：跨页共享状态（主题、服务端设置）用 jotai 原子缓存（`src/web/features/settings/store.ts`），主题持久化到 localStorage 并自动迁移旧 key，设置首次请求后全局复用、不再逐页重复 `GET /settings`；页面自有资源用 `src/web/hooks/useApiData` 收敛「挂载取数 + loading/error + 401」样板；后台写操作统一经 `useAdminRun`，书签写操作与危险二次确认统一经 `useBookmarkMutations` + `ConfirmStateDialog`，工作区与「网站管理」共用。

## 依赖方向

```text
src/shared  <-  src/worker
     ^          src/web

Web 维护自己的 CSS，`src/shared` 仅保存 Web 与 Worker 共用契约。
```

数据库模型以 `src/worker/schema.ts` 为源，不能进入共享契约；Worker 负责把数据库行转换为 DTO。

Web 的 React 基础组件是**项目内本地化**的 shadcn/base-nova 组件：`components.json` 的 style 为 `base-nova`，原语层用 `@base-ui/react`（Base UI）、图标用 lucide-react；组件以源码形式随仓库维护在 `src/web/components/ui`，不是从 npm 安装的组件包，新增按 shadcn CLI 惯例落到该目录。Web 只在必要时用 `src/web/components` 做薄封装，业务界面按功能放在 `src/web/features/*`。

## TypeScript 配置

根目录的多个 `tsconfig` 是按运行时隔离的编译入口，不是重复项目：

| 文件                   | 作用                                                                   |
| ---------------------- | ---------------------------------------------------------------------- |
| `tsconfig.base.json`   | 所有入口共用的严格模式、模块解析和跨端别名                             |
| `tsconfig.json`        | solution 配置，声明三个子项目引用及供 shadcn CLI 解析的 Web 路径别名   |
| `tsconfig.shared.json` | `src/shared` 和单元测试配置，使用 Node/Vitest 类型                     |
| `tsconfig.worker.json` | Worker、D1 配置和 Worker 测试，使用 Cloudflare Worker 类型且不加载 DOM |
| `tsconfig.web.json`    | Web React 入口，使用 DOM、Vite 和 `@nav` 路径别名                      |

Worker 的绑定类型以 `src/worker/env.d.ts` 中的最小声明参与日常类型检查；`worker-configuration.d.ts` 是 Wrangler 生成的运行时类型，已加入 `.gitignore`，需要时通过 `pnpm cf-typegen`（部署或配置变更后）重新生成，不纳入版本控制。

Worker 不能混入 DOM，因此保留这些小配置比合并成一个会污染类型环境的“大配置”更清晰。公共编译选项只放在 `tsconfig.base.json`，子配置只声明运行时差异。根 solution 的 `@/*` 映射仅供 shadcn CLI 与编辑器定位 `src/web`，不会被引用的子项目继承。

## 构建与运行

- `vite.web.config.ts` 以 `src/web` 为入口，构建到 `dist/web`。
- `wrangler.jsonc` 将 `dist/web` 作为 ASSETS，由 Worker 同源提供 Web 和 `/api/v1/*`；未版本化的 `/api/*` 不挂载业务路由并返回 404。
- Web 构建启用 React Compiler；业务代码不需要为普通派生值手工堆叠 `memo`、`useMemo` 或 `useCallback`。
- Web 用 HttpOnly session cookie 登录，并通过同源请求访问 API。

Web 首屏（启动台）只请求设置（搜索引擎）与置顶书签（上限 100）；工作区按当前筛选（默认分类等）一次取完全部匹配书签（游标循环，单页 100 条）并加载标签；添加/编辑表单按需加载，管理后台整体及每个 tab（含导入导出）都是独立路由 chunk，进入对应页面时才加载。

`pnpm dev` 先生成 `dist/web`，再并行启动 Wrangler 和 Web watch。
