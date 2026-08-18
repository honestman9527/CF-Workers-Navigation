# AGENTS.md

## Project

- pnpm
- Cloudflare Workers + D1 + Hono + Drizzle
- React + Vite + Tailwind CSS
- Chrome MV3 extension
- Lucide icon system

## DO

- 默认使用中文回复，除非用户指定其他语言
- 动手前阅读相关代码与 `docs/INDEX.md`
- 优先复用现有实现，保持最小改动、高内聚和清晰依赖方向
- `src/worker` 与 `src/web` 是同一个部署单元；`src/extension` 是独立分发产物
- 组件库使用`shadcn/ui`，没有适配的再自己实现
- 功能性图标统一使用 `lucide-react`；不得手写 SVG 或混用其他图标库
- 前端样式优先使用 Tailwind 工具类；全局 CSS 只保留 token、关键帧和必要全局规则。

## Don't

- 扩展不得引用 Worker 或 Web 内部源码；跨端契约只进入 `src/shared`
- 主要分支main/master未经确认不得执行 commit、push等操作；
- 其他开发分支可以分阶段执行commit等基本操作，未经许可不得push、合并进主要分支等。
- 不得绕过格式、lint、类型检查和测试
- 涉及前端体验的修改，Playwright不用于自动截图验证，交由人工确认

## Documentation

- 文档位于 `docs/` 下
- 根 `README.md` 面向开发者快速开始
- `docs/INDEX.md` 是详细文档的唯一索引
- 当前行为与必要取舍直接写入对应主题文档
- 新增或移动主题文档后同步更新 `docs/INDEX.md`

## Commands

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm fmt:check
pnpm check
```

Web 本地地址固定为 `http://localhost:8787`，inspector 端口为 `9229`。扩展不提供独立 dev server，使用 `watch:extension`、`build:extension` 或 `bundle:extension`
