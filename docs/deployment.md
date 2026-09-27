# 部署与数据库迁移

## 环境要求

- Node.js `>=24`
- pnpm `>=11`
- Cloudflare Workers 和 D1 账户

本地 Worker 使用 Wrangler 开发服务器，默认地址为 `http://localhost:8787`。本地 D1 状态保存在 `.wrangler/state`。

## 本地开发

```powershell
pnpm install
Copy-Item .dev.vars.example .dev.vars
```

在 `.dev.vars` 中设置本地 `ADMIN_PASSWORD` 和 `SESSION_SECRET`，再应用迁移并启动：

```powershell
pnpm db:migrate:local
pnpm dev
```

`pnpm db:migrate:local` 将所有未应用迁移写入本地 D1。`pnpm dev` 会构建 Web 并启动 Wrangler 与 Web 文件监听。

## 首次手动部署

`wrangler.jsonc` 中的 D1 `database_id` 是占位值。首次部署时创建数据库，并把 Wrangler 返回的 ID 写入该配置：

```bash
pnpm exec wrangler d1 create nav
```

配置好数据库后设置 Worker secrets，应用远程迁移，再检查并部署：

```bash
pnpm exec wrangler secret put ADMIN_PASSWORD
pnpm exec wrangler secret put SESSION_SECRET
pnpm db:migrate:remote
pnpm check
pnpm deploy
```

`pnpm deploy` 会先构建 Web，再执行 `wrangler deploy`；它不会自动应用数据库迁移。升级前先备份 D1，再按迁移顺序应用尚未执行的 SQL。不要重写已发布的迁移或通过重置数据库代替升级。

## GitHub Actions 部署

`.github/workflows/ci.yml` 在 push 和 pull request 上运行 `pnpm check`。`.github/workflows/deploy.yml` 在 `main` 分支的 CI 工作流结束且成功后部署，也支持手动触发。

仓库需要配置以下 Actions secrets：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`

以下 Actions variables 可选：

- `NAME`：D1 数据库和 Worker 名称，默认为 `nav`。
- `D1_DATABASE_ID`：现有 D1 数据库 ID。不设置时，工作流按 `NAME` 查找数据库；若不存在则创建。

部署工作流生成临时 Wrangler 配置，应用远程迁移，构建 Web 并部署 Worker 和静态资源。正式部署前应确认 `NAME` 和 `D1_DATABASE_ID` 指向预期生产数据库。

## 静态资源与路由

Web 构建输出为 `dist/web`，通过 Wrangler 的静态资源配置发布并使用 SPA 回退。`/api`、`/api/*` 和 `/health` 先交由 Worker 处理，其他页面和静态资源由 Cloudflare 静态资源路由响应。架构细节见[架构与数据行为](architecture.md)。
