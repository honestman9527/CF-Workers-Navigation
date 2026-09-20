import type { Category } from '@shared/api/types';

// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import { CategoryTree } from '../categories/CategoryTree';
import { WorkspaceSidebar } from '../workspace/WorkspaceSidebar';
import { AppShell, WorkspaceSidebarTrigger } from './AppShell';

async function setup(width = 1440) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.matchMedia = vi.fn().mockReturnValue({
    matches: width < 1024,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const select = vi.fn();
  await act(async () =>
    root.render(
      <AppShell
        header={<WorkspaceSidebarTrigger />}
        brand={<button type="button">书签柜品牌</button>}
        sidebar={<WorkspaceSidebar categories={[]} tags={[]} search={{}} onSelect={select} />}
      >
        <p>内容</p>
      </AppShell>,
    ),
  );
  return {
    container,
    select,
    cleanup: async () => {
      await act(() => root.unmount());
      container.remove();
    },
  };
}

it('桌面可收起、快捷键展开，刷新恢复偏好且隐藏内容不可聚焦', async () => {
  localStorage.clear();
  const app = await setup();
  try {
    const trigger = app.container.querySelector<HTMLButtonElement>('[data-sidebar="trigger"]')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.closest('main')).not.toBeNull();
    expect(app.container.querySelector('[data-sidebar="header"]')?.textContent).toBe('书签柜品牌');
    expect(app.container.querySelector('[data-sidebar="header"]')?.closest('main')).toBeNull();

    await act(() => trigger.click());
    expect(trigger.getAttribute('aria-label')).toBe('展开索引');
    expect(
      app.container.querySelector('[data-sidebar="content"]')?.parentElement?.hasAttribute('inert'),
    ).toBe(true);
    expect(localStorage.getItem('nav-workspace-sidebar-open')).toBe('false');
    await act(() =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true })),
    );
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    await act(() => trigger.click());
  } finally {
    await app.cleanup();
  }
  const restored = await setup();
  try {
    expect(
      restored.container.querySelector('[data-sidebar="trigger"]')?.getAttribute('aria-expanded'),
    ).toBe('false');
  } finally {
    await restored.cleanup();
  }
});

it('移动抽屉选择后关闭，不改变桌面偏好', async () => {
  localStorage.setItem('nav-workspace-sidebar-open', 'false');
  const app = await setup(375);
  try {
    const trigger = app.container.querySelector<HTMLButtonElement>('[data-sidebar="trigger"]')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await act(() => trigger.click());
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const all = [
      ...document.querySelectorAll<HTMLButtonElement>('[data-mobile="true"] button'),
    ].find((button) => button.textContent?.includes('全部网站'))!;
    await act(() => all.click());
    expect(app.select).toHaveBeenCalledWith({});
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(localStorage.getItem('nav-workspace-sidebar-open')).toBe('false');
  } finally {
    await app.cleanup();
  }
});

it('紧凑分类独立展开、显示继承权限并保留筛选行为', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const parent: Category = {
    id: 1,
    parentId: null,
    name: '长分类名称',
    slug: 'parent',
    icon: null,
    sortOrder: 0,
    bookmarkCount: 12345,
    visibility: 'private',
    effectiveVisibility: 'private',
  };
  const child: Category = {
    ...parent,
    id: 2,
    parentId: 1,
    name: '子分类',
    slug: 'child',
    visibility: 'public',
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const select = vi.fn();
  try {
    await act(() =>
      root.render(
        <CategoryTree compact showCount categories={[parent, child]} onSelect={select} />,
      ),
    );
    const expand = container.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
    await act(() => expand.click());
    expect(select).not.toHaveBeenCalled();
    expect(expand.getAttribute('aria-expanded')).toBe('true');
    const childButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="子分类，受上级分类限制"]',
    )!;
    expect(childButton).not.toBeNull();
    expect(container.textContent).not.toContain('LV');
    await act(() => childButton.click());
    expect(select).toHaveBeenCalledWith('child');
  } finally {
    await act(() => root.unmount());
    container.remove();
  }
});
