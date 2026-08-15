# CF Workers Nav 重构计划

> 源项目：`../CF-Workers-Nav`（v0.2.2）
> 目标：个人书签式导航，部署在 Cloudflare Workers + D1
> 产品决策：必须登录；分类是文件夹树；删除 `isPublic` 与游客/有效公开

---

## 0. 产品定义

这是一个人的书签柜，不是公开导航站。

- **文件夹树**：分类可嵌套，书签落在文件夹里。删除文件夹会连同子文件夹和书签一起删。保留排序、置顶、搜索、导入导出。
- **没有公开/私密**：删掉 `isPublic` / `is_public`、有效公开继承、游客剪枝、公开浏览。整库只属于登录者。
- **必须登录**：Web 未登录只能看见登录页；`/api/*` 除 login / health 外一律 401。
- **一个人**：第一期一个密码、一个身份。能登录就是主人，能看也能改。不做多用户、不做只读分享。
- **扩展**：newtab / popup / options **沿用原设计**，只跟契约删掉 `isPublic`、继续 Bearer 密码。

---

## 1. 现状（对照）

源项目是「公开浏览 + 可选管理员」：

- 游客几乎每个 GET 都全表拉分类，再在 JS 里算有效公开。
- Web `App.tsx` 910 行，公开/管理混在一起；密码明文进 localStorage。
- 分类文件夹树、置顶、FTS 搜索、HTML/JSON 导入导出已经可用，要保留。

完整技术栈与文件级问题见上一版分析。结论不变：后端分层、读路径缩短、Web 拆开重做；扩展不换肤。

---

## 2. 目标模型

```
src/worker/
  app.ts + index.ts
  auth/                 # cookie session + Bearer
  services/             # bookmarks / categories / settings / transfer
  routes/               # 薄
  schema.ts             # 无 is_public
  （删除 visibility.ts）

Web：/login 门禁 → / 文件夹 + 书签工作台
扩展：视觉冻结，Bearer 不变
```

### 数据

| 表              | 保留                                                                        |
| --------------- | --------------------------------------------------------------------------- |
| `categories`    | 树：parent_id / name / slug / icon / sort_order                             |
| `bookmarks`     | category_id / title / url / description / icon_url / is_pinned / sort_order |
| `settings`      | favicon 代理                                                                |
| `bookmarks_fts` | title / description / url                                                   |

新增迁移 `0001_drop_is_public.sql`：删列、删相关索引。导入旧 JSON 时忽略 `isPublic`。

### 认证

| 端     | 方式                                     | 能力               |
| ------ | ---------------------------------------- | ------------------ |
| Web    | `POST /api/auth/login` → HttpOnly cookie | 读写全部           |
| 扩展   | `Authorization: Bearer <ADMIN_PASSWORD>` | 读写全部           |
| 未登录 | —                                        | 登录页 + `/health` |

- Cookie：HMAC 签名，密钥 `SESSION_SECRET`（缺省由 `ADMIN_PASSWORD` 派生）。本地 http 不设 `Secure`。
- Web 不再把密码放 localStorage。
- 没有游客，没有 `isAdmin` 分支。UI 里不再出现「访客 / 公开」。

### 读路径（门禁后天然变短）

- 分类：一次扁平行 + 一次计数，JS 建树。不再剪枝。
- 书签：按文件夹或子树 CTE，不再 `IN (公开 id)`。
- 置顶：`WHERE is_pinned = 1`。
- 搜索：FTS5，不再拼可见性。

---

## 3. 阶段

| 阶段 | 内容                                                                              |
| ---- | --------------------------------------------------------------------------------- |
| 0    | 源码迁入，基线可构建                                                              |
| 1    | 删 `isPublic` + 登录门禁 + Worker 分层 + 读路径收紧（一次做完，因为公开语义已废） |
| 2    | Web 拆成登录页 + 个人书签工作台，并重新设计                                       |
| 3    | 扩展类型适配（无视觉改动）、文档与 CI                                             |

阶段 1 不再「行为不变」：产品语义就是个人库。测试从「游客看不见私密」改成「未登录 401 / 登录后全量」。

---

## 4. Web 设计方向

私人工具台，每天打开找链接。不是 SaaS 落地页，不是公开目录。

- 登录页是门：一个密码，没有营销。
- 主界面：左侧文件夹索引，右侧书签卡。保留 `/` 搜索、网格/列表、置顶、面包屑。
- 签名只留一处（文件夹索引轨）。详细 token 见 `docs/web-design.md`。
- 组件只走 `components/ui`。扩展不套这套皮肤。

---

## 5. 不做

- 不改扩展视觉与交互
- 不多用户 / OAuth / 只读分享
- 不拆 monorepo
- 不保留游客兼容层
- 未经确认不 commit / push / 部署
