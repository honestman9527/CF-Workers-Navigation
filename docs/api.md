# API

Web 与 Chrome 扩展通过同一组 `/api/*` 接口访问 Worker。共享 DTO、端点和请求 client 位于 `src/shared`。

这是私人书签柜：除登录与健康检查外，所有接口都必须认证。没有游客，也没有公开/私密字段。

## 认证

Web 使用 session cookie：

- `POST /api/auth/login` `{ "password": "..." }` → `Set-Cookie: nav_session=...; HttpOnly; SameSite=Lax`
- `POST /api/auth/logout` 清除 cookie
- `GET /api/auth/me` 确认当前会话

扩展继续使用：

```http
Authorization: Bearer <ADMIN_PASSWORD>
```

错误密码或无效 Bearer 返回 401。本地 http 不设 `Secure`；https 生产环境会带上 `Secure`。

`SESSION_SECRET` 用于签发 cookie。未设置时由 `ADMIN_PASSWORD` 派生。

## 健康检查

- `GET /health` 公开，返回 `{ ok: true }`

## 需登录的接口

- 文件夹：`GET/POST /api/categories`、`PUT/DELETE /api/categories/:id`、`PATCH /api/categories/reorder`
- 书签：`GET/POST /api/bookmarks`、`GET /api/bookmarks/:id`、`PUT/DELETE /api/bookmarks/:id`、`PATCH /api/bookmarks/reorder`
- 搜索 / 收藏：`GET /api/bookmarks/search?q=`、`GET /api/bookmarks/pinned`
- 元数据：`GET /api/bookmarks/metadata?url=`
- 设置：`GET/PUT /api/settings`
- 迁移：`GET /api/transfer/export`、`POST /api/transfer/import`

`GET /api/bookmarks?category=&includeChildren=1` 会包含该文件夹及其子文件夹里的书签。

导入支持 HTML 与 JSON。旧导出里的 `isPublic` 会被忽略。请求和响应类型以 `src/shared/api/types.ts` 及 Worker 路由为准。

Worker 错误响应遵循共享 `ApiErrorShape`，错误码定义在 `src/shared/errors.ts`。
