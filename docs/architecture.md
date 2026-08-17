# 架构

## 目录与职责

```text
src/
├── worker/     # Hono API、登录会话、Drizzle、元数据与导入导出
│   ├── routes/     # 薄路由：解析参数与 body、zod 校验、把结果与错误映射为 HTTP 响应
│   ├── services/   # 业务逻辑与数据访问：书签、文件夹、导入导出
│   └── transfer/   # 导入导出格式的探测、解析与序列化
├── web/        # 必须登录的 React 书签柜，通过同源 /api/* 访问 Worker
│   ├── features/   # 业务模块按功能聚合：auth、bookmarks、categories、layout 等
│   ├── components/ # 功能无关的通用组件；ui/ 是项目本地 shadcn/base-nova 组件
│   ├── pages/      # 整页入口（登录页）
│   └── hooks/ lib/ api/ utils/   # 跨功能复用的基础代码
├── extension/  # Chrome MV3 新标签页、popup、选项页与后台脚本
└── shared/     # API DTO、端点、fetch client、错误与偏好契约
public/icons/   # 两个 Vite 构建目标共用的图标
migrations/     # D1 初始基线迁移
```

仓库只有一个根 `package.json` 和一套依赖。目录表示运行时与源码边界，不是 workspace。

Worker 内部按「薄路由 + 服务」分层：`routes/` 只做 HTTP 层工作——解析参数与 body、zod 校验、把服务结果与错误映射为 JSON 响应；业务逻辑与数据访问在 `services/`，导入导出格式的探测、解析与序列化在 `transfer/`。路由不直接触碰数据库。

Web 内部按功能而非按层组织：业务模块以 `src/web/features/<功能>` 聚合，界面与状态随功能走；只有被多个功能复用的基础代码才提升到 `components/ui`、`hooks`、`lib`、`api`、`utils`，不为潜在复用新增顶层模块。

## 依赖方向

```text
src/shared  <-  src/worker
     ^          src/web
     └--------- src/extension

CSS 由 Web 与扩展各自维护，跨端只共享 `Theme` 偏好契约。
```

扩展不得引用 `src/worker` 或 `src/web`。数据库模型以 `src/worker/schema.ts` 为源，不能进入共享契约；Worker 负责把数据库行转换为 DTO。

Web 的 React 基础组件是**项目内本地化**的 shadcn/base-nova 组件：`components.json` 的 style 为 `base-nova`，原语层用 `@base-ui/react`（Base UI）、图标用 lucide-react；组件以源码形式随仓库维护在 `src/web/components/ui`，不是从 npm 安装的组件包，新增按 shadcn CLI 惯例落到该目录。Web 只在必要时用 `src/web/components` 做薄封装，业务界面按功能放在 `src/web/features/*`。Web 与扩展分别维护自己的 CSS，扩展不复用 Web 的组件与样式；`src/shared` 只保存跨端类型、API 与偏好契约。

## TypeScript 配置

根目录的多个 `tsconfig` 是按运行时隔离的编译入口，不是重复项目：

| 文件                      | 作用                                                                   |
| ------------------------- | ---------------------------------------------------------------------- |
| `tsconfig.base.json`      | 所有入口共用的严格模式、模块解析和跨端别名                             |
| `tsconfig.json`           | solution 配置，声明四个子项目引用及供 shadcn CLI 解析的 Web 路径别名   |
| `tsconfig.shared.json`    | `src/shared` 和单元测试配置，使用 Node/Vitest 类型                     |
| `tsconfig.worker.json`    | Worker、D1 配置和 Worker 测试，使用 Cloudflare Worker 类型且不加载 DOM |
| `tsconfig.web.json`       | Web React 入口，使用 DOM、Vite 和 `@nav` 路径别名                      |
| `tsconfig.extension.json` | Chrome 扩展 React 入口，使用 DOM、Chrome 和 `@ext` 路径别名            |

Worker 不能混入 DOM，扩展不能混入 Worker 类型，Web 与扩展还需要不同的路径别名；因此保留这些小配置比合并成一个会污染类型环境的“大配置”更清晰。公共编译选项只放在 `tsconfig.base.json`，子配置只声明运行时差异。根 solution 的 `@/*` 映射仅供 shadcn CLI 与编辑器定位 `src/web`，不会被引用的子项目继承。

## 构建与运行

- `vite.web.config.ts` 以 `src/web` 为入口，构建到 `dist/web`。
- `wrangler.jsonc` 将 `dist/web` 作为 ASSETS，由 Worker 同源提供 Web 和 `/api/*`。
- `vite.extension.config.ts` 以 `src/extension` 为入口，构建到 `dist/extension`。
- Web 用 HttpOnly session cookie 登录；扩展配置与管理员密码保存在 Chrome storage，请求带 Bearer。
- Web 通过同源请求访问 API；扩展通过配置的 Worker origin 跨源访问相同 API。

`pnpm dev` 先生成 `dist/web`，再并行启动 Wrangler 和 Web watch。扩展不进入该开发进程，使用 `pnpm watch:extension` 独立联调。
