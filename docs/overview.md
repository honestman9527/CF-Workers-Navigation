# 概述

CF Workers Navigation 是部署在 Cloudflare Workers + D1 上的私人书签柜：同源 React Web 必须登录才能打开。

分类与标签共同组织书签：分类是可嵌套的粗粒度归属（每个书签一个分类，亦可归为未分类），标签是细粒度标注。首页是启动台（中部搜索框 + 可配置搜索引擎 + 常用网站），侧边栏工作区在 `/workspace` 提供完整浏览与整理。书签支持搜索、分类/标签筛选、置顶、归档、回收站、重复网址检查和导入导出。API 列表与搜索支持游标分页；前台以每页 100 条循环加载全部匹配数据，后台按页码分页。工作区默认展示全部活动书签，侧栏按分类、标签、全部网站组织，全部网站下提供未分类与无标签入口；导航互斥，侧栏内容过长时整体滚动。

Web 分三层界面：启动台首页专注快速打开与搜索；主工作区专注书签浏览与卡片操作；独立的「管理后台」页统一整理分类、标签、搜索引擎与 Favicon 设置（含概览统计）。删除、归档、合并等危险操作均需二次确认。接口契约见 [API](./api.md)。

## 本地开发

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm dev
```

在 `.dev.vars` 中设置 `ADMIN_PASSWORD` 和 `SESSION_SECRET`。浏览器访问 `http://localhost:8787`，先登录再进入书签柜。根 `dev` 命令会先构建 Web，再并行运行 Wrangler 与 Web watch。

## 构建目标

| 目标        | 命令             | 产物                           |
| ----------- | ---------------- | ------------------------------ |
| 同源 Web    | `pnpm build:web` | `dist/web`                     |
| Worker 部署 | `pnpm deploy`    | Cloudflare Worker + Web assets |

源码目录、运行时边界和 TypeScript 配置见 [架构](./architecture.md)，部署前置条件见 [部署](./deployment.md)。
