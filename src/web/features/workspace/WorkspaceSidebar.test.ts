// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import { SidebarProvider } from '@/components/ui/sidebar';

import { WorkspaceSidebar } from './WorkspaceSidebar';

it('三个分组独立折叠，全部网站保持可访问，选择分类后展开分组', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  localStorage.clear();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = async (search = {}) =>
    act(async () =>
      root.render(
        createElement(
          SidebarProvider,
          {},
          createElement(WorkspaceSidebar, { categories: [], tags: [], search, onSelect: vi.fn() }),
        ),
      ),
    );
  try {
    await render();
    const triggers = () => [
      ...container.querySelectorAll<HTMLButtonElement>('button[aria-expanded]'),
    ];
    expect(triggers()).toHaveLength(3);
    await act(() => triggers()[1].click());
    expect(triggers()[1].getAttribute('aria-expanded')).toBe('false');
    expect(triggers()[2].getAttribute('aria-expanded')).toBe('true');
    expect(localStorage.getItem('nav-sidebar-groups')).toContain('"categories":false');
    expect(container.textContent).toContain('全部网站');
    expect(container.textContent).toContain('无标签');
    await act(() => triggers()[0].click());
    expect(triggers()[0].getAttribute('aria-expanded')).toBe('false');
    expect(localStorage.getItem('nav-sidebar-groups')).toContain('"all":false');
    expect(container.textContent).toContain('全部网站');
    await render({ untagged: true });
    expect(triggers()[0].getAttribute('aria-expanded')).toBe('true');
    await render({ category: 'dev' });
    expect(triggers()[1].getAttribute('aria-expanded')).toBe('true');
  } finally {
    await act(() => root.unmount());
    container.remove();
  }
});
