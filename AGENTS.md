# AGENTS.md

## 工作约束

- 默认中文回复；使用 pnpm。
- `src/worker` 与 `src/web` 是同一个部署单元；跨端契约只放在 `src/shared`。
- 前台使用定制组件，可复用 Base UI 无样式交互；管理后台使用 `shadcn/ui`。前后台共享无外观逻辑，各自实现呈现。
- 功能性图标统一使用 `lucide-react`；不得手写 SVG 或混用其他图标库。
- 样式优先使用 Tailwind 工具类；全局 CSS 只保留 token、关键帧和必要全局规则。

## 任务流程与 Git

1. 开始时检查当前分支、工作区与相关代码，读取下方路由命中的文档；识别并保留用户已有改动。
2. 每个独立开发任务从当前本地主分支新建对应分支，按任务使用 `feat/`、`fix/`、`docs/`、`refactor/` 或 `chore/` 前缀。延续同一任务时复用其分支；已有工作不便隔离时使用独立 worktree。
3. 在任务分支实现并验证。可按完整、可审查的阶段提交；仅暂存本任务改动。
4. 完成实现与相关文档后，若本地 `main` 有新提交，先在任务分支合入 `main`、保留双方历史并解决冲突。最终差异通过必需检查后，使用 `git merge --ff-only` 合回本地 `main`。本项目明确持续授权该本地快进合并；无法快进时保持 `main` 不变并报告，检查失败时留在任务分支继续修复。
5. 交付说明变更、实际检查结果、本地合并提交及未完成项，并按[审查与交接](docs/agents/review.md#审查与交接)记录固定比较范围和需求依据；只有任务要求推送时才进入推送确认。

- 任务范围内的读取、编辑、测试、分支管理、阶段提交和本地合并均自主决断。仅缺少严重影响正确性或权限边界的关键信息时提问，并继续不受影响的工作。
- 本地合并授权不包含在 `main` 上直接开发、改写历史或其他主分支操作；这些操作仍须具体授权。
- 所有 Git 推送均须用户明确同意；同一目标与范围内的已有授权沿用。确认前完成本地交付，说明待推送分支、提交及可能触发的发布流程；本地合并不包含推送授权。
- 部署、远程迁移和恢复以用户任务目标为边界，执行流程见 [docs/deployment.md](docs/deployment.md)；本地开发任务完成后停在本地合并。

## 任务路由

修改前读取命中文档；行为、规则或取舍变化时更新对应职责文档，跨场景组合读取。文档分工与去重规则见 [docs/AGENTS.md](docs/AGENTS.md)。

| 任务场景                                       | 读取与记录位置                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 视觉设计、组件外观或主题样式                   | [DESIGN.md](DESIGN.md)                                                                          |
| 服务边界、运行时路由、权限继承、分页或缓存设计 | [docs/architecture.md](docs/architecture.md)                                                    |
| 数据库表结构、索引、触发器或迁移               | [docs/database.md](docs/database.md)                                                            |
| API 路由、跨端契约、认证、访问范围或错误码     | [docs/api.md](docs/api.md)                                                                      |
| 页面交互、本地开发或常用命令                   | [docs/usage.md](docs/usage.md)                                                                  |
| 导入导出格式、兼容性或数据传输行为             | [docs/import-export.md](docs/import-export.md)                                                  |
| 准备部署、配置密钥或执行远程迁移               | [docs/deployment.md](docs/deployment.md)；迁移规则同时查阅 [docs/database.md](docs/database.md) |
| 修改文档内容、结构或协作规则（含 AGENTS.md）   | [docs/AGENTS.md](docs/AGENTS.md)                                                                |
| 合并异步状态、准备代码审查或交付               | [docs/agents/review.md](docs/agents/review.md)                                                  |

## 风险匹配验证

- 纯文档改动：检查改动文件的格式、本地链接与 `git diff --check`，无需运行代码测试或构建。
- 代码或配置改动：执行格式、lint、类型检查和覆盖受影响行为的测试；涉及共享契约、Worker 或数据库时运行完整 `pnpm check`，涉及 Web 或构建配置时补充 `pnpm build`。
- 准备部署：运行完整 `pnpm check` 和 `pnpm build`，并完成 [docs/deployment.md](docs/deployment.md) 的发布前检查与目标、迁移核对。
- 前端视觉效果由人工确认，清单见 [docs/usage.md](docs/usage.md#视觉确认)；Playwright 不用于自动截图验收。
- 交付时报告实际检查结果和待人工确认项；不得绕过失败的必需检查或 CI，也不得把未执行的检查写成通过。

## Agent skills

### Issue tracker

工作项以 GitHub Issues 跟踪（`gh` CLI）。See `docs/agents/issue-tracker.md`.

### Triage labels

使用默认五个标签：needs-triage、needs-info、ready-for-agent、ready-for-human、wontfix。See `docs/agents/triage-labels.md`.

### Domain docs

single-context：根目录 `GLOSSARY.md` + `docs/adr/`，按需创建。See `docs/agents/domain.md`.
