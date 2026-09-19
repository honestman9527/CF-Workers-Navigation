# CF Workers Navigation

部署在 Cloudflare Workers 上的个人书签柜：标签组织书签，启动台首页支持搜索与常用网站，Web 支持公开浏览，私有内容和管理操作需要登录。

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
migrations/     # D1 初始基线迁移
test/           # Worker 集成测试
```

这是单包仓库：根 `package.json` 管理全部依赖和任务，不使用 workspace 或 Turborepo。Worker 与 Web 是同一个部署单元。

## 常用命令

```bash
pnpm dev                 # 构建 Web，并行启动 Wrangler 与前端 watch
pnpm build               # 构建 Web
pnpm build:web           # 仅构建 Web 到 dist/web
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

详细架构、API 和部署说明见 [docs/INDEX.md](./docs/INDEX.md)。
