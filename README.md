# CF Workers Navigation

部署在 Cloudflare Workers 上的私人书签柜：文件夹树收纳书签，Web 必须登录，Chrome 扩展沿用原设计。

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

在 `.dev.vars` 中设置 `ADMIN_PASSWORD` 和 `SESSION_SECRET`，打开 `http://localhost:8787` 后先登录。

## 目录

```text
src/
├── worker/     # Hono Worker、D1 与 Drizzle
├── web/        # 同源 React Web
├── extension/  # Chrome MV3 扩展
└── shared/     # 三端共用的 API 与偏好契约
public/         # Web 与扩展共用的静态资源
migrations/     # D1 初始基线迁移
test/           # Worker 集成测试
```

这是单包仓库：根 `package.json` 管理全部依赖和任务，不使用 workspace 或 Turborepo。Worker 与 Web 是同一个部署单元；扩展只通过 HTTP API 与 Worker 通信。

## 常用命令

```bash
pnpm dev                 # 构建 Web，并行启动 Wrangler 与前端 watch
pnpm build               # 构建 Web 和 Chrome 扩展
pnpm build:web           # 仅构建 Web 到 dist/web
pnpm build:extension     # 仅构建扩展到 dist/extension
pnpm watch:extension     # 持续构建扩展
pnpm bundle:extension    # 生成扩展 zip
pnpm typecheck           # 类型检查全部源码
pnpm test                # 运行单元测试与 Worker 集成测试
pnpm check               # 完整质量检查与性能预算
```

数据库与部署命令：

```bash
pnpm db:migrate:local
pnpm db:migrate:remote
pnpm cf-typegen
pnpm deploy
```

扩展构建后，从 Chrome 加载 `dist/extension/`；`bundle:extension` 会生成 `dist/nav-extension-<version>.zip`。

详细架构、API 和部署说明见 [docs/INDEX.md](./docs/INDEX.md)。
