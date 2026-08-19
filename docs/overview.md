# 概述

CF Workers Navigation 是部署在 Cloudflare Workers + D1 上的私人书签柜：同源 React Web 必须登录才能打开，Chrome MV3 扩展继续用密码连接同一套 API。

标签是唯一组织方式。首页展示常用入口，书签支持搜索、标签筛选、归档、回收站、重复网址检查和导入导出。列表与搜索按游标分页，不在浏览器或 Worker 中加载全量数据。

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

源码目录、运行时边界和 TypeScript 配置见 [架构](./architecture.md)，部署前置条件见 [部署](./deployment.md)。
