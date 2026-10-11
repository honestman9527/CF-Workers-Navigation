import { createRoute } from '@tanstack/react-router';

import { NavigationPage } from '@nav/features/navigation/NavigationPage';
import { parseNavigationSearch } from '@nav/features/navigation/search';

import { rootRoute } from './__root';

/** 统一导航首页；搜索、筛选与分类定位可通过 URL 恢复。 */
export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: parseNavigationSearch,
  component: NavigationPage,
});
