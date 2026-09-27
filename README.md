# CF Workers Navigation

部署在 Cloudflare Workers + D1 上的个人书签柜。同源 React Web 可免登录浏览公开内容；私有内容和管理操作需要管理员登录。

## 功能

- 分类树提供单一归属，标签提供多维标注；书签支持搜索、置顶、归档、回收站和重复网址检查。
- `/launch` 启动台提供可配置搜索引擎与常用网站；`/workspace` 提供分类、标签和无标签筛选，以及网格和列表视图。
- `/admin` 集中管理网站、分类、标签、设置及 JSON/HTML 导入导出；删除、归档、合并等操作有二次确认。
- 书签 API 支持游标和 `offset + total` 两种分页；启动台首批展示并按需加载后续结果，工作区和管理后台按页码浏览。

## 要求

- Node.js `>=24`
- pnpm `>=11`

## 快速开始

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm dev
```

在 `.dev.vars` 中设置 `ADMIN_PASSWORD` 和 `SESSION_SECRET`，打开 `http://localhost:8787` 后可直接浏览公开内容，登录后管理。

## 目录

```text
src/
├── worker/     # Hono Worker、D1 与 Drizzle
├── web/        # 同源 React Web
└── shared/     # Web 与 Worker 共用的 API 与偏好契约
public/         # Web 静态资源
migrations/     # D1 基线与递增迁移
test/           # Worker 集成测试
```

这是单包仓库：根 `package.json` 管理全部依赖和任务，`pnpm-workspace.yaml` 仅保存 pnpm 的安装脚本策略。Worker 与 Web 是同一个部署单元。

## 常用命令

```bash
pnpm dev                 # 构建 Web，并行启动 Wrangler 与前端 watch
pnpm build               # 构建 Web 到 dist/web
pnpm lint                # 静态检查
pnpm fmt:check           # 格式检查
pnpm typecheck           # 类型检查全部源码
pnpm test                # 运行单元测试与 Worker 集成测试
pnpm check               # 依次运行格式、lint、类型与测试检查
```

数据库与部署命令：

```bash
pnpm db:migrate:local
pnpm db:migrate:remote
pnpm cf-typegen
pnpm deploy
```

## 架构与路由

`src/worker` 通过 Hono 提供 `/api/v1/*` 与 `/health`。`wrangler.jsonc` 将 `dist/web` 设为同源静态资源并启用 SPA 回退；只有 `/api`、`/api/*` 和 `/health` 优先进入 Worker。`/` 按本地前台偏好转到 `/launch` 或 `/workspace`，管理后台位于 `/admin`。静态资源路由与 API 路由由 Cloudflare 分别处理。

Worker 的路由只处理参数校验与 HTTP 响应，`services/` 负责业务与 D1 访问，`transfer/` 负责备份格式。跨端 DTO、端点和客户端契约位于 `src/shared`；数据库模型只在 `src/worker/schema.ts`。Web 按功能组织在 `src/web/features`，使用本地 shadcn/Base UI 组件、Tailwind 语义 token 和 lucide-react 图标。Worker、Web、shared 分别使用对应的 TypeScript 配置，避免混入不同运行时类型。

当前数据库结构由 `migrations/0000_baseline.sql`、`0001_adorable_apocalypse.sql`、`0002_lucky_pretty_boy.sql` 依次形成，包含书签、分类树、标签关联、设置和 FTS5。分类树通过 `parent_id` 建立，书签只归属一个分类；删除分类会保留书签。书签列表按 `created_at + id` 游标排序，搜索按 FTS5 `rank + id` 排序；携带 `offset` 时返回 `total` 供页码分页。计数查询只使用筛选所需的表，不聚合标签。

## API 与权限

所有业务接口使用 `/api/v1` 前缀。公开 GET 包括活动书签列表与搜索、可见书签详情、分类、标签和 `/settings/public`；写入、管理统计、完整设置、元数据及导入导出需要登录。Web 使用 HttpOnly session cookie，也支持管理员 Bearer 认证。未版本化 `/api/*` 不提供业务路由。

| 资源 | 主要接口                                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------------------- |
| 书签 | `GET/POST /bookmarks`、`GET/PUT/DELETE /bookmarks/:id`、`GET /bookmarks/search`、归档/恢复/永久删除              |
| 分类 | `GET/POST /categories`、`PUT/DELETE /categories/:id`、`POST /categories/reorder`                                 |
| 标签 | `GET/POST /tags`、`PUT/DELETE /tags/:id`、`POST /tags/:id/merge`                                                 |
| 认证 | `POST /auth/login`、`POST /auth/logout`、`GET /auth/me`                                                          |
| 其他 | `GET /admin/stats`、`GET/PUT /settings`、`GET /settings/public`、`GET /transfer/export`、`POST /transfer/import` |

书签列表与搜索支持 `view`、`category`、`tag`、`untagged`、`pinned`、`limit`、`cursor`、`offset`。`category` 包含子树，`uncategorized` 仅筛未分类；`untagged` 与分类条件独立。`limit` 为 1–100，默认 24；传 `offset` 时返回 `total` 且 `nextCursor` 为 `null`，不传时返回不透明游标。工作区的 URL 保留分类、标签、无标签、搜索词、页码和每页条数；旧 `pinned` 工作区链接不再作为筛选入口，置顶筛选仍可通过书签 API 和管理后台使用。标签列表统一由 `/api/v1/tags` 提供。

显式权限为 `public` 或 `private`。任一祖先分类私有时，后代和其中书签实际私有；游客看不到私有内容、计数或标签。旧数据迁移为私有，新建默认公开，默认值可在设置中调整。移出私有分类或删除分类时保留原有私有保护。所有 API 响应禁止共享缓存；`GET /health` 返回 `{ "ok": true }`。

## 导入与导出

管理员可导出 JSON v2 完整备份或 HTML 浏览器书签。Web 下载前调用 `/transfer/export/prepare` 检查权限与数据库，然后由 Worker 分批读取并流式发送，浏览器直接下载；HTML 保留分类层级但不保留标签和权限。JSON v2 保存分类、标签和显式权限；旧 JSON v1 与无版本书签备份仍可读取，缺少权限的新记录默认私有。旧嵌套分类树格式不支持。导入按块写书签和标签关联，支持 `skip`、`create`、`update` 策略；导入文件上限 10 MB。导出包含管理员可见的私有内容，备份文件请妥善保存。

## 部署

手动首次部署时，先创建 D1 并把返回的 `database_id` 写入 `wrangler.jsonc`，然后设置 `ADMIN_PASSWORD` 与 `SESSION_SECRET` 两个 Worker secret，应用迁移并部署：

```bash
pnpm exec wrangler d1 create nav
pnpm exec wrangler secret put ADMIN_PASSWORD
pnpm exec wrangler secret put SESSION_SECRET
pnpm db:migrate:remote
pnpm check
pnpm deploy
```

升级已有数据库前先备份，并核对 D1 迁移日志；只应用尚未执行且与现有结构兼容的递增迁移。不要重写已发布的迁移或清空旧数据。GitHub Actions 在 `main` 的 CI 成功后部署，也支持手动运行；需设置 `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`、`ADMIN_PASSWORD`、`SESSION_SECRET`，可选 `NAME` 与 `D1_DATABASE_ID`。生产部署由同一次流程构建 Web 并发布 Worker 与静态资源。

## 界面与验证

启动台 `/launch` 首批展示置顶网站和搜索结果，用户可继续加载；输入框支持 bang 搜索、URL 直达和 ↑↓/Enter 键盘选择。工作区 `/workspace` 提供分类、标签、未分类、无标签筛选，默认每页 24 条，可选 48/96，网格/列表偏好保存在浏览器。管理后台提供网站、分类、标签、设置和数据操作；危险操作需要二次确认。桌面与移动端体验变更由人工检查，不使用 Playwright 自动截图。

仓库用 `.gitattributes` 固定文本文件 LF 换行符，使 Windows 与 Linux 检出均可运行 `pnpm check`。
