# API

Web 通过 `/api/v1/*` 访问 Worker。共享 DTO、端点和 fetch client 位于 `src/shared`。未版本化的 `/api/*` 已移除并返回 404。

站点支持公开浏览与管理员私有空间。Web 使用 HttpOnly session cookie，也保留管理员 Bearer 认证。

## 公开与私有权限

- 匿名可读取活动书签列表、搜索、公开书签详情、分类与标签列表（含 `/bookmarks/tags` 别名），以及 `GET /api/v1/settings/public`。管理、写入、元数据、完整设置和导入导出必须认证。
- 分类、书签 DTO 包含 `visibility: "public" | "private"` 和只读 `effectiveVisibility`。创建及更新接受可选 `visibility`；省略更新字段保留原值。客户端不能通过请求参数提升读取权限。
- 任意祖先分类私有时，整个子树和其中网站实际私有。公开分类内可单独设置私有网站；未分类网站按自身权限判断。
- 游客完全看不到私有分类、网站及私有专属标签，计数与分页总数只包含可见活动网站；不可见详情与不存在详情统一返回 404。匿名请求 `view=all|archive|trash` 返回 401。
- 所有 API 响应使用 `Cache-Control: private, no-store`；内容响应的 `X-Nav-Authenticated` 用于前端识别会话失效。
- 旧数据迁移为私有；新分类、新网站初始默认公开，由设置中的 `defaultCategoryVisibility`、`defaultBookmarkVisibility` 控制。修改默认值不批量改变已有数据。
- 移动重新计算继承权限。删除分类时，在原子批处理中保留直属网站和子分类的原有私有保护，再将网站改为未分类、子分类上移。
- 本权限控制导航内的信息，不控制外部目标网站。

## 认证与健康检查

- `POST /api/v1/auth/login`：提交 `{ "password": "..." }` 并设置 session cookie。
- `POST /api/v1/auth/logout`：清除 session cookie。
- `GET /api/v1/auth/me`：确认当前会话。
- `GET /health`：公开，返回 `{ "ok": true }`。

本地 HTTP cookie 不带 `Secure`，生产 HTTPS 会带上。`SESSION_SECRET` 未设置时由 `ADMIN_PASSWORD` 派生。

## 书签列表

`GET /api/v1/bookmarks` 支持以下查询参数：

| 参数       | 值                                  | 说明                                                              |
| ---------- | ----------------------------------- | ----------------------------------------------------------------- |
| `view`     | `active`、`archive`、`trash`、`all` | 默认 `active`                                                     |
| `category` | 分类 slug 或保留字 `uncategorized`  | 规范化后筛选，包含该分类整棵子树；`uncategorized` 筛未分类书签    |
| `tag`      | 标签 slug 或名称                    | 规范化后筛选（与分类叠加）                                        |
| `untagged` | `true` / `1`、`false` / `0`         | 真值仅返回无任何标签的书签；省略或假值不限制                      |
| `pinned`   | `1`、`0`、`true`、`false`           | 置顶筛选                                                          |
| `limit`    | `1..100`                            | 默认 24                                                           |
| `cursor`   | 上次响应返回的游标                  | 获取下一页                                                        |
| `offset`   | `0..` 非负整数                      | 进入页码分页：跳过前 N 条并返回 `total`，`nextCursor` 恒为 `null` |

响应统一为：

```json
{
  "items": [
    {
      "id": 1,
      "title": "Example",
      "url": "https://example.com",
      "description": null,
      "iconUrl": null,
      "isPinned": false,
      "categoryId": null,
      "categorySlug": null,
      "categoryName": null,
      "tags": ["开发"],
      "archivedAt": null,
      "deletedAt": null,
      "createdAt": "2026-08-19 00:00:00",
      "updatedAt": "2026-08-19 00:00:00"
    }
  ],
  "nextCursor": null,
  "total": 12
}
```

`total` 仅在携带 `offset` 的分页模式下返回，表示当前筛选条件下的记录总数；游标模式不返回该字段。游标是不透明值，客户端只应原样回传；不要解析、修改或跨不同筛选条件复用，也不要与 `offset` 同时使用。

`untagged=true` 使用 `NOT EXISTS bookmark_tags` 判断，列表、搜索、游标分页与 `total` 统计共用过滤条件。不占用标签 slug，真实 `tag=untagged` 仍按普通标签查询。API 的条件可以叠加；`tag=<slug>&untagged=true` 返回空集。`category=uncategorized` 与无标签独立，非法布尔值返回 400。无需数据库迁移。

## 搜索与标签

- `GET /api/v1/bookmarks/search?q=&category=&view=&tag=&untagged=&pinned=&limit=&cursor=&offset=`：FTS5 搜索标题、网址和描述，支持与列表相同的筛选，响应同样为游标页（携带 `offset` 时为页码分页并返回 `total`）。
- `GET /api/v1/tags`：返回标签及活动书签数量（标签的规范列表接口）。
- `GET /api/v1/bookmarks/tags`：过时别名，行为与 `GET /api/v1/tags` 相同，仅用于向后兼容。

搜索默认只返回正常（active）书签。启动台沿用游标查询；工作区使用 offset 页码分页，默认 limit=24，可选 48/96，读取 total 展示总数。工作区 URL 的 page/pageSize 转换为 API 的 offset/limit，不直接传入 API。

## 标签管理

标签由书签编辑时按名称自动创建与复用，管理后台负责整理（重命名、合并、删除）：

- `GET /api/v1/tags`：管理员列出全部标签；游客只列出有关联公开活动网站的标签，计数按当前身份计算。
- `POST /api/v1/tags`：`{ "name" }` 创建标签，slug 由名称生成；同名（同 slug）返回 `409`。
- `PUT /api/v1/tags/:id`：`{ "name" }` 重命名并同步 slug；与已有标签 slug 冲突返回 `409`，改用「合并」。
- `POST /api/v1/tags/:id/merge`：`{ "targetId" }` 把源标签合并进目标，源标签的书签关联改指目标（去重）后删除源标签；自合并返回 `400`，任一标签缺失返回 `404`。
- `DELETE /api/v1/tags/:id`：删除标签并清理其 `bookmark_tags` 关联，不删除书签。

## 管理后台概览

- `GET /api/v1/admin/stats`：返回书签四态计数与分类、标签总数：

```json
{
  "bookmarks": { "total": 10, "active": 7, "archived": 2, "trash": 1 },
  "categories": 3,
  "tags": 5
}
```

统计口径与列表视图一致：`trash` 计已删除记录，`archive` 计未删除但已归档记录。

## 分类

- `GET /api/v1/categories`：返回当前身份可见分类（扁平，含 `parentId`），客户端据此重建树；每项带直属活动书签数。
- `POST /api/v1/categories`：`{ "name", "parentId"?, "icon"? }` 创建分类，slug 由名称生成；同级追加到末尾。
- `PUT /api/v1/categories/:id`：`{ "name"?, "parentId"?, "icon"? }` 重命名 / 移动 / 改图标；不能移动到自身的子树中（循环校验）。
- `DELETE /api/v1/categories/:id`：子分类上移一级，书签变为未分类；不删除书签。
- `POST /api/v1/categories/reorder`：`{ "ids": [...] }` 对同一层级的分类重排序。

分类名对应的 slug 全局唯一；`uncategorized` 是保留筛选值，不能作为分类 slug。分类筛选按 slug 递归包含整棵子树；未知分类 slug 返回空结果。`category=uncategorized` 筛选未归类的书签。

## 写入与状态

- `POST /api/v1/bookmarks`
- `GET /api/v1/bookmarks/:id`
- `PUT /api/v1/bookmarks/:id`
- `DELETE /api/v1/bookmarks/:id`：移入回收站。
- `POST /api/v1/bookmarks/:id/archive`
- `POST /api/v1/bookmarks/:id/restore`
- `DELETE /api/v1/bookmarks/:id/permanent`：永久删除回收站记录。

创建和更新接受 `title`、`url`、`description`、`iconUrl`、`isPinned`、`categoryId`、`tags`、`visibility`。`categoryId` 为 `null` 或不传时书签归为未分类；`sortOrder` 与重排接口仅对分类存在，书签不保留手动排序。

网址会规范化后检查重复：协议和主机名小写，去掉 hash 与路径末尾斜杠。活动或归档记录的重复网址返回 `409 conflict`；回收站记录不占用唯一网址，但恢复时可能因新记录占用同一网址而返回 409。

创建时未传 `iconUrl`，Worker 会按设置中的 favicon 工具自动补全；显式传图标或 `null` 时尊重客户端选择。

## 元数据、设置与迁移

- `GET /api/v1/bookmarks/metadata?url=`
- `GET /api/v1/bookmarks/favicon?url=`
- `GET/PUT /api/v1/settings`
- `GET /api/v1/transfer/export?format=json|html`
- `POST /api/v1/transfer/import?format=json|html&strategy=skip|create|update`

`GET/PUT /api/v1/settings` 的 DTO 与校验：

```json
{
  "defaultCategoryVisibility": "public",
  "defaultBookmarkVisibility": "public",
  "faviconProxyUrl": "https://www.google.com/s2/favicons?domain={domain}&sz=64",
  "faviconProxyEnabled": true,
  "searchEngines": [
    {
      "id": "google",
      "name": "Google",
      "url": "https://www.google.com/search?q={query}",
      "builtin": true
    }
  ],
  "defaultEngineId": "google",
  "backgroundImageUrl": "",
  "backgroundImageEnabled": false
}
```

`searchEngines` 是完整替换的引擎列表（1..20 个）：`id` 唯一、`url` 必须含 `{query}` 占位符、`builtin` 标记内置项。内置项不可删除——缺失时服务端写入前自动补回默认内置引擎。`defaultEngineId` 必须存在于列表中，否则返回 `400`。Web 启动台使用 `SearchEngine` 契约（见 `src/shared/search.ts`）。

背景图片：`backgroundImageUrl` 为空串表示不启用；非空时须为合法 `http(s)` 网址（否则返回 `400`）。`backgroundImageEnabled` 控制是否启用，Web 启动台与工作区共用该背景。

JSON v2 备份是版本化的扁平书签数组，额外包含 `categories`（扁平分类定义，`parentSlug` 指向父分类），书签经 `categorySlug` 恢复归属；导入时按 slug 补齐缺失分类并重建层级。旧分类树 JSON（含嵌套 `children`/`bookmarks` 的节点）仍明确拒绝导入。HTML 导出按分类树生成嵌套文件夹（未分类书签落入「未分类」文件夹），不输出标签；HTML 导入把文件夹层级恢复为分类，同样不创建标签——HTML 可与浏览器跨端迁移并往返恢复分类结构，标签等轻量标注仍以 JSON 为准。

错误响应遵循 `src/shared/errors.ts` 的 `ApiErrorShape`，请求和响应类型以 `src/shared/api/types.ts` 为准。

公开设置 `GET /api/v1/settings/public` 仅返回 `searchEngines`、`defaultEngineId`、`backgroundImageUrl`、`backgroundImageEnabled`，供游客前台使用，不包含默认权限与 favicon 工具配置。

JSON v2 在分类和书签上保存显式 `visibility`，实际权限由恢复后的分类树计算；仍可导入 v1。缺少权限的旧 JSON/HTML 新记录默认私有，更新已有网站保留原有保护（移出私有分类时显式保留私有）。复用已有分类不覆盖其权限和层级；导入拒绝循环层级及非法权限。HTML 不保存权限，完整备份请使用 JSON；所有导出均为管理员数据，包含私有内容。
