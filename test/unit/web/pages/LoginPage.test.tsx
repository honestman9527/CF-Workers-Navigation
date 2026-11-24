// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ApiError } from '@nav/api/client';
import { LoginPage } from '@nav/pages/LoginPage';

import { buttonWithText, click, fill, mount } from '../render';

vi.mock('@nav/features/layout/BrandIcon', () => ({ BrandIcon: () => null }));

let app: Awaited<ReturnType<typeof mount>>;

beforeEach(() => {
  vi.clearAllMocks();
  document.title = '';
});

afterEach(async () => {
  await app?.cleanup();
});

it('更新页面标题，支持显示/隐藏密码切换并在空提交时以无障碍关联提示错误', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  app = await mount(<LoginPage onSubmit={onSubmit} />);

  expect(document.title).toBe('登录 · 书签柜');

  const input = app.container.querySelector<HTMLInputElement>('#cabinet-password')!;
  const toggle = app.container.querySelector<HTMLButtonElement>('[aria-label="显示密码"]')!;
  const submit = buttonWithText(app.container, '登录');

  expect(input.type).toBe('password');
  expect(toggle.getAttribute('aria-pressed')).toBe('false');
  expect(submit.disabled).toBe(false);

  // 切换密码可见性
  await click(toggle);
  expect(input.type).toBe('text');
  expect(toggle.getAttribute('aria-pressed')).toBe('true');
  expect(toggle.getAttribute('aria-label')).toBe('隐藏密码');

  // 空提交显示校验提示并聚焦密码框
  await click(submit);
  expect(onSubmit).not.toHaveBeenCalled();
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(input.getAttribute('aria-describedby')).toBe('cabinet-password-error');
  expect(app.container.querySelector('#cabinet-password-error')?.textContent).toBe(
    '请输入管理员密码',
  );
  expect(document.activeElement).toBe(input);

  // 输入内容后清除错误
  await fill(input, 'secret-pass');
  expect(input.getAttribute('aria-invalid')).toBe('false');
  expect(app.container.querySelector('#cabinet-password-error')).toBeNull();
});

it('提交中禁用登录按钮，接口报错后展示错误并重新聚焦密码输入框', async () => {
  let rejectSubmit!: (error: unknown) => void;
  const onSubmit = vi.fn(
    () =>
      new Promise<void>((_resolve, reject) => {
        rejectSubmit = reject;
      }),
  );
  app = await mount(<LoginPage onSubmit={onSubmit} />);

  const input = app.container.querySelector<HTMLInputElement>('#cabinet-password')!;
  const submit = buttonWithText(app.container, '登录');
  await fill(input, 'wrong-password');
  await click(submit);

  expect(onSubmit).toHaveBeenCalledWith('wrong-password');
  expect(submit.disabled).toBe(true);
  expect(submit.textContent?.trim()).toBe('登录中…');

  await act(async () => {
    rejectSubmit(new ApiError(401, '密码错误'));
  });

  expect(submit.disabled).toBe(false);
  expect(app.container.querySelector('[role="alert"]')?.textContent).toBe('密码错误');
  expect(document.activeElement).toBe(input);
});
