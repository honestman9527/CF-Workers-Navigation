import { useState } from 'react';

import { ApiError } from '@nav/api/client';
import { BrandIcon } from '@nav/features/layout/BrandIcon';
import { FrontButton as Button, FrontInput as Input } from '@nav/features/navigation/controls';

export function LoginPage({ onSubmit }: { onSubmit: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <main className="front-surface flex min-h-dvh items-center justify-center bg-background px-4 py-12 text-foreground sm:px-6 sm:py-16">
      <form
        className="glass-surface w-full max-w-[24rem] rounded-2xl border border-border bg-card p-7 shadow-soft sm:p-8"
        onSubmit={async (event) => {
          event.preventDefault();
          setLoading(true);
          setError(null);
          try {
            await onSubmit(password);
          } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : '连接失败，请检查网络后重试');
          } finally {
            setLoading(false);
          }
        }}
      >
        <BrandIcon className="mb-5 size-11" />
        <h1 className="font-display text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">
          登录书签柜
        </h1>
        <p className="mt-2.5 text-sm leading-6 text-muted-foreground">
          输入管理员密码，查看私有书签并整理内容。
        </p>

        <div className="mt-7 flex flex-col gap-2">
          <label htmlFor="cabinet-password" className="text-sm font-semibold">
            密码
          </label>
          <Input
            id="cabinet-password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="管理员密码"
          />
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button
          tone="primary"
          className="mt-6 w-full"
          disabled={loading || !password.trim()}
          type="submit"
        >
          {loading ? '登录中…' : '登录'}
        </Button>
      </form>
    </main>
  );
}
