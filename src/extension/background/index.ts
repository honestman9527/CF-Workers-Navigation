/**
 * Background service worker - Context menu bookmark to Nav.
 * 右键一键收藏：使用上次选中的分类（与 popup 共享），否则落到第一个根分类。
 */
import {
  getConfig,
  getLastCategoryId,
  setLastCategoryId,
  resolveDefaultCategory,
  notifyBookmarksChanged,
} from "@ext/shared/storage";
import { api, ApiError } from "@ext/shared/api/client";
import type { CategoryNode } from "@ext/shared/api/types";

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

async function resolveTargetCategory(
  baseUrl: string,
  token: string
): Promise<CategoryNode> {
  const cats = await api.getCategories(baseUrl, token);
  if (cats.length === 0) {
    throw new Error("请先在 Nav 网站上创建分类");
  }
  const lastId = await getLastCategoryId();
  const target = resolveDefaultCategory(cats, lastId);
  if (!target) {
    throw new Error("请先在 Nav 网站上创建分类");
  }
  return target;
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
    const [metadata, category] = await Promise.all([
      api.getMetadata(config.apiBaseUrl, config.adminToken, pageUrl),
      resolveTargetCategory(config.apiBaseUrl, config.adminToken),
    ]);

    await api.createBookmark(config.apiBaseUrl, config.adminToken, {
      categoryId: category.id,
      title: metadata.title || pageTitle,
      url: pageUrl,
      description: metadata.description || null,
      iconUrl: metadata.iconUrl || null,
    });

    await setLastCategoryId(category.id);
    notifyBookmarksChanged({ affectsPinned: false });

    const title = metadata.title || pageTitle || pageUrl;
    notify("已收藏", `${title} → ${category.name}`);
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : (e as Error).message || "收藏失败";
    notify("收藏失败", msg);
  }
}

chrome.runtime.onInstalled.addListener(ensureContextMenu);
chrome.runtime.onStartup.addListener(ensureContextMenu);
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

console.log("[nav-ext] background service worker started");
