# Chrome 扩展

Chrome MV3 扩展通过 HTTP API 连接导航服务，提供 popup 快速收藏、选项页和右键收藏能力；不含新标签页。

```bash
pnpm build:extension
pnpm watch:extension
pnpm bundle:extension
```

产物：

- `dist/extension/`：可在 `chrome://extensions` 中加载的扩展目录。
- `dist/nav-extension-<version>.zip`：可分发压缩包，版本来自构建后的 manifest。

`src/extension/shared` 保存 Chrome storage、配置、权限与 API adapter；API DTO、端点、错误契约和通用 fetch client 来自 `src/shared`。扩展只能经该契约和 HTTP 访问服务，不引用 Worker 或 Web 内部源码。

扩展只保留三个入口：

- **popup**：点击工具栏图标，将当前页收藏到 Nav，可编辑标题、描述与标签；未配置时引导打开设置。
- **options**：配置关键信息——API 地址、管理员密码（含主机权限授权与连通性测试）与亮/暗主题。popup 与设置页共用同一份 Chrome storage 配置。
- **background**：右键「收藏到 Nav」一键收藏，完成后发送系统通知；同时清理历史版本遗留的本地存储键。

扩展不再管理置顶书签（该项请到 Web 工作区设置），也不下载或缓存任何书签数据。Web 与扩展构建均启用 React Compiler。

扩展图标来自 `public/icons`。主题偏好契约来自 `src/shared`，扩展 CSS 位于 `src/extension/base.css`，options 与 popup 读取同一 Chrome storage 偏好。

本地加载时打开 `chrome://extensions`，启用开发者模式并选择 `dist/extension/`。选项页中的 API 地址本地通常为 `http://localhost:8787`。
