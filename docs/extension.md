# Chrome 扩展

Chrome MV3 扩展通过 HTTP API 连接导航服务，提供新标签页、popup、选项页和右键收藏能力。

```bash
pnpm build:extension
pnpm watch:extension
pnpm bundle:extension
```

产物：

- `dist/extension/`：可在 `chrome://extensions` 中加载的扩展目录。
- `dist/nav-extension-<version>.zip`：可分发压缩包，版本来自构建后的 manifest。

`src/extension/shared` 保存 Chrome storage、配置、权限与 API adapter；API DTO、端点、错误契约和通用 fetch client 来自 `src/shared`。扩展只能经该契约和 HTTP 访问服务，不引用 Worker 或 Web 内部源码。

扩展图标来自 `public/icons`。主题偏好契约来自 `src/shared`，扩展 CSS 位于 `src/extension/base.css`，options、new tab 与 popup 读取同一 Chrome storage 偏好。

本地加载时打开 `chrome://extensions`，启用开发者模式并选择 `dist/extension/`。选项页中的 API 地址本地通常为 `http://localhost:8787`。
