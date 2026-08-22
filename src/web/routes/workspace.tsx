import { createRoute } from '@tanstack/react-router';

import { parseWorkspaceSearch } from '@nav/features/workspace/search';
import { WorkspacePage } from '@nav/features/workspace/WorkspacePage';

import { rootRoute } from './__root';
import { requireAuth } from './guards';

/** 工作区（原侧边栏布局）：视图/分类/标签/搜索/置顶全部由 URL search 参数驱动。 */
export const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspace',
  validateSearch: parseWorkspaceSearch,
  beforeLoad: requireAuth,
  component: WorkspacePage,
});
