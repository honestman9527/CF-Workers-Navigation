# API

Web 与 Chrome 扩展通过同一组 `/api/v1/*` 接口访问 Worker。共享 DTO、端点和请求 client 位于 `src/shared`。

`/api` 是保留给旧客户端的兼容别名；新客户端和集成应使用 `/api/v1`。

这是私人书签柜：除登录与健康检查外，所有接口都必须认证。没有游客，也没有公开/私密字段。

## 认证

Web 使用 session cookie：

- `POST /api/v1/auth/login` `{ "password": "..." }` → `Set-Cookie: nav_session=...; HttpOnly; SameSite=Lax`
- `POST /api/v1/auth/logout` 清除 cookie
- `GET /api/v1/auth/me` 确认当前会话

扩展继续使用：

```http
Authorization: Bearer <ADMIN_PASSWORD>
```

错误密码或无效 Bearer 返回 401。本地 http 不设 `Secure`；https 生产环境会带上 `Secure`。

`SESSION_SECRET` 用于签发 cookie。未设置时由 `ADMIN_PASSWORD` 派生。

## 健康检查

- `GET /health` 公开，返回 `{ ok: true }`

## 需登录的接口

- 兼容接口：`GET/POST /api/v1/categories`、`PUT/DELETE /api/v1/categories/:id`、`PATCH /api/v1/categories/reorder`（旧数据迁移使用，Web 不再展示）
- 书签：`GET/POST /api/v1/bookmarks`、`GET /api/v1/bookmarks/:id`、`PUT/DELETE /api/v1/bookmarks/:id`、`PATCH /api/v1/bookmarks/reorder`、`GET /api/v1/bookmarks/tags`
- 搜索 / 收藏：`GET /api/v1/bookmarks/search?q=`、`GET /api/v1/bookmarks/pinned`
- 元数据：`GET /api/v1/bookmarks/metadata?url=`
- 设置：`GET/PUT /api/v1/settings`
- 迁移：`GET /api/v1/transfer/export`、`POST /api/v1/transfer/import`

兼容旧分类数据时，`GET /api/v1/bookmarks?category=&includeChildren=1` 仍可读取文件夹及其子文件夹；新 Web 流程使用 `view` 与 `tag`。

导入支持 HTML 与 JSON。旧导出里的 `isPublic` 会被忽略。请求和响应类型以 `src/shared/api/types.ts` 及 Worker 路由为准。

Worker 错误响应遵循共享 `ApiErrorShape`，错误码定义在 `src/shared/errors.ts`。

# 标签书签 API

书签不再依赖分类组织。创建、更新时可传 `tags: string[]`；服务会按标签名称建立关联。

- `GET /api/v1/bookmarks?view=active|archive|trash|all&tag=slug`：按状态和标签筛选。默认只返回活动书签。
- `GET /api/v1/bookmarks/tags`：返回标签及活动书签数量。
- `POST /api/v1/bookmarks/:id/archive`：归档；归档内容不能编辑，也不会出现在搜索中。
- `POST /api/v1/bookmarks/:id/restore`：从归档或回收站恢复。
- `DELETE /api/v1/bookmarks/:id`：移入回收站，不参与搜索和重复判断。
- `DELETE /api/v1/bookmarks/:id/permanent`：永久删除回收站内容。

网址会规范化后做重复判断（协议、主机名小写，去掉 hash 和末尾斜杠）。重复网址返回 `409 conflict`。
