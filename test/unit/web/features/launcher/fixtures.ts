import type { Bookmark } from '@shared/api/types';

export function bookmark(id = 1, overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id,
    title: `网站 ${id}`,
    url: `https://example${id}.com/path`,
    description: null,
    iconUrl: null,
    visibility: 'public',
    effectiveVisibility: 'public',
    tags: [],
    isPinned: true,
    categoryId: null,
    categoryName: null,
    categorySlug: null,
    archivedAt: null,
    deletedAt: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}
