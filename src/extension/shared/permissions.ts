/**
 * 运行时 host 权限管理。
 * API 地址由用户在选项页输入（运行时才知道），所以用
 * optional_host_permissions + chrome.permissions.request 动态授权。
 */

/** 从 origin 构造 match pattern。 */
function toPattern(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/*`;
}

/** 检查是否已拥有 origin 权限（不弹窗）。 */
export async function hasHostPermission(origin: string): Promise<boolean> {
  if (!origin) return false;
  try {
    return await chrome.permissions.contains({ origins: [toPattern(origin)] });
  } catch {
    return false;
  }
}

/**
 * 确保已拥有目标 origin 的 host 权限。
 * @returns true 表示已授权，false 表示用户拒绝或出错。
 */
export async function ensureHostPermission(origin: string): Promise<boolean> {
  if (!origin) return false;
  const pattern = toPattern(origin);
  try {
    const already = await chrome.permissions.contains({ origins: [pattern] });
    if (already) return true;
    const resp = await chrome.permissions.request({ origins: [pattern] });
    return !!resp;
  } catch {
    return false;
  }
}

/** 移除 origin 的 host 权限（换 API 地址时清理旧的）。 */
export async function removeHostPermission(origin: string): Promise<void> {
  if (!origin) return;
  try {
    await chrome.permissions.remove({ origins: [toPattern(origin)] });
  } catch {
    /* ignore */
  }
}
