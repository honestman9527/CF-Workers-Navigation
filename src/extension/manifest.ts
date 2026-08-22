import { defineManifest } from "@crxjs/vite-plugin";
export default defineManifest({
  manifest_version: 3,
  name: "Nav 收藏",
  version: "0.4.0",
  description:
    "一键收藏当前网页到 Nav 书签服务：Popup 快速保存 + 右键菜单，设置页配置连接信息。",
  options_ui: { page: "options/index.html", open_in_tab: true },
  background: { service_worker: "background/index.ts", type: "module" },
  action: { default_title: "收藏到 Nav", default_popup: "popup/index.html" },
  icons: {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    64: "icons/icon-64.png",
    128: "icons/icon-128.png",
  },
  permissions: ["storage", "contextMenus", "activeTab", "notifications"],
  optional_host_permissions: ["https://*/*", "http://*/*"],
});
