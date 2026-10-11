# 数据库与迁移

## 数据模型

Drizzle 表结构定义位于 `src/worker/schema.ts`。当前 D1 结构由 `migrations/` 中全部迁移依次形成；FTS5 虚拟表与同步触发器定义在迁移 SQL 中，核对数据库行为时需要同时查阅 schema 和迁移。

1. `0000_baseline.sql` 建立书签、标签关联、设置和 FTS5 全文索引。
2. `0001_adorable_apocalypse.sql` 加入分类树及书签分类关联。
3. `0002_lucky_pretty_boy.sql` 加入分类和书签的公开/私有权限字段。

`categories.parent_id` 建立树形层级；每个书签最多属于一个分类。书签与标签通过 `bookmark_tags` 多对多关联。删除书签是软删除，永久删除会移除记录；活动、归档和回收站状态由 `archived_at`、`deleted_at` 表示。

数据库中的分类和书签权限字段默认私有，`0002` 迁移也为已有数据采用私有默认值。业务层新建内容使用设置中的默认权限，有效权限按祖先链计算，详见[架构中的权限继承](architecture.md#权限继承)。

## 索引与触发器

规范化 URL 对未删除书签建立唯一索引，因此同一 URL 可在旧记录进入回收站后重新添加。分类、标签、状态和置顶查询使用相应的 D1 索引。

`bookmarks_fts` 使用 FTS5 索引标题、描述和 URL，由数据库触发器随书签增删改同步。表结构变更时需检查相关索引与触发器，不能只修改 Drizzle schema。

## 迁移维护

- 变更表结构时同步修改 schema，并新增递增迁移；可用 `pnpm db:generate` 生成迁移后审查 SQL，确认索引、触发器与现有数据的兼容性。
- 已发布的迁移保持不变；升级按顺序应用尚未执行的 SQL，不通过重置数据库代替升级。
- 本地使用 `pnpm db:migrate:local` 应用未执行迁移，D1 状态保存在 `.wrangler/state`；验证新库初始化与已有数据库升级路径，并运行覆盖变更的 Worker 集成测试。
- 远程迁移前的备份、目标确认与执行流程见[部署](deployment.md)。`pnpm deploy` 不会自动应用数据库迁移。
