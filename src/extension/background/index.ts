/**
 * Background service worker - Context menu bookmark to Nav.
 * 右键一键收藏：写入书签，标签可在 Web 或 popup 中补充。
 */
import {
  getConfig,
} from "@ext/shared/storage";
import { api, ApiError } from "@ext/shared/api/client";

const BOOKMARK_ACTION = "nav-bookmark-page";

/** 已随新标签页移除的 chrome.storage.local 遗留键，启动时一次性清理。 */
const LEGACY_LOCAL_KEYS = [
  "nav_ext_bg_image", // 新标签页背景图
  "nav_ext_pinned_cache", // 新标签页 Dock 置顶缓存
  "nav_ext_recent", // 新标签页最近打开
  "nav_ext_last_engine", // 新标签页上次搜索引擎
];

function cleanupLegacyStorage() {
  void chrome.storage.local.remove(LEGACY_LOCAL_KEYS);
}

function ensureContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: BOOKMARK_ACTION,
      title: "收藏到 Nav",
      contexts: ["page", "link"],
    });
  });
}

function notify(title: string, message: string) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title,
    message,
  });
}

async function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
) {
  const pageUrl = info.pageUrl || info.linkUrl || tab?.url;
  const pageTitle = info.selectionText || tab?.title || "";

  if (!pageUrl) return;

  const config = await getConfig();
  if (!config.apiBaseUrl || !config.adminToken) {
    notify("收藏失败", "请先在设置中配置 API 地址和管理员密码");
    return;
  }

  try {
    const metadata = await api.getMetadata(config.apiBaseUrl, config.adminToken, pageUrl);

    await api.createBookmark(config.apiBaseUrl, config.adminToken, {
      title: metadata.title || pageTitle,
      url: pageUrl,
      description: metadata.description || null,
      iconUrl: metadata.iconUrl || null,
    });

    const title = metadata.title || pageTitle || pageUrl;
    notify("已收藏", title);
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : (e as Error).message || "收藏失败";
    notify("收藏失败", msg);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  cleanupLegacyStorage();
  ensureContextMenu();
});
chrome.runtime.onStartup.addListener(() => {
  cleanupLegacyStorage();
  ensureContextMenu();
});
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

console.log("[nav-ext] background service worker started");