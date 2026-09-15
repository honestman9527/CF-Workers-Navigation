import type { Settings } from '@shared/api/types';

import { createStore, Provider } from 'jotai';
// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { api } from '@nav/api/client';
import { settingsStateAtom } from '@nav/features/settings/store';

import { SettingsTab } from './SettingsTab';

vi.mock('@nav/api/client', () => ({
  api: { getSettings: vi.fn(), updateSettings: vi.fn() },
  ApiError: class extends Error {},
}));
vi.mock('@nav/features/auth/useAuthContext', () => ({
  useAuthContext: () => ({ logout: vi.fn() }),
}));
vi.mock('@nav/components/Toast', () => ({ pushToast: vi.fn() }));
const saved: Settings = {
  faviconProxyUrl: 'https://icon.horse/icon/{domain}',
  faviconProxyEnabled: true,
  backgroundImageUrl: '',
  backgroundImageEnabled: false,
  defaultEngineId: 'google',
  searchEngines: [
    { id: 'google', name: 'Google', url: 'https://google.com/search?q={query}', builtin: true },
  ],
};
let root: Root;
let container: HTMLDivElement;
let store: ReturnType<typeof createStore>;
async function click(label: string) {
  const button = [...container.querySelectorAll('button')].find(
    (item) => item.textContent === label,
  );
  expect(button, label).toBeTruthy();
  await act(async () => button!.click());
}
async function change(id: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`#${id}`)!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  vi.mocked(api.getSettings).mockResolvedValue(saved);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  store = createStore();
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
});
async function render() {
  await act(async () =>
    root.render(createElement(Provider, { store }, createElement(SettingsTab))),
  );
}
it('跨标签保留草稿，撤销恢复所有已保存值', async () => {
  await render();
  await change('background-url', 'https://example.com/new.jpg');
  await click('网站图标');
  await click('自定义');
  await click('外观');
  expect(container.querySelector<HTMLInputElement>('#background-url')!.value).toBe(
    'https://example.com/new.jpg',
  );
  await click('撤销修改');
  expect(container.querySelector<HTMLInputElement>('#background-url')!.value).toBe('');
  await click('网站图标');
  expect(container.querySelector<HTMLInputElement>('#favicon-url')!.value).toBe(
    saved.faviconProxyUrl,
  );
  expect(api.getSettings).toHaveBeenCalledOnce();
});
it('保存失败保留草稿，重试保存更新快照和共享缓存', async () => {
  await render();
  await change('background-url', 'https://example.com/new.jpg');
  vi.mocked(api.updateSettings).mockRejectedValueOnce(new Error('保存失败'));
  await click('保存设置');
  expect(container.textContent).toContain('保存失败');
  expect(container.querySelector<HTMLInputElement>('#background-url')!.value).toBe(
    'https://example.com/new.jpg',
  );
  const updated = { ...saved, backgroundImageUrl: 'https://example.com/new.jpg' };
  vi.mocked(api.updateSettings).mockResolvedValue(updated);
  await click('保存设置');
  expect(store.get(settingsStateAtom).settings).toEqual(updated);
  expect(container.textContent).toContain('所有修改已保存');
  await change('background-url', 'https://example.com/other.jpg');
  await click('撤销修改');
  expect(container.querySelector<HTMLInputElement>('#background-url')!.value).toBe(
    updated.backgroundImageUrl,
  );
});
it('加载失败显示重试并能恢复表单', async () => {
  vi.mocked(api.getSettings).mockRejectedValueOnce(new Error('加载失败'));
  await render();
  expect(container.textContent).toContain('加载失败');
  await click('重试');
  expect(container.querySelector('#background-url')).not.toBeNull();
});
it('保存时切换到无效字段所在标签页', async () => {
  await render();
  await change('background-url', 'bad-url');
  await click('搜索引擎');
  await click('保存设置');
  expect(container.querySelector('#background-url')?.getAttribute('aria-invalid')).toBe('true');
  expect(api.updateSettings).not.toHaveBeenCalled();
});
