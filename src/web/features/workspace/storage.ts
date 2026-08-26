/** 书签柜内部分类位置的本地记忆：进入 /workspace（无参数）时恢复上次所在分类。 */

export const WORKSPACE_CATEGORY_KEY = 'nav-workspace-category';

/** 读取最近浏览的分类 slug（未记忆或读取失败返回 undefined）。 */
export function getRememberedCategory(): string | undefined {
  try {
    return window.localStorage.getItem(WORKSPACE_CATEGORY_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** 记录最近浏览的分类 slug（写入失败静默忽略，与其余偏好存储一致）。 */
export function rememberCategory(slug: string): void {
  try {
    window.localStorage.setItem(WORKSPACE_CATEGORY_KEY, slug);
  } catch {
    /* ignore */
  }
}
