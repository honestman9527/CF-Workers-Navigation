# 架构与数据行为

## 运行时与代码边界

项目由 Cloudflare Worker、D1 和 React Web 组成，Web 构建产物输出到 `dist/web`。`wrangler.jsonc` 将该目录配置为静态资源，并启用单页应用回退；`/api`、`/api/*` 和 `/health` 先进入 Worker，其余静态资源由 Cloudflare 静态资源路由提供。Worker 不再手动回退或读取前端静态文件。

`src/worker/index.ts` 导出 Hono 应用。路由负责 HTTP 参数验证和响应，`src/worker/services/` 负责业务规则与 D1 访问，`src/worker/transfer/` 负责备份格式。跨端 DTO、端点和 API 客户端位于 `src/shared/`；数据库 schema 位于 `src/worker/schema.ts`。Web 按功能组织在 `src/web/features/`，复用本地 shadcn/Base UI 组件、Tailwind CSS 和 lucide-react。

Worker、Web、shared 分别使用独立的 TypeScript 配置，隔离 Cloudflare Worker、浏览器和共享代码的运行时类型。测试统一放在 `test/`，分为 `unit/` 和 `worker/`。

## 数据模型

当前 D1 结构由 `migrations/` 中全部迁移依次形成：

1. `0000_baseline.sql` 建立书签、标签关联、设置和 FTS5 全文索引。
2. `0001_adorable_apocalypse.sql` 加入分类树及书签分类关联。
3. `0002_lucky_pretty_boy.sql` 加入分类和书签的公开/私有权限字段。

`categories.parent_id` 建立树形层级；每个书签最多属于一个分类。书签与标签通过 `bookmark_tags` 多对多关联。删除书签是软删除，永久删除会移除记录；活动、归档和回收站状态由 `archived_at`、`deleted_at` 表示。规范化 URL 对未删除书签建立唯一索引，因此同一 URL 可在旧记录进入回收站后重新添加。

`bookmarks_fts` 使用 FTS5 索引标题、描述和 URL，由数据库触发器随书签增删改同步。分类、标签、状态和置顶查询使用相应的 D1 索引。

## 权限继承

每个分类和书签都有显式 `public` 或 `private` 权限。有效权限按当前分类祖先链计算：书签自身为私有，或所在分类及任一祖先为私有时，书签有效权限为私有。祖先私有不能被后代或书签的显式公开设置覆盖。

新建分类和书签默认遵循设置中的默认权限；全新安装的默认值为公开。`0002` 迁移为既有数据添加权限字段时采用私有默认值，因此升级后的旧数据不会自动公开。导入缺少权限的新记录也默认为私有。访客看不到私有内容、私有分类和私有内容产生的计数或标签。

移动书签或分类会按新分类路径重新计算有效权限。显式公开的内容如果移出私有分类，可能会对访客公开；将私有分类改为公开也可能公开显式公开的后代内容。显式设为私有的后代仍保持私有；管理界面对移动操作有提示。删除分类时，直接书签变为未分类、子分类上移到被删分类的父级，并把原先依赖被删私有路径的内容显式设为私有，避免因删除而公开。

## 分页与查询行为

书签列表的游标按 `created_at`、`id` 倒序稳定排序；全文搜索按 FTS5 rank 和 `id` 排序。启动台采用不透明游标，首批加载后由用户继续加载。

工作区和管理后台使用页码分页：请求带 `offset` 时，响应包含符合筛选条件的 `total`，`nextCursor` 为 `null`。不带 `offset` 时使用游标分页，不计算 `total`。页码模式需要额外计数查询；计数只连接筛选必需的表，不做列表投影中的标签聚合，以避免重复处理标签关联。

API 的游标与页码模式详见[API 与权限](api.md)。带页码的精确总数便于界面导航；连续加载使用游标可避免为每页计算总数。
