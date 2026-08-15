import { defineManifest } from "@crxjs/vite-plugin";
export default defineManifest({
  manifest_version: 3,
  name: "Nav 新标签页",
  version: "0.2.2",
  description:
    "连接 Nav 书签服务的全新标签页：中心搜索框 + 可配置搜索引擎 + Dock 收藏栏。",
  chrome_url_overrides: { newtab: "newtab/index.html" },
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
  web_accessible_resources: [
    { resources: ["assets/*"], matches: ["<all_urls>"] },
  ],
});
