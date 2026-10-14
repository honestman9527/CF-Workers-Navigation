// @vitest-environment jsdom
import type { PublicSettings } from '@shared/api/types';

import { Provider, createStore } from 'jotai';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { api } from '@nav/api/client';
import { updateSettingsCacheAtom } from '@nav/features/settings/store';
import { useSettings } from '@nav/hooks/useSettings';

import { buttonWithText, click, mount } from '../../render';

vi.mock('@nav/api/client', () => ({
  api: { getPublicSettings: vi.fn() },
  ApiError: class extends Error {},
}));

const settings: PublicSettings = {
  searchEngines: [],
  defaultEngineId: 'google',
  backgroundImageUrl: '',
  backgroundImageEnabled: false,
};
let app: Awaited<ReturnType<typeof mount>>;
beforeEach(() => vi.clearAllMocks());
afterEach(async () => app?.cleanup());

function Consumer({ label }: { label: string }) {
  const { settings, error, loading, retry } = useSettings();
  return (
    <section aria-label={label}>
      <p>{loading ? '正在加载' : settings?.defaultEngineId}</p>
      {error ? <p role="alert">{error}</p> : null}
      <button disabled={loading} onClick={retry}>
        重试{label}
      </button>
    </section>
  );
}

it('同时挂载的消费者共享在途请求，刷新失败保留已加载设置且可重试', async () => {
  let resolve!: (value: PublicSettings) => void;
  vi.mocked(api.getPublicSettings).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  app = await mount(
    <Provider store={createStore()}>
      <Consumer label="前台" />
      <Consumer label="菜单" />
    </Provider>,
  );
  expect(api.getPublicSettings).toHaveBeenCalledOnce();
  expect(app.container.querySelectorAll('button:disabled')).toHaveLength(2);
  await act(() => resolve(settings));
  expect(app.container.textContent).toContain('google');
  vi.mocked(api.getPublicSettings).mockRejectedValueOnce(new Error('网络中断'));
  await click(buttonWithText(app.container, '重试前台'));
  expect(app.container.querySelectorAll('[role="alert"]')).toHaveLength(2);
  expect(app.container.querySelector('[aria-label="前台"]')?.textContent).toContain('google');
  vi.mocked(api.getPublicSettings).mockResolvedValueOnce({ ...settings, defaultEngineId: 'bing' });
  await click(buttonWithText(app.container, '重试菜单'));
  expect(app.container.querySelectorAll('[role="alert"]')).toHaveLength(0);
  expect(app.container.querySelector('[aria-label="前台"]')?.textContent).toContain('bing');
  expect(api.getPublicSettings).toHaveBeenCalledTimes(3);
});

it('保存设置更新共享缓存后，先前在途响应不会覆盖新设置', async () => {
  let resolve!: (value: PublicSettings) => void;
  vi.mocked(api.getPublicSettings).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const store = createStore();
  app = await mount(
    <Provider store={store}>
      <Consumer label="前台" />
    </Provider>,
  );
  await act(() => store.set(updateSettingsCacheAtom, { ...settings, defaultEngineId: 'bing' }));
  await act(() => resolve(settings));
  expect(app.container.textContent).toContain('bing');
  expect(app.container.textContent).not.toContain('google');
});

it('身份变化中断首次请求后重新加载，不停留在无设置状态', async () => {
  vi.mocked(api.getPublicSettings)
    .mockRejectedValueOnce(new DOMException('请求已取消', 'AbortError'))
    .mockResolvedValueOnce(settings);
  app = await mount(
    <Provider store={createStore()}>
      <Consumer label="前台" />
    </Provider>,
  );
  expect(api.getPublicSettings).toHaveBeenCalledTimes(2);
  expect(app.container.textContent).toContain('google');
  expect(app.container.querySelector('[role="alert"]')).toBeNull();
});
