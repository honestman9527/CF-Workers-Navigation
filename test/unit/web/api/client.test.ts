// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

import { api } from '@nav/api/client';

afterEach(() => vi.unstubAllGlobals());

it('取消导入会拒绝 Promise，使调用方可以结束等待', async () => {
  class FakeXHR {
    upload = {};
    onabort?: () => void;
    open() {}
    setRequestHeader() {}
    send() {}
    abort() {
      this.onabort?.();
    }
  }
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
  const { promise, abort } = api.importDataAuto('[]');
  const rejection = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  abort();
  await rejection;
});
