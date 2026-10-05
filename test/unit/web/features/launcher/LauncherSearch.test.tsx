// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { LauncherSearch } from '@nav/features/launcher/LauncherSearch';
import { DEFAULT_SEARCH_ENGINES } from '@shared/search';

import { click, mount } from '../../render';

let app: Awaited<ReturnType<typeof mount>>;
afterEach(async () => {
  await app?.cleanup();
  vi.restoreAllMocks();
});

async function setup(query = 'hello') {
  const onQueryChange = vi.fn();
  const onHighlightChange = vi.fn();
  app = await mount(
    <LauncherSearch
      engines={DEFAULT_SEARCH_ENGINES}
      query={query}
      onQueryChange={onQueryChange}
      activeEngineId={DEFAULT_SEARCH_ENGINES[0].id}
      onEngineChange={vi.fn()}
      searchQuery={query}
      hasBang={false}
      activeEngine={DEFAULT_SEARCH_ENGINES[0]}
      results={[]}
      hasMore={false}
      loadingMore={false}
      onLoadMore={vi.fn()}
      highlighted={-1}
      onHighlightChange={onHighlightChange}
    />,
  );
  return { input: app.container.querySelector('input')!, onQueryChange, onHighlightChange };
}

it('中文输入法的确认与取消不会打开网页、清空搜索或切换结果', async () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  const { input, onQueryChange, onHighlightChange } = await setup();
  for (const key of ['Enter', 'Escape', 'ArrowDown']) {
    await act(() =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key, isComposing: true, bubbles: true })),
    );
  }
  await act(() =>
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true }),
    ),
  );
  expect(open).not.toHaveBeenCalled();
  expect(onQueryChange).not.toHaveBeenCalled();
  expect(onHighlightChange).not.toHaveBeenCalled();
  await act(() =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
  );
  expect(open).toHaveBeenCalledOnce();
});

it('清空按钮清除搜索并保持输入焦点', async () => {
  const { input, onQueryChange } = await setup();
  await click(app.container.querySelector<HTMLButtonElement>('[aria-label="清除搜索"]')!);
  expect(onQueryChange).toHaveBeenCalledWith('');
  expect(document.activeElement).toBe(input);
});

it('搜索快捷键尊重可编辑区域和组合快捷键', async () => {
  const { input } = await setup('');
  const editor = document.createElement('div');
  editor.setAttribute('contenteditable', 'true');
  document.body.append(editor);
  try {
    input.blur();
    await act(() =>
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true })),
    );
    expect(document.activeElement).not.toBe(input);
    await act(() =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', ctrlKey: true })),
    );
    expect(document.activeElement).not.toBe(input);
    await act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '/' })));
    expect(document.activeElement).toBe(input);
  } finally {
    editor.remove();
  }
});
