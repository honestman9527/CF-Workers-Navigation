/** 登录后允许恢复的站内地址；拒绝协议相对 URL，避免开放重定向。 */
export function resolveAuthRedirect(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return undefined;
  }

  return value;
}

/** 把 TanStack Router 的已解析位置还原为浏览器地址栏中的站内目标。 */
export function getAuthReturnPath({
  pathname,
  searchStr,
  hash,
}: {
  pathname: string;
  searchStr: string;
  hash: string;
}): string {
  return `${pathname}${searchStr}${hash ? `#${hash}` : ''}`;
}

export type LoginSearch = {
  redirect?: string;
};

/** 登录页只保留可安全恢复的 redirect 查询参数。 */
export function parseLoginSearch(search: Record<string, unknown>): LoginSearch {
  const redirect = resolveAuthRedirect(search.redirect);
  return redirect ? { redirect } : {};
}
