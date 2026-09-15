import type { Settings } from '@shared/api/types';

/** 返回首个需要用户修正的字段，供设置页定位到相应标签。 */
export function validateSettingsDraft(
  draft: Settings,
): { tab: string; field: string; message: string } | null {
  function isUrl(value: string) {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }
  if (
    draft.backgroundImageUrl &&
    (!isUrl(draft.backgroundImageUrl) ||
      !/^https?:\/\//i.test(draft.backgroundImageUrl) ||
      draft.backgroundImageUrl.length > 2048)
  ) {
    return {
      tab: 'appearance',
      field: 'background-url',
      message: '请输入有效的 HTTP 或 HTTPS 图片网址（最多 2048 字符）',
    };
  }
  if (!isUrl(draft.faviconProxyUrl) || !draft.faviconProxyUrl.includes('{domain}')) {
    return {
      tab: 'icons',
      field: 'favicon-url',
      message: '请输入有效的图标网址模板，并包含 {domain}',
    };
  }
  if (
    !draft.searchEngines.length ||
    draft.searchEngines.length > 20 ||
    !draft.searchEngines.some((engine) => engine.id === draft.defaultEngineId)
  ) {
    return {
      tab: 'engines',
      field: 'engine-list',
      message: '保留 1–20 个搜索引擎，并选择有效的默认引擎',
    };
  }
  return null;
}
