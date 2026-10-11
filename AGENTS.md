# AGENTS.md

## 工作约束

- 默认中文回复；使用 pnpm。
- 修改前阅读相关代码及下方路由命中的文档。
- `src/worker` 与 `src/web` 是同一个部署单元；跨端契约只放在 `src/shared`。
- 前台使用定制组件，可复用 Base UI 无样式交互；管理后台使用 `shadcn/ui`。前后台共享无外观逻辑，各自实现呈现。
- 功能性图标统一使用 `lucide-react`；不得手写 SVG 或混用其他图标库。
- 样式优先使用 Tailwind 工具类；全局 CSS 只保留 token、关键帧和必要全局规则。

## 任务路由

按命中场景读取并更新对应文档；跨场景组合读取。

| 任务场景                                 | 读取与记录位置                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 视觉设计、组件外观或主题样式             | [DESIGN.md](DESIGN.md)                                                                          |
| 服务边界、运行时路由、权限继承或分页设计 | [docs/architecture.md](docs/architecture.md)                                                    |
| 数据库表结构、索引、触发器或迁移         | [docs/database.md](docs/database.md)                                                            |
| API 路由、跨端契约、认证或访问范围       | [docs/api.md](docs/api.md)                                                                      |
| 页面交互、本地开发或常用命令             | [docs/usage.md](docs/usage.md)                                                                  |
| 导入导出格式、兼容性或数据传输行为       | [docs/import-export.md](docs/import-export.md)                                                  |
| 准备部署、配置密钥或执行远程迁移         | [docs/deployment.md](docs/deployment.md)；迁移规则同时查阅 [docs/database.md](docs/database.md) |
| 修改文档内容或结构（含 AGENTS.md）       | [docs/AGENTS.md](docs/AGENTS.md)                                                                |

## 自主权与授权

- 任务范围内，本地隔离环境或开发分支中的读取、编辑和测试属于预授权操作，持续推进；常规可逆决策自行处理。仅缺少严重影响正确性或权限边界的关键信息时提问，并继续不受影响的工作。
- 开发分支可分阶段提交。`main`/`master` 提交、push、合并、部署及远程数据修改须有用户明确授权；已有授权沿用。

## 风险匹配验证

- 纯文档改动：检查改动文件的格式、本地链接与 `git diff --check`，无需运行代码测试或构建。
- 代码或配置改动：执行格式、lint、类型检查和覆盖受影响行为的测试；涉及共享契约、Worker 或数据库时运行完整 `pnpm check`，涉及 Web 或构建配置时补充 `pnpm build`。
- 准备部署：运行完整 `pnpm check` 和 `pnpm build`，按 [docs/deployment.md](docs/deployment.md) 核对目标与迁移；检查通过不代替部署授权。
- 前端视觉效果由人工确认，Playwright 不用于自动截图验收。
- 交付时报告实际检查结果和待人工确认项；不得绕过失败的必需检查或 CI，也不得把未执行的检查写成通过。
