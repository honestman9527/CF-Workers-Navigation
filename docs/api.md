# API 与权限

## 基础规则

业务接口前缀为 `/api/v1`。未版本化的 `/api/*` 不提供业务路由，未知 API 路径返回 JSON 404。`GET /health` 位于版本化 API 之外，返回 `{ "ok": true }`。`/api/v1/*` 响应统一设置 `Cache-Control: private, no-store`。

除公开读取和登录/登出外，接口均需管理员认证。Web 使用 HttpOnly session cookie；会话最长 30 天，HTTPS 请求会带 `Secure` 属性。自动化客户端可用 `Authorization: Bearer <ADMIN_PASSWORD>`。`SESSION_SECRET` 用于签名会话，若未设置则代码回退使用 `ADMIN_PASSWORD`；部署时应分别设置这两个密钥。

密码登录和错误 Bearer 猜测共享 `AUTH_RATE_LIMITER`：默认每个站点、每个 `CF-Connecting-IP`、每个 Cloudflare 位置 60 秒允许 10 次尝试，超限返回 429、`rate_limited` 与 `Retry-After: 60`。有效 Bearer 请求不占用失败预算。没有 Cloudflare IP 头的本地请求共享 `local` 预算；共享出口的客户端也共享预算。该绑定采用最终一致的位置级计数，不承诺跨位置的精确全局配额。

API 响应包含 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY` 和 `Referrer-Policy: no-referrer`。前端页面的 CSP 与资源缓存通过构建生成的静态 `_headers` 单独配置。

普通书签新增、编辑及标签合并、删除的数据库写入以操作为单位原子提交；数据库中途失败不保留该操作的部分变更。非法游标（包括可解码但非对象或字段不合法的 JSON）返回 `400 validation_error`。导入的部分写入语义见[导入与导出](import-export.md#导入)。

共享 TypeScript 客户端在 `createApiClient({ getToken, fetch, baseUrl })` 初始化时配置认证；各方法不再接受 token 参数。Web 使用 Cookie，Bearer 调用者通过 `getToken` 提供凭据，例如 `getBookmarks(options, signal)`、`updateBookmark(id, input)`。HTTP 认证协议与响应保持不变。

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

分类排序一次最多 500 个去重后的 ID，必须全部存在且属于同一父分类；输入错误不留下部分排序。分块验证与原子写入的查询预算见[数据库与迁移](database.md#d1-查询预算)。

元数据仅接受 HTTP/HTTPS URL。抓取超时为 8 秒，声明正文超过 5 MiB 时直接拒收，实际最多读取前 512 KiB 后解析，以限制内存并隔离远端流错误。远端连接失败、正文中断或超时会返回 `partial: true` 的主机名及可用图标降级结果；重定向页面的相对图标与 canonical 地址按最终 URL 解析。

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

`mode=site|web`、`engine` 仅是前端状态，不作为 API 参数。Web URL、筛选优先级、旧地址映射及历史恢复见[使用与本地开发](usage.md#搜索与链接兼容)，分页选择与实现取舍见[架构与服务边界](architecture.md#分页与查询行为)。

## 请求与错误示例

创建书签的 JSON 正文示例（Web 使用会话 cookie，自动化客户端另带 Bearer 认证头）：

```json
{
  "title": "Cloudflare Docs",
  "url": "https://developers.cloudflare.com/",
  "visibility": "private",
  "tags": ["文档"]
}
```

`POST /api/v1/bookmarks` 成功返回 201 和完整书签 DTO。列表可请求 `GET /api/v1/bookmarks?limit=12`，响应中的 `nextCursor` 原样用于下一页：

```json
{ "items": [], "nextCursor": null }
```

错误统一采用以下结构，客户端应按 HTTP 状态和 `error.code` 判断；`error.message` 用于显示：

```json
{ "error": { "code": "unauthorized", "message": "Authentication required" } }
```

| HTTP 状态 | 错误码             | 处理方式                                                           |
| --------- | ------------------ | ------------------------------------------------------------------ |
| 400       | `validation_error` | 修正字段或导入引用后重试                                           |
| 401       | `unauthorized`     | 重新认证                                                           |
| 404       | `not_found`        | 刷新列表或检查资源 ID                                              |
| 409       | `conflict`         | 处理重复 URL、分类或标签                                           |
| 413       | `too_large`        | 将导入文件缩小至 10 MiB 内                                         |
| 429       | `rate_limited`     | 等待 `Retry-After` 指定的秒数                                      |
| 500       | `internal_error`   | 检查日志；导入可能已经部分写入，按[传输文档](import-export.md)恢复 |
| 502       | `bad_gateway`      | 上游服务失败                                                       |
