# 使用与本地开发

## 产品页面

- `/` 根据浏览器中保存的前台偏好跳转到 `/launch` 或 `/workspace`。
- `/launch` 是启动台。访客可查看公开且未归档的常用书签；搜索支持配置搜索引擎、bang 搜索、网址直达和键盘选择。搜索结果与常用书签都按批次加载；输入后可点击清空按钮，搜索加载失败可直接重试。
- `/workspace` 是书签柜，支持分类、标签和无标签导航、全文搜索、页码分页，以及网格和列表视图。分类、标签和无标签是互斥导航条件；搜索词独立保存在 URL 中，清空搜索后恢复原导航条件。每页默认 24 条，可选 48 或 96 条；视图偏好保存在当前浏览器。管理员可在卡片菜单中复制网址；空页面提供添加书签入口，搜索无结果时可直接清除搜索。
- `/admin` 提供书签、分类、标签、设置和导入导出管理。书签可查看活动、归档、回收站和全部状态；归档、删除、永久删除、分类删除和标签合并等操作会要求确认。分类管理初次只显示一级分类，可逐层展开；在分类下新建子分类时会展开父分类。数据刷新保留当前展开状态，重新进入页面后恢复初始状态。

管理后台侧栏在桌面端可收起、在移动端以抽屉打开；桌面端的展开偏好保存在当前浏览器。侧栏底部将返回前台入口独立为一行，下方并排显示主题切换和退出登录；主题可选择亮色、暗色或跟随系统。主题菜单在桌面端向侧栏右侧打开，在移动抽屉中向上打开。

加入或取消常用只刷新书签列表，请求期间禁用当前书签的常用按钮；其他书签修改继续刷新分类与标签。后台列表加载失败时显示错误和重试入口，分类筛选可再次点击收起。新建或重命名分类、标签失败时保留输入，重命名提供保存与取消按钮。

添加和编辑书签时，“自动填写”补充尚未填写的网页信息，获取不完整时提示手动补充；不会覆盖已有标题、描述和图标。“自定义图标”默认折叠，展开可编辑图标地址或重新获取，折叠不清空已有值。标签支持回车或英文逗号确认，直接保存也会归并未确认的标签草稿并去重。搜索、标签输入和分类、标签重命名在中文输入法组合期间不会触发快捷操作；`/` 聚焦搜索会避开正在编辑的输入框与可编辑区域。

访客只能读取公开且处于活动状态的内容。管理员登录后可查看和管理私有内容。权限继承、内容移动和删除分类的细节见[架构与数据行为](architecture.md)及[API 与权限](api.md)。

## 本地启动

要求 Node.js `>=24`、pnpm `>=11`。

```powershell
pnpm install
Copy-Item .dev.vars.example .dev.vars
```

编辑 `.dev.vars`，为 `ADMIN_PASSWORD` 和 `SESSION_SECRET` 设置仅供本地使用的值。然后初始化本地 D1 并启动：

```powershell
pnpm db:migrate:local
pnpm dev
```

打开 `http://localhost:8787`。`pnpm dev` 会先构建 Web，再并行启动 Wrangler Worker 和 Web 构建监听。

## 常用命令

```bash
pnpm dev                 # 启动本地 Worker 与 Web 构建监听
pnpm build               # 构建 Web 到 dist/web
pnpm lint                # 静态检查
pnpm fmt:check           # 格式检查
pnpm typecheck           # 类型检查 shared、Worker 与 Web
pnpm test                # 运行单元测试和 Worker 集成测试
pnpm check               # 依次运行格式、lint、类型和测试检查
pnpm db:migrate:local    # 应用本地 D1 迁移
pnpm db:migrate:remote   # 应用远程 D1 迁移
pnpm deploy              # 构建 Web 并部署 Worker
```

`pnpm deploy` 不负责应用数据库迁移。生产部署前的迁移与密钥步骤见[部署与数据库迁移](deployment.md)。

## 目录结构

```text
src/
├── worker/       # Hono 路由、D1 服务、Drizzle schema 与备份格式
├── web/          # React Web 前端
└── shared/       # Web 与 Worker 共用的 API 和偏好契约
public/           # Web 静态资源
migrations/       # D1 基线和递增迁移
test/
├── unit/         # shared 与 Web 单元测试
└── worker/       # Cloudflare Worker 集成测试
```

这是单包仓库。根 `package.json` 管理依赖与命令；`pnpm-workspace.yaml` 配置 pnpm 安装脚本策略。Worker 和 Web 使用同一份部署配置。
