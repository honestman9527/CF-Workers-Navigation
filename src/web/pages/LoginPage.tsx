import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { ApiError } from '@nav/api/client';
import { BrandIcon } from '@nav/features/layout/BrandIcon';
import { FrontButton as Button, FrontInput as Input } from '@nav/features/navigation/controls';

export function LoginPage({ onSubmit }: { onSubmit: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = '登录 · 书签柜';
  }, []);

  return (
    <main className="front-surface flex min-h-dvh items-center justify-center bg-background px-4 py-12 text-foreground sm:px-6 sm:py-16">
      <form
        noValidate
        className="glass-surface w-full max-w-sm rounded-2xl border border-border bg-card p-7 shadow-soft sm:p-8"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!password.trim()) {
            setError('请输入管理员密码');
            passwordInput.current?.focus();
            return;
          }
          setLoading(true);
          setError(null);
          try {
            await onSubmit(password);
          } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : '连接失败，请检查网络后重试');
            passwordInput.current?.focus();
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
          <div className="relative flex items-center">
            <Input
              ref={passwordInput}
              id="cabinet-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoFocus
              autoComplete="current-password"
              enterKeyHint="done"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'cabinet-password-error' : undefined}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (error) setError(null);
              }}
              placeholder="管理员密码"
              className="pr-12"
            />
            <button
              type="button"
              aria-pressed={showPassword}
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-1 grid size-10 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45"
            >
              {showPassword ? (
                <EyeOff aria-hidden="true" className="size-4" />
              ) : (
                <Eye aria-hidden="true" className="size-4" />
              )}
            </button>
          </div>
        </div>

        {error ? (
          <p id="cabinet-password-error" role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button tone="primary" className="mt-6 w-full" disabled={loading} type="submit">
          {loading ? '登录中…' : '登录'}
        </Button>
      </form>
    </main>
  );
}
