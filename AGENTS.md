# AGENTS.md

## Project

pnpm；Cloudflare Workers + D1 + Hono + Drizzle；React + Vite + Tailwind CSS。

## DO

- 默认使用中文回复，除非用户指定其他语言
- 动手前阅读相关代码，按下方任务路由读取命中的文档
- 优先复用现有实现，保持最小改动、高内聚和清晰依赖方向
- `src/worker` 与 `src/web` 是同一个部署单元
- 跨端契约只进入 `src/shared`
- 前台 UI 遵循 [DESIGN.md](DESIGN.md)，使用定制组件，可复用 Base UI 无样式交互；管理后台使用 `shadcn/ui`
- 功能性图标统一使用 `lucide-react`；不得手写 SVG 或混用其他图标库
- 前端样式优先使用 Tailwind 工具类；全局 CSS 只保留 token、关键帧和必要全局规则。

## 任务路由

只读取任务命中的主题文档；跨场景任务读取对应条目。当前行为与必要取舍记录在对应文档中，无需每次通读架构或整个 `docs/`。

| 任务场景                                 | 读取与记录位置                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 服务边界、运行时路由、权限继承或分页设计 | [docs/architecture.md](docs/architecture.md)                                                    |
| 数据库表结构、索引、触发器或迁移         | [docs/database.md](docs/database.md)                                                            |
| API 路由、跨端契约、认证或访问范围       | [docs/api.md](docs/api.md)                                                                      |
| 页面交互、本地开发或常用命令             | [docs/usage.md](docs/usage.md)                                                                  |
| 导入导出格式、兼容性或数据传输行为       | [docs/import-export.md](docs/import-export.md)                                                  |
| 准备部署、配置密钥或执行远程迁移         | [docs/deployment.md](docs/deployment.md)；迁移规则同时查阅 [docs/database.md](docs/database.md) |
| 新增、移动、删除或整理文档               | [docs/AGENTS.md](docs/AGENTS.md)；同步 [docs/index.md](docs/index.md) 与受影响的链接            |

## 工作契约与自主权规范

- 在任务范围内，本地隔离环境或开发分支中的读取、代码编辑和测试属于预授权操作，持续推进，无需中途逐项确认。
- 对常规、可逆的决策做出合理假设并直接推进；仅在缺少关键信息且严重影响正确性或权限边界时提问，不受该信息影响的工作继续进行。
- 开发分支可分阶段 commit。`main`/`master` 上的 commit，以及任何 push、合并、部署或远程数据修改，须有用户明确授权；已有授权沿用，无需重复确认。

## 指令优先级

- 系统与开发者指令 > 用户显式指令 > 本地 AGENTS.md > 外部 Skills 指引。
- Skills 是辅助流程；若其约束与用户显式指令冲突、导致无谓暂停或偏离任务，跳过该约束并继续完成已授权工作，同时遵守上级指令与权限边界。

## 风险匹配验证

- 纯文档改动：检查改动文件的格式、本地链接与 `git diff --check`，无需运行代码测试或构建。
- 代码或配置改动：执行格式、lint、类型检查和覆盖受影响行为的测试；涉及共享契约、Worker 或数据库时运行完整 `pnpm check`，涉及 Web 或构建配置时补充 `pnpm build`。
- 准备部署：运行完整 `pnpm check` 和构建，并按 deployment.md 核对部署目标与迁移；检查通过不代替部署授权。
- 涉及前端体验的修改交由人工确认视觉效果，Playwright 不用于自动截图验证。交付时说明实际检查结果与待人工确认项，不把未执行的检查写成通过。
- 风险匹配用于选择必要的验证范围，不得绕过失败的检查、CI 或仓库规定的必需检查。
