# 部署

## GitHub Actions

`.github/workflows/deploy.yml` 在 `main` 分支的服务、共享契约、主题、资源、迁移或部署配置变化时触发，也支持手动运行。扩展源码变化不会触发 Worker 部署。

仓库需要配置 Secrets：

```text
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
ADMIN_PASSWORD=
SESSION_SECRET=
```

可选 Variables：

| 变量             | 说明                                             |
| ---------------- | ------------------------------------------------ |
| `NAME`           | Worker 与 D1 名称，默认 `nav`                    |
| `D1_DATABASE_ID` | 已有 D1 ID；为空时 workflow 按 `NAME` 查找或创建 |

workflow 会依次执行依赖安装、类型检查、测试、D1 解析与迁移、Web 构建和 Worker 部署。`.github/scripts/gen-wrangler-ci.mjs` 以根 `wrangler.jsonc` 为唯一配置源，只注入 CI 解析出的 D1 名称和 ID。

## 手动部署

首次部署前创建 D1，并把返回的 `database_id` 写入 `wrangler.jsonc`：

```bash
pnpm exec wrangler d1 create nav
pnpm exec wrangler secret put ADMIN_PASSWORD
pnpm exec wrangler secret put SESSION_SECRET
pnpm db:migrate:remote
pnpm cf-typegen
```

部署：

```bash
pnpm typecheck
pnpm test
pnpm deploy
```

`deploy` 会先构建 Web 到 `dist/web`，再由 Wrangler 部署 Worker 和静态资源。生产环境只应用已提交迁移，不在部署过程中生成迁移。当前 `migrations/0000_empty_deathbird.sql` 是新数据库的完整初始基线；后续结构变化应新增递增 migration，不再重写这份基线。
