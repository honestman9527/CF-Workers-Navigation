// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { api } from '@nav/api/client';
import { TransferTab } from '@nav/features/admin/TransferTab';

import { buttonWithText, click, mount } from '../../render';

const mocks = vi.hoisted(() => ({ auth: { logout: vi.fn() } }));
vi.mock('@nav/features/auth/useAuthContext', () => ({ useAuthContext: () => mocks.auth }));
vi.mock('@nav/api/client', () => ({
  api: { importDataAuto: vi.fn() },
  ApiError: class extends Error {},
}));

let app: Awaited<ReturnType<typeof mount>>;
beforeEach(() => vi.clearAllMocks());
afterEach(async () => app?.cleanup());

async function selectFile(file: File) {
  const input = app.container.querySelector<HTMLInputElement>('input[type="file"]')!;
  await act(() => {
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

it.each([false, true])('取消导入结束等待并恢复操作（已上传完成：%s）', async (processing) => {
  const abort = vi.fn();
  vi.mocked(api.importDataAuto).mockImplementation((_content, _strategy, progress) => {
    let reject!: (error: DOMException) => void;
    const promise = new Promise<never>((_, fail) => {
      reject = fail;
    });
    abort.mockImplementation(() => reject(new DOMException('取消', 'AbortError')));
    progress?.(processing ? 100 : 10, 100);
    return { promise, abort };
  });
  app = await mount(<TransferTab />);
  const file = new File(['[]'], 'original.json');
  Object.defineProperty(file, 'text', { value: () => Promise.resolve('[]') });
  await selectFile(file);
  await click(buttonWithText(app.container, '开始导入'));
  expect(buttonWithText(app.container, '选择文件').disabled).toBe(true);
  await selectFile(new File(['{}'], 'other.json'));
  expect(app.container.textContent).toContain('original.json');
  expect(app.container.textContent).not.toContain('other.json');
  await click(buttonWithText(app.container, processing ? '停止等待' : '取消上传'));
  expect(abort).toHaveBeenCalledOnce();
  expect(buttonWithText(app.container, '选择文件').disabled).toBe(false);
  expect(buttonWithText(app.container, '开始导入').disabled).toBe(false);
  expect(app.container.textContent).toContain(processing ? '导入可能仍在继续' : '已取消上传');
  expect(app.container.textContent).not.toContain('导入失败');
});

it('读取文件时离开页面，读取完成后不会继续发送导入请求', async () => {
  app = await mount(<TransferTab />);
  let finishReading!: (value: string) => void;
  const file = new File(['[]'], 'original.json');
  Object.defineProperty(file, 'text', {
    value: () =>
      new Promise<string>((resolve) => {
        finishReading = resolve;
      }),
  });
  await selectFile(file);
  await click(buttonWithText(app.container, '开始导入'));
  await app.cleanup();
  await act(async () => finishReading('[]'));
  expect(api.importDataAuto).not.toHaveBeenCalled();
});
