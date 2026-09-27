# API 与权限

## 基础规则

业务接口前缀为 `/api/v1`。未版本化的 `/api/*` 不提供业务路由，未知 API 路径返回 JSON 404。`GET /health` 位于版本化 API 之外，返回 `{ "ok": true }`。`/api/v1/*` 响应统一设置 `Cache-Control: private, no-store`。

除公开读取和登录/登出外，接口均需管理员认证。Web 使用 HttpOnly session cookie；会话最长 30 天，HTTPS 请求会带 `Secure` 属性。自动化客户端可用 `Authorization: Bearer <ADMIN_PASSWORD>`。`SESSION_SECRET` 用于签名会话，若未设置则代码回退使用 `ADMIN_PASSWORD`；部署时应分别设置这两个密钥。

## 路由

下表路径均包含 `/api/v1` 前缀。

| 资源 | 方法与路径                                                          | 用途                   |
| ---- | ------------------------------------------------------------------- | ---------------------- |
| 书签 | `GET /bookmarks`                                                    | 列表、筛选和分页       |
| 书签 | `GET /bookmarks/search`                                             | 全文搜索               |
| 书签 | `POST /bookmarks`                                                   | 新建                   |
| 书签 | `GET /bookmarks/:id`、`PUT /bookmarks/:id`                          | 读取、更新             |
| 书签 | `POST /bookmarks/:id/archive`、`POST /bookmarks/:id/restore`        | 归档、恢复             |
| 书签 | `DELETE /bookmarks/:id`、`DELETE /bookmarks/:id/permanent`          | 软删除、永久删除       |
| 书签 | `GET /bookmarks/metadata?url=...`、`GET /bookmarks/favicon?url=...` | 获取元数据和图标地址   |
| 分类 | `GET /categories`、`POST /categories`                               | 查询、新建             |
| 分类 | `PUT /categories/:id`、`DELETE /categories/:id`                     | 更新、删除             |
| 分类 | `POST /categories/reorder`                                          | 同层级分类排序         |
| 标签 | `GET /tags`、`POST /tags`                                           | 查询、新建             |
| 标签 | `PUT /tags/:id`、`DELETE /tags/:id`                                 | 更新、删除             |
| 标签 | `POST /tags/:id/merge`                                              | 合并标签               |
| 认证 | `POST /auth/login`、`POST /auth/logout`、`GET /auth/me`             | 登录、登出、检查会话   |
| 管理 | `GET /admin/stats`                                                  | 管理统计               |
| 设置 | `GET /settings/public`                                              | 公开前台设置           |
| 设置 | `GET /settings`、`PUT /settings`                                    | 读取、更新完整设置     |
| 传输 | `GET /transfer/export/prepare`、`GET /transfer/export`              | 检查导出状态、导出备份 |
| 传输 | `POST /transfer/import`                                             | 导入备份               |

旧的书签标签别名不再提供，标签列表统一使用 `GET /api/v1/tags`。

## 公开访问

访客可读取活动书签列表、活动书签全文搜索、可见的活动书签详情、可见分类、可见标签和公开设置。书签请求指定 `view=archive`、`view=trash` 或 `view=all` 时需要管理员认证。访客不能通过详情接口读取私有、已归档或已删除的书签。

分类和标签写入、所有书签写入、统计、完整设置、元数据与 favicon 请求、导入导出均需认证。登录与登出接口本身允许未登录调用。`X-Nav-Authenticated` 响应头标明当前 API 请求是否已认证。

## 书签列表与搜索参数

`GET /bookmarks` 和 `GET /bookmarks/search` 支持以下查询参数：

| 参数       | 当前行为                                                          |
| ---------- | ----------------------------------------------------------------- |
| `q`        | 搜索接口必填，长度 1–100；按标题、描述、URL 全文搜索              |
| `view`     | `active`、`archive`、`trash` 或 `all`，默认 `active`              |
| `category` | 分类 slug；包含该分类及全部后代。`uncategorized` 只匹配未归类书签 |
| `tag`      | 标签 slug；与其他 API 筛选条件可组合                              |
| `untagged` | `true`/`1` 只匹配无标签书签，`false`/`0` 关闭筛选                 |
| `pinned`   | `true`/`1` 只匹配置顶书签                                         |
| `limit`    | 每页 1–100 条，默认 24                                            |
| `cursor`   | 不透明游标；省略 `offset` 时用于连续翻页                          |
| `offset`   | 非负偏移量；提供后切换为页码模式并返回 `total`                    |

列表按 `created_at` 与 `id` 倒序；搜索按相关度 rank 与 `id` 排序。带 `offset` 的响应包含 `items`、`total`，并将 `nextCursor` 设为 `null`。不带 `offset` 的响应包含 `items` 与 `nextCursor`，不计算总数。

工作区 URL 的 `category`、`tag`、`untagged` 由前端解析为互斥导航条件；API 本身允许组合这些条件。分页、有效权限与数据查询取舍见[架构与数据行为](architecture.md)。
