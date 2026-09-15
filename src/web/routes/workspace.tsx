import { createRoute, redirect } from '@tanstack/react-router';

import { isCanonicalWorkspaceSearch, parseWorkspaceSearch } from '@nav/features/workspace/search';
import { WorkspacePage } from '@nav/features/workspace/WorkspacePage';

import { rootRoute } from './__root';
import { requireAuth } from './guards';

/** 工作区（原侧边栏布局）：分类/标签/无标签/搜索/旧置顶链接全部由 URL search 参数驱动。 */
export const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspace',
  validateSearch: parseWorkspaceSearch,
  beforeLoad: (context) => {
    requireAuth(context);
    if (!isCanonicalWorkspaceSearch(context.location.search, context.search)) {
      throw redirect({
        to: '/workspace',
        search: context.search,
        hash: context.location.hash,
        replace: true,
      });
    }
  },
  component: WorkspacePage,
});
