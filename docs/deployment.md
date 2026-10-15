# 部署

## 环境要求

- Node.js `>=24`
- pnpm `>=11`
- Cloudflare Workers 和 D1 账户

本地 Worker 使用 Wrangler 开发服务器，默认地址为 `http://localhost:8787`。本地 D1 状态保存在 `.wrangler/state`。

本地启动步骤见[使用与本地开发](usage.md#本地启动)，表结构与迁移维护规则见[数据库与迁移](database.md)。

代理执行操作的任务范围与 Git 推送授权统一遵循根 [AGENTS.md](../AGENTS.md#任务流程与-git)；本文规定执行步骤与技术检查。

## 部署目标与隔离

`wrangler.jsonc` 的 `name` 是 Worker 名称，D1 通过 `DB` 绑定连接。配置中的 `database_id` 初始为占位值，必须替换为已确认账户内的数据库 ID。`AUTH_RATE_LIMITER` 是登录限流绑定；生成 CI 配置时保留该绑定与其 namespace，调整 namespace 前核对账户内其他 Worker 的使用情况。

当前配置只有一个部署目标，没有单独的 staging 环境。需要预览或演练时，使用独立 Worker 名称、D1 ID 和 secrets 的配置文件，通过 `--config` 显式选择；不要让预览 Worker 绑定生产库。核对 `CLOUDFLARE_ACCOUNT_ID`、Worker 名称和 D1 名称/ID 后再执行远程命令。

## 手动部署

首次部署先明确创建数据库，把返回的 ID 写入 `wrangler.jsonc`；升级时跳过创建：

```bash
pnpm exec wrangler d1 create nav
```

从准备发布的固定提交执行全部本地检查和打包，再处理生产资源：

```bash
pnpm install --frozen-lockfile
pnpm cf:types:check
pnpm check
node --test .github/scripts/*.test.mjs
pnpm build
pnpm exec wrangler deploy --dry-run --config wrangler.jsonc
```

首次部署通过交互提示设置 secrets，避免把值写入命令历史；已有部署只在确实需要轮换时执行：

```bash
pnpm exec wrangler secret put ADMIN_PASSWORD --config wrangler.jsonc
pnpm exec wrangler secret put SESSION_SECRET --config wrangler.jsonc
```

本地检查通过后，核对账户和目标 D1，记录恢复点与待执行迁移。`time-travel info` 本身访问远程库，不需要 `--remote`。恢复点必须早于 `migrations list`，因为 Wrangler 查询迁移清单时可能初始化迁移跟踪表：

```bash
pnpm exec wrangler whoami
pnpm exec wrangler d1 info DB --config wrangler.jsonc
pnpm exec wrangler d1 time-travel info DB --config wrangler.jsonc --json > recovery-before.json
pnpm exec wrangler d1 migrations list DB --remote --config wrangler.jsonc
```

确认恢复点文件有非空 `bookmark`，保存当前代码提交、Worker 版本、账户、数据库 ID 和迁移清单，再应用迁移并发布已经打包验证的代码：

```bash
pnpm exec wrangler d1 migrations apply DB --remote --config wrangler.jsonc
pnpm exec wrangler deploy --config wrangler.jsonc
SITE_URL=https://nav.example node .github/scripts/deployment.mjs smoke
```

最后一条命令中的地址替换为实际站点源地址。脚本检查 `/health` 和未认证的 `/api/v1/bookmarks?limit=1`；空书签库也可验证 D1 查询。成功响应必须为 JSON，HTML 回退、重定向、数据库错误及私有数据都会失败。人工继续验证登录、编辑/保存、公开与私有内容、静态资源及移动端界面。

`pnpm run deploy` 仍可用：它先构建 Web，再执行 `wrangler deploy`，不会应用迁移。上述发布流程直接调用 `wrangler deploy`，将构建失败提前至生产迁移之前。任何检查失败都应停止发布；迁移兼容规则见[数据库与迁移](database.md#迁移维护)。

## GitHub Actions 部署

`.github/workflows/ci.yml` 在 push 和 pull request 上运行绑定类型生成检查 `pnpm cf:types:check`、完整 `pnpm check`、部署脚本测试、`pnpm build` 和 Worker `deploy --dry-run`。`.github/workflows/deploy.yml` 自动发布本仓库 `main` push 对应的成功 CI 的 `head_sha`，不会把 PR、fork 或其他分支的 CI 当作部署依据。手动触发仅接受 `main`，固定到触发时的 `github.sha`；选择其他分支会跳过部署。两条路径都重新运行完整本地验证，checkout 后核对实际提交。

推送 `main` 会启动上述自动发布链；本地合并不会触发 Actions。代理请求推送同意时需说明这一影响，合并与推送流程见根 [AGENTS.md](../AGENTS.md#任务流程与-git)。

仓库需要配置以下 Actions secrets：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`

以下 Actions variables 可选：

- `NAME`：已有 D1 数据库名称，默认为 `nav`。
- `D1_DATABASE_ID`：已有 D1 数据库 ID，建议显式配置。设置时必须与 `NAME` 同时命中；不设置时只接受唯一的同名数据库。
- `SITE_URL`：发布后的公开站点源地址，例如 `https://nav.example`，用于健康与实际 D1 读取冒烟验证。

工作流不会自动创建数据库；找不到目标时失败，避免名称填写错误后发布到一个新空库。首次部署应按上文明确创建，再设置 variables。Worker 名称沿用 `wrangler.jsonc`，不受 `NAME` 影响。

生产部署使用固定并发组 `nav-production-deploy`，`cancel-in-progress: false`；自动与手动发布串行，避免新任务取消正在迁移的任务。GitHub 并发组仍可能替换尚未开始的待执行任务，不保证队列 FIFO。仓库分支保护与 Actions 权限负责限制谁能更新 `main` 或触发发布；此工作流没有额外新增需手工配置的 GitHub Environment。

执行顺序为：固定提交 → 完整检查 → 构建和 Worker 打包验证 → 解析已有 D1 → 验证目标配置 → 记录 Time Travel bookmark → 记录迁移清单 → 应用迁移 → 发布 → 冒烟验证。恢复点或迁移清单记录失败时停止。Summary 包含发布 SHA、Worker/D1 标识、恢复 bookmark 和待执行迁移；临时 secrets 文件使用 `0600` 权限并在结束时清理，不输出秘密值。

未设置 `SITE_URL` 时，Summary 明确标记线上冒烟“待人工验证”，不会声称线上检查通过。设置后冒烟失败会让任务失败，但代码可能已发布、迁移也可能已执行；按下文排查并选择恢复措施，不自动回滚数据。

## 备份、恢复与回滚

原库在迁移前记录的 [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) bookmark 用于时间点恢复，覆盖表结构、迁移跟踪和数据。保留窗口为 Free 7 天、Paid 30 天，以[当前平台限制](https://developers.cloudflare.com/d1/platform/limits/)为准；bookmark 不是超出窗口仍可用的离线备份。

长期保留书签时，在后台数据页导出 JSON，并验证文件可以解析、记录数量及归档/回收站状态正确。该文件包含私有数据；它备份分类和书签，不包含站点设置、数据库 schema/迁移记录或 Worker secrets。设置和部署配置需另行保存。恢复到独立的已迁移空库后，检查分类层级、权限、标签、各状态数量和全文搜索，再切换绑定。合并到非空库的行为见[导入导出](import-export.md)。

本项目包含 FTS5 虚拟表。[D1 当前不支持导出含虚拟表的数据库](https://developers.cloudflare.com/d1/best-practices/import-export-data/#known-limitations)，不能把直接执行 `wrangler d1 export` 当作已验证的完整备份方式。不要为日常备份删除生产 FTS 表；需要完整离线 SQL 归档时，应在隔离副本中专门验证普通表导出、迁移记录、触发器与 FTS 重建方案。

迁移失败时先读取执行结果和 `migrations list`，确认哪些迁移已成功。发布失败且迁移兼容旧代码时，保留数据库状态并重试同一提交。应用异常而数据正确时，确认目标 Worker 版本支持当前数据库后执行代码回滚：

```bash
pnpm exec wrangler versions list --config wrangler.jsonc
pnpm exec wrangler versions view <WORKER_VERSION_ID> --config wrangler.jsonc
pnpm exec wrangler rollback <WORKER_VERSION_ID> --config wrangler.jsonc
```

[Worker 版本回滚](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)不会恢复 D1 数据。数据恢复会撤销 bookmark 之后的业务写入，不能作为普通代码发布失败的默认动作。确需恢复时暂停写入入口和发布任务，保存当前 bookmark、选择匹配的代码版本，核对账户/数据库后执行：

```bash
pnpm exec wrangler d1 time-travel info DB --config wrangler.jsonc --json > recovery-current.json
pnpm exec wrangler d1 time-travel restore DB --bookmark=<BEFORE_MIGRATION_BOOKMARK> --config wrangler.jsonc
```

保存恢复结果中的 `previous_bookmark`，必要时可用它撤销本次恢复。恢复后核对迁移跟踪、书签/分类/标签数量、FTS 搜索和公开权限，运行线上冒烟，再恢复写入。数据库恢复与生产代码回滚分别按任务目标选择，确认实际故障和恢复影响后执行。

## 静态资源与路由

Web 构建输出为 `dist/web`，通过 Wrangler 的静态资源配置发布并使用 SPA 回退。`/api`、`/api/*` 和 `/health` 先交由 Worker 处理，其他页面和静态资源由 Cloudflare 静态资源路由响应。架构细节见[架构与服务边界](architecture.md)。

构建生成静态资源 `_headers`，包含页面安全头、CSP 和带哈希文件名资源的 immutable 缓存规则；Worker 自行设置 API 安全头。发布时核对页面加载与 CSP 控制台报告，确认主题初始化脚本、字体和外部图片正常；静态资源的 `_headers` 不会自动作用于 Worker API 响应。
