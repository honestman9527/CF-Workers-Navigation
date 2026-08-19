# API

Web 与 Chrome 扩展只通过 `/api/v1/*` 访问 Worker。共享 DTO、端点和 fetch client 位于 `src/shared`。未版本化的 `/api/*` 已移除并返回 404。

这是私人书签柜：除登录与健康检查外，所有接口都必须认证。Web 使用 HttpOnly session cookie，扩展使用 `Authorization: Bearer <ADMIN_PASSWORD>`。

## 认证与健康检查

- `POST /api/v1/auth/login`：提交 `{ "password": "..." }` 并设置 session cookie。
- `POST /api/v1/auth/logout`：清除 session cookie。
- `GET /api/v1/auth/me`：确认当前会话。
- `GET /health`：公开，返回 `{ "ok": true }`。

本地 HTTP cookie 不带 `Secure`，生产 HTTPS 会带上。`SESSION_SECRET` 未设置时由 `ADMIN_PASSWORD` 派生。

## 书签列表

`GET /api/v1/bookmarks` 支持以下查询参数：

| 参数     | 值                                  | 说明          |
| -------- | ----------------------------------- | ------------- |
| `view`   | `active`、`archive`、`trash`、`all` | 默认 `active` |
| `tag`    | 标签 slug 或名称                    | 规范化后筛选  |
| `pinned` | `1`、`0`、`true`、`false`           | 置顶筛选      |
| `limit`  | `1..100`                            | 默认 24       |
| `cursor` | 上次响应返回的游标                  | 获取下一页    |

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
      "tags": ["开发"],
      "archivedAt": null,
      "deletedAt": null,
      "createdAt": "2026-08-19 00:00:00",
      "updatedAt": "2026-08-19 00:00:00"
    }
  ],
  "nextCursor": null
}
```

游标是不透明值，客户端只应原样回传。不要解析、修改或跨不同筛选条件复用。

## 搜索与标签

- `GET /api/v1/bookmarks/search?q=&view=&tag=&pinned=&limit=&cursor=`：FTS5 搜索标题、网址和描述，支持与列表相同的筛选，响应同样为游标页。
- `GET /api/v1/bookmarks/tags`：返回标签及活动书签数量。

搜索默认只返回活动书签。扩展搜索限制为 8 条；Web 每次请求 24 条并通过“加载更多”继续读取。

## 写入与状态

- `POST /api/v1/bookmarks`
- `GET /api/v1/bookmarks/:id`
- `PUT /api/v1/bookmarks/:id`
- `DELETE /api/v1/bookmarks/:id`：移入回收站。
- `POST /api/v1/bookmarks/:id/archive`
- `POST /api/v1/bookmarks/:id/restore`
- `DELETE /api/v1/bookmarks/:id/permanent`：永久删除回收站记录。

创建和更新接受 `title`、`url`、`description`、`iconUrl`、`isPinned`、`tags`。分类、`categoryId`、`sortOrder` 和重排接口均不存在。

网址会规范化后检查重复：协议和主机名小写，去掉 hash 与路径末尾斜杠。活动或归档记录的重复网址返回 `409 conflict`；回收站记录不占用唯一网址，但恢复时可能因新记录占用同一网址而返回 409。

创建时未传 `iconUrl`，Worker 会按设置中的 favicon 工具自动补全；显式传图标或 `null` 时尊重客户端选择。

## 元数据、设置与迁移

- `GET /api/v1/bookmarks/metadata?url=`
- `GET /api/v1/bookmarks/favicon?url=`
- `GET/PUT /api/v1/settings`
- `GET /api/v1/transfer/export?format=json|html`
- `POST /api/v1/transfer/import?format=json|html&strategy=skip|create|update`

JSON 备份是版本化的扁平书签数组，包含标签但不包含分类和手动排序。旧分类树 JSON 明确拒绝导入。HTML 导入把浏览器文件夹路径转换为标签；完整往返优先使用 JSON。

错误响应遵循 `src/shared/errors.ts` 的 `ApiErrorShape`，请求和响应类型以 `src/shared/api/types.ts` 为准。
