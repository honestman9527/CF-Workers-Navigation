# 概述

CF Workers Navigation 是部署在 Cloudflare Workers + D1 上的私人书签柜：同源 React Web 必须登录才能打开，Chrome MV3 扩展继续用密码连接同一套 API。

分类是可嵌套的文件夹。书签落在文件夹里，支持置顶、搜索、导入导出。没有公开浏览，也没有 `isPublic`。

## 本地开发

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm dev
```

在 `.dev.vars` 中设置 `ADMIN_PASSWORD` 和 `SESSION_SECRET`。浏览器访问 `http://localhost:8787`，先登录再进入书签柜。根 `dev` 命令会先构建 Web，再并行运行 Wrangler 与 Web watch。

## 构建目标

| 目标        | 命令                    | 产物                               |
| ----------- | ----------------------- | ---------------------------------- |
| 同源 Web    | `pnpm build:web`        | `dist/web`                         |
| Chrome 扩展 | `pnpm build:extension`  | `dist/extension`                   |
| 扩展分发包  | `pnpm bundle:extension` | `dist/nav-extension-<version>.zip` |
| Worker 部署 | `pnpm deploy`           | Cloudflare Worker + Web assets     |

源码目录、运行时边界和 TypeScript 配置见 [架构](./architecture.md)，部署前置条件见 [部署](./deployment.md)，重构阶段见 [重构计划](./REFACTOR_PLAN.md)。
