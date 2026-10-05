// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { api } from '@nav/api/client';
import { CategoriesTab } from '@nav/features/admin/CategoriesTab';
import { OverviewTab } from '@nav/features/admin/OverviewTab';
import { TagsTab } from '@nav/features/admin/TagsTab';

import { buttonWithText, click, fill, mount } from '../../render';

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@nav/features/auth/useAuthContext', () => ({
  useAuthContext: () => ({ logout: vi.fn() }),
}));
vi.mock('@nav/components/Toast', () => ({ pushToast: vi.fn() }));
vi.mock('@nav/features/visibility/VisibilityField', async (original) => ({
  ...(await original<object>()),
  useVisibilityDefaults: () => ({ data: { defaultCategoryVisibility: 'private' }, error: null }),
}));
vi.mock('@nav/api/client', () => ({
  api: {
    getCategories: vi.fn(),
    getTags: vi.fn(),
    getAdminStats: vi.fn(),
    createCategory: vi.fn(),
    createTag: vi.fn(),
    updateCategory: vi.fn(),
    updateTag: vi.fn(),
    mergeTag: vi.fn(),
    reorderCategories: vi.fn(),
  },
  ApiError: class extends Error {},
}));

const category = {
  id: 1,
  name: '现有分类',
  slug: 'existing',
  parentId: null,
  icon: null,
  sortOrder: 0,
  bookmarkCount: 2,
  visibility: 'private' as const,
  effectiveVisibility: 'private' as const,
};
const tag = { id: 1, name: '现有标签', slug: 'existing', bookmarkCount: 2 };
const cases = [
  {
    name: '分类',
    Component: CategoriesTab,
    load: () => vi.mocked(api.getCategories),
    data: [category],
    content: '现有分类',
    empty: '还没有分类',
  },
  {
    name: '标签',
    Component: TagsTab,
    load: () => vi.mocked(api.getTags),
    data: [tag],
    content: '现有标签',
    empty: '还没有标签',
  },
  {
    name: '概览',
    Component: OverviewTab,
    load: () => vi.mocked(api.getAdminStats),
    data: {
      bookmarks: { total: 8, active: 5, archived: 2, trash: 1, pinned: 2 },
      categories: 1,
      tags: 1,
    },
    content: '书签总数',
    empty: '当前共有',
  },
];
let app: Awaited<ReturnType<typeof mount>>;
beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(async () => {
  await app?.cleanup();
});

it.each(cases)(
  '$name 首次失败不显示空内容，重试成功恢复数据',
  async ({ Component, load, data, content, empty }) => {
    load()
      .mockRejectedValueOnce(new Error('连接失败'))
      .mockResolvedValueOnce(data as never);
    app = await mount(<Component />);
    expect(app.container.querySelector('[role="alert"]')?.textContent).toContain('连接失败');
    expect(app.container.textContent).not.toContain(empty);
    await click(buttonWithText(app.container, '重试'));
    expect(app.container.textContent).toContain(content);
    expect(app.container.querySelector('[role="alert"]')).toBeNull();
    expect(load()).toHaveBeenCalledTimes(2);
  },
);

it.each([
  {
    Component: CategoriesTab,
    load: () => vi.mocked(api.getCategories),
    data: [category],
    create: () => vi.mocked(api.createCategory),
    createText: '新建一级分类',
    createLabel: '分类名称',
    editLabel: '重命名分类',
  },
  {
    Component: TagsTab,
    load: () => vi.mocked(api.getTags),
    data: [tag],
    create: () => vi.mocked(api.createTag),
    createText: '新建标签',
    createLabel: '新标签名称',
    editLabel: '重命名标签',
  },
])(
  '刷新失败保留已有列表及尚未保存的编辑输入 ($editLabel)',
  async ({ Component, load, data, create, createText, createLabel, editLabel }) => {
    load()
      .mockResolvedValueOnce(data as never)
      .mockRejectedValueOnce(new Error('刷新失败'));
    create().mockResolvedValue({} as never);
    app = await mount(<Component />);
    await click(app.container.querySelector<HTMLButtonElement>('[aria-label="重命名"]')!);
    await fill(
      app.container.querySelector<HTMLInputElement>('[aria-label="' + editLabel + '"]')!,
      '未保存名称',
    );
    await click(buttonWithText(app.container, createText));
    await fill(
      app.container.querySelector<HTMLInputElement>('[aria-label="' + createLabel + '"]')!,
      '新增',
    );
    await click(app.container.querySelector<HTMLButtonElement>('[aria-label="确认创建"]')!);
    expect(app.container.textContent).toContain('刷新失败');
    expect(
      app.container.querySelector<HTMLInputElement>('[aria-label="' + editLabel + '"]')?.value,
    ).toBe('未保存名称');
    expect(app.container.querySelector('[data-slot="skeleton"]')).toBeNull();
  },
);

it('标签合并使用单选目标，失败保留选择并可重试', async () => {
  vi.mocked(api.getTags).mockResolvedValue([
    tag,
    { ...tag, id: 2, name: '目标标签', slug: 'target' },
  ]);
  vi.mocked(api.mergeTag)
    .mockRejectedValueOnce(new Error('合并失败'))
    .mockResolvedValueOnce({} as never);
  app = await mount(<TagsTab />);
  await click(app.container.querySelector<HTMLButtonElement>('[aria-label="合并标签"]')!);
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  const confirm = buttonWithText(dialog, '确认合并');
  expect(confirm.disabled).toBe(true);
  await click(dialog.querySelector<HTMLElement>('[role="radio"]')!);
  expect(confirm.disabled).toBe(false);
  await click(confirm);
  expect(dialog.textContent).toContain('操作失败，请重试');
  expect(dialog.querySelector('[role="radio"]')?.getAttribute('aria-checked')).toBe('true');
  await click(confirm);
  expect(api.mergeTag).toHaveBeenLastCalledWith('', 1, 2);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it('只有一个标签时说明没有目标，不能合并', async () => {
  vi.mocked(api.getTags).mockResolvedValue([tag]);
  app = await mount(<TagsTab />);
  await click(app.container.querySelector<HTMLButtonElement>('[aria-label="合并标签"]')!);
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.textContent).toContain('没有可用的目标标签');
  expect(buttonWithText(dialog, '确认合并').disabled).toBe(true);
  expect(api.mergeTag).not.toHaveBeenCalled();
});

it('分类菜单排序刷新保留展开状态，新建子类入口仍展开父分类', async () => {
  const child = { ...category, id: 2, name: '已有子项', slug: 'child', parentId: 1 };
  const sibling = { ...category, id: 3, name: '另一个分类', slug: 'other', sortOrder: 1 };
  vi.mocked(api.getCategories).mockResolvedValue([category, child, sibling]);
  vi.mocked(api.reorderCategories).mockResolvedValue({} as never);
  app = await mount(<CategoriesTab />);
  expect(app.container.textContent).not.toContain('已有子项');
  await click(app.container.querySelector<HTMLButtonElement>('[aria-label="展开分类"]')!);
  await click(
    app.container.querySelector<HTMLButtonElement>('[aria-label="现有分类 的更多操作"]')!,
  );
  const down = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => item.textContent?.trim() === '下移',
  )!;
  await click(down);
  expect(api.reorderCategories).toHaveBeenCalledWith('', [3, 1]);
  expect(app.container.textContent).toContain('已有子项');
  await click(app.container.querySelector<HTMLButtonElement>('[aria-label="收起分类"]')!);
  await click(
    app.container.querySelector<HTMLButtonElement>('[aria-label="在 现有分类 下新建子分类"]')!,
  );
  expect(app.container.textContent).toContain('已有子项');
  expect(app.container.querySelector('[aria-label="分类名称"]')).not.toBeNull();
});
