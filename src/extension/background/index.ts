/**
 * Background service worker - Context menu bookmark to Nav.
 * 右键一键收藏：写入默认标签体系，分类仅由 Worker 兼容层兜底。
 */
import {
  getConfig,
  notifyBookmarksChanged,
} from "@ext/shared/storage";
import { api, ApiError } from "@ext/shared/api/client";

const BOOKMARK_ACTION = "nav-bookmark-page";

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

    notifyBookmarksChanged({ affectsPinned: false });

    const title = metadata.title || pageTitle || pageUrl;
    notify("已收藏", title);
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : (e as Error).message || "收藏失败";
    notify("收藏失败", msg);
  }
}

chrome.runtime.onInstalled.addListener(ensureContextMenu);
chrome.runtime.onStartup.addListener(ensureContextMenu);
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

console.log("[nav-ext] background service worker started");
